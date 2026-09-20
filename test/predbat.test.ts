import { describe, expect, it } from 'vitest';
import {
  hasWindowIn,
  parseBatteryWindows,
  parseChargeWindows,
  parseExportWindows,
  parseForecastRates,
  parseResults,
  predbatEntityIds,
  windowLabels,
  windowTitle,
} from '../src/predbat';

const ent = (results: unknown) => ({ state: 'x', attributes: { results } });
const pad = (n: number) => String(n).padStart(2, '0');
const t = (day: number, h: number, m = 0) => new Date(`2026-09-${day}T${pad(h)}:${pad(m)}:00+01:00`).getTime();
const HORIZON = t(21, 2);

// Excerpts of a real install's predbat.best_charge_limit / best_export_limit `results`.
// Predbat writes offsets as +0100, with no colon.
const charge = ent({
  '2026-09-20T00:00:00+0100': 0,
  '2026-09-20T02:00:00+0100': 100,
  '2026-09-20T02:10:00+0100': 0,
  '2026-09-20T02:30:00+0100': 100,
  '2026-09-20T04:00:00+0100': 0,
});
const exp = ent({
  '2026-09-20T00:00:00+0100': 100,
  '2026-09-20T01:00:00+0100': 15,
  '2026-09-20T02:00:00+0100': 100,
  '2026-09-20T02:10:00+0100': 6,
  '2026-09-20T02:30:00+0100': 100,
});

describe('predbatEntityIds', () => {
  it('derives both entities from the prefix', () => {
    expect(predbatEntityIds('predbat')).toEqual({
      charge: 'predbat.best_charge_limit',
      export: 'predbat.best_export_limit',
      rates: 'predbat.rates',
    });
    expect(predbatEntityIds('predbat_2').charge).toBe('predbat_2.best_charge_limit');
  });
});

describe('parseResults', () => {
  it('reads timestamps with a colon-less offset (Safari cannot parse them without help)', () => {
    expect(parseResults(ent({ '2026-09-20T02:00:00+0100': 100 }))).toEqual([[t(20, 2), 100]]);
    expect(parseResults(ent({ '2026-09-20T02:00:00-0530': 100 }))[0][0]).toBe(
      new Date('2026-09-20T02:00:00-05:30').getTime(),
    );
  });

  it('also accepts a standard ISO offset', () => {
    expect(parseResults(ent({ '2026-09-20T02:00:00+01:00': 100 }))).toEqual([[t(20, 2), 100]]);
  });

  it('sorts by time regardless of key order', () => {
    const pts = parseResults(ent({ '2026-09-20T04:00:00+0100': 0, '2026-09-20T02:00:00+0100': 100 }));
    expect(pts.map((p) => p[1])).toEqual([100, 0]);
  });

  it('skips bad keys and values, and accepts numeric strings', () => {
    const pts = parseResults(
      ent({
        nope: 1,
        '2026-09-20T02:00:00+0100': 'x',
        '2026-09-20T03:00:00+0100': '',
        '2026-09-20T04:00:00+0100': '50',
      }),
    );
    expect(pts).toEqual([[t(20, 4), 50]]);
  });

  it('returns [] for a missing entity, missing attribute or non-object attribute', () => {
    expect(parseResults(undefined)).toEqual([]);
    expect(parseResults({ state: 'x', attributes: {} })).toEqual([]);
    expect(parseResults(ent('nope'))).toEqual([]);
    expect(parseResults(ent([1, 2]))).toEqual([]);
    expect(parseResults(ent(null))).toEqual([]);
  });
});

describe('parseChargeWindows', () => {
  it('makes a window from each run of a non-zero limit', () => {
    expect(parseChargeWindows(charge, HORIZON)).toEqual([
      { start: t(20, 2), end: t(20, 2, 10), kind: 'charge', target: 100 },
      { start: t(20, 2, 30), end: t(20, 4), kind: 'charge', target: 100 },
    ]);
  });

  it('runs a window that is still open at the last change point to the horizon', () => {
    const open = ent({ '2026-09-20T00:00:00+0100': 0, '2026-09-20T19:00:00+0100': 100 });
    expect(parseChargeWindows(open, HORIZON)).toEqual([
      { start: t(20, 19), end: HORIZON, kind: 'charge', target: 100 },
    ]);
  });

  it('splits when the target changes without a gap, and rounds fractional targets', () => {
    const w = parseChargeWindows(
      ent({ '2026-09-20T02:00:00+0100': 60, '2026-09-20T03:00:00+0100': 79.6, '2026-09-20T04:00:00+0100': 0 }),
      HORIZON,
    );
    expect(w.map((x) => [x.start, x.end, x.target])).toEqual([
      [t(20, 2), t(20, 3), 60],
      [t(20, 3), t(20, 4), 80],
    ]);
  });

  it('gives no windows for a plan that never charges', () => {
    expect(parseChargeWindows(ent({ '2026-09-20T00:00:00+0100': 0 }), HORIZON)).toEqual([]);
    expect(parseChargeWindows(undefined, HORIZON)).toEqual([]);
  });
});

describe('parseExportWindows', () => {
  it('treats 100 as idle and anything lower as a discharge target', () => {
    expect(parseExportWindows(exp, HORIZON)).toEqual([
      { start: t(20, 1), end: t(20, 2), kind: 'discharge', target: 15 },
      { start: t(20, 2, 10), end: t(20, 2, 30), kind: 'discharge', target: 6 },
    ]);
  });

  it('ignores freeze (99), which is not a forced discharge', () => {
    const freeze = ent({ '2026-09-20T01:00:00+0100': 99, '2026-09-20T02:00:00+0100': 100 });
    expect(parseExportWindows(freeze, HORIZON)).toEqual([]);
  });

  it('drops the fraction that encodes a reduced export power', () => {
    const [w] = parseExportWindows(ent({ '2026-09-20T01:00:00+0100': 15.5, '2026-09-20T02:00:00+0100': 100 }), HORIZON);
    expect(w.target).toBe(15);
  });

  it('keeps a discharge to 0%', () => {
    const [w] = parseExportWindows(ent({ '2026-09-20T01:00:00+0100': 0, '2026-09-20T02:00:00+0100': 100 }), HORIZON);
    expect(w.target).toBe(0);
  });
});

describe('parseBatteryWindows', () => {
  it('interleaves both kinds in start order', () => {
    expect(parseBatteryWindows(charge, exp, HORIZON).map((w) => `${w.kind}@${w.start}`)).toEqual([
      `discharge@${t(20, 1)}`,
      `charge@${t(20, 2)}`,
      `discharge@${t(20, 2, 10)}`,
      `charge@${t(20, 2, 30)}`,
    ]);
  });

  it('works when only one entity exists', () => {
    expect(parseBatteryWindows(charge, undefined, HORIZON)).toHaveLength(2);
    expect(parseBatteryWindows(undefined, undefined, HORIZON)).toEqual([]);
  });
});

describe('windowLabels', () => {
  const w = (kind: 'charge' | 'discharge', target: number) => ({ start: 0, end: 1, kind, target });

  it('leaves the target off a 100% charge', () => {
    expect(windowLabels(w('charge', 100))).toEqual(['▲ Charge', '▲']);
  });

  it('shows a charge target other than 100%', () => {
    expect(windowLabels(w('charge', 80))).toEqual(['▲ Charge · 80%', '▲ 80%', '▲']);
  });

  it('always shows the discharge target', () => {
    expect(windowLabels(w('discharge', 16))).toEqual(['▼ Discharge · 16%', '▼ 16%', '▼']);
  });
});

describe('windowTitle', () => {
  it('names the kind, target and times', () => {
    expect(windowTitle({ start: t(20, 2), end: t(20, 4), kind: 'charge', target: 100 })).toMatch(
      /^Charge to 100%, \d\d:\d\d–\d\d:\d\d$/,
    );
    expect(windowTitle({ start: t(20, 2), end: t(20, 4), kind: 'discharge', target: 15 })).toMatch(/^Discharge to 15%/);
  });
});

describe('hasWindowIn', () => {
  const w = { start: t(20, 2), end: t(20, 4), kind: 'charge' as const, target: 100 };

  it('is true when a window overlaps the range, including partly', () => {
    expect(hasWindowIn([w], t(20, 0), t(20, 3))).toBe(true);
    expect(hasWindowIn([w], t(20, 3), t(20, 12))).toBe(true);
  });

  it('is false with no windows or none in range, including one that only touches the edge', () => {
    expect(hasWindowIn([], t(20, 0), t(21, 0))).toBe(false);
    expect(hasWindowIn([w], t(20, 4), t(20, 12))).toBe(false);
    expect(hasWindowIn([w], t(19, 0), t(20, 2))).toBe(false);
  });
});

describe('parseForecastRates', () => {
  // Excerpt of predbat.rates `results`: half-hourly, in pence.
  const rates = ent({
    '2026-09-20T22:00:00+0100': 13.25,
    '2026-09-20T22:30:00+0100': 7.52,
    '2026-09-20T23:00:00+0100': -0.2,
    '2026-09-20T23:30:00+0100': -3.51,
  });

  it('keeps only the time after the real rates end, so published rates always win', () => {
    expect(parseForecastRates(rates, 1, t(20, 23))).toEqual([
      { start: t(20, 23), end: t(20, 23, 30), value: -0.2 },
      { start: t(20, 23, 30), end: t(20, 24), value: -3.51 },
    ]);
  });

  it('starts a slot that straddles the cut-off at the cut-off', () => {
    const [first] = parseForecastRates(rates, 1, t(20, 22, 45));
    expect(first).toEqual({ start: t(20, 22, 45), end: t(20, 23), value: 7.52 });
  });

  it('converts pence to the display unit', () => {
    expect(parseForecastRates(rates, 0.01, t(20, 23))[0].value).toBeCloseTo(-0.002);
  });

  it('gives nothing when the real rates already cover the plan, or there is no plan', () => {
    expect(parseForecastRates(rates, 1, t(21, 12))).toEqual([]);
    expect(parseForecastRates(undefined, 1, t(20, 23))).toEqual([]);
    expect(parseForecastRates({ state: 'x', attributes: {} }, 1, t(20, 23))).toEqual([]);
  });
});
