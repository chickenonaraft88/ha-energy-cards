import { describe, expect, it } from 'vitest';
import {
  clampHours,
  currentSlotStart,
  fmtTime,
  mergeRates,
  nextSlotStart,
  parseRates,
  parseSessions,
  parseStateNumber,
  rateAt,
  sessionActive,
  slotOverlapsSession,
} from '../src/data';

const ent = (attributes: Record<string, unknown>) => ({ state: 'x', attributes });
const iso = (h: number, m = 0) => new Date(2026, 0, 15, h, m).toISOString();
const at = (h: number, m = 0) => new Date(2026, 0, 15, h, m).getTime();

describe('parseRates', () => {
  it('converts £ to pence using the multiplier', () => {
    const rates = parseRates(ent({ rates: [{ start: iso(10), end: iso(10, 30), value_inc_vat: 0.2345 }] }), 100);
    expect(rates).toHaveLength(1);
    expect(rates[0].value).toBeCloseTo(23.45);
    expect(rates[0].start).toBe(at(10));
    expect(rates[0].end).toBe(at(10, 30));
  });

  it('respects a multiplier of 1 for values already in pence', () => {
    const rates = parseRates(ent({ rates: [{ start: iso(10), end: iso(10, 30), value_inc_vat: 12 }] }), 1);
    expect(rates[0].value).toBe(12);
  });

  it('defaults a missing end to a 30 minute slot', () => {
    const [r] = parseRates(ent({ rates: [{ start: iso(10), value_inc_vat: 0.1 }] }), 100);
    expect(r.end - r.start).toBe(30 * 60 * 1000);
  });

  it('skips entries with a bad start or value', () => {
    const rates = parseRates(
      ent({
        rates: [
          { start: 'nope', value_inc_vat: 0.1 },
          { start: iso(10), value_inc_vat: 'abc' },
          { start: iso(11), value_inc_vat: 0.1 },
        ],
      }),
      100,
    );
    expect(rates).toHaveLength(1);
    expect(rates[0].start).toBe(at(11));
  });

  it('returns [] for a missing entity or non-array attribute', () => {
    expect(parseRates(undefined, 100)).toEqual([]);
    expect(parseRates(ent({ rates: 'nope' }), 100)).toEqual([]);
  });
});

describe('mergeRates', () => {
  it('sorts by start and lets later lists win on identical starts', () => {
    const a = [
      { start: 2, end: 3, value: 1 },
      { start: 1, end: 2, value: 1 },
    ];
    const b = [{ start: 2, end: 3, value: 9 }];
    expect(mergeRates(a, b)).toEqual([
      { start: 1, end: 2, value: 1 },
      { start: 2, end: 3, value: 9 },
    ]);
  });
});

describe('rateAt', () => {
  const rates = [
    { start: 0, end: 10, value: 1 },
    { start: 10, end: 20, value: 2 },
  ];
  it('treats start as inclusive and end as exclusive', () => {
    expect(rateAt(rates, 0)?.value).toBe(1);
    expect(rateAt(rates, 10)?.value).toBe(2);
    expect(rateAt(rates, 20)).toBeUndefined();
  });
});

describe('parseSessions', () => {
  it('parses start/end from the named attribute', () => {
    const s = parseSessions(ent({ joined_events: [{ start: iso(17, 30), end: iso(18, 30) }] }), 'joined_events');
    expect(s).toEqual([{ start: at(17, 30), end: at(18, 30) }]);
  });

  it('falls back to duration_in_minutes when end is missing', () => {
    const s = parseSessions(ent({ joined_events: [{ start: iso(17), duration_in_minutes: 60 }] }), 'joined_events');
    expect(s).toEqual([{ start: at(17), end: at(18) }]);
  });

  it('ignores invalid entries, sorts, and handles a missing attribute', () => {
    const s = parseSessions(
      ent({
        events: [
          { start: iso(19), end: iso(20) },
          { start: 'bad', end: iso(20) },
          { start: iso(17), end: iso(18) },
        ],
      }),
      'events',
    );
    expect(s.map((x) => x.start)).toEqual([at(17), at(19)]);
    expect(parseSessions(ent({}), 'events')).toEqual([]);
    expect(parseSessions(undefined, 'events')).toEqual([]);
  });
});

describe('session helpers', () => {
  const sessions = [{ start: at(17, 30), end: at(18, 30) }];

  it('sessionActive is start-inclusive and end-exclusive', () => {
    expect(sessionActive(sessions, at(17, 29))).toBe(false);
    expect(sessionActive(sessions, at(17, 30))).toBe(true);
    expect(sessionActive(sessions, at(18, 29))).toBe(true);
    expect(sessionActive(sessions, at(18, 30))).toBe(false);
  });

  it('slotOverlapsSession catches partial overlap but not touching slots', () => {
    expect(slotOverlapsSession(sessions, at(17, 0))).toBe(false); // ends exactly at session start
    expect(slotOverlapsSession(sessions, at(17, 30))).toBe(true);
    expect(slotOverlapsSession(sessions, at(18, 0))).toBe(true);
    expect(slotOverlapsSession(sessions, at(18, 30))).toBe(false);
  });
});

describe('slot maths', () => {
  it('rounds down to the half hour and advances by one slot', () => {
    expect(currentSlotStart(at(17, 10))).toBe(at(17, 0));
    expect(currentSlotStart(at(17, 30))).toBe(at(17, 30));
    expect(nextSlotStart(at(17, 10))).toBe(at(17, 30));
    expect(nextSlotStart(at(23, 45))).toBe(new Date(2026, 0, 16, 0, 0).getTime());
  });

  it('fmtTime zero-pads local time', () => {
    expect(fmtTime(at(7, 5))).toBe('07:05');
    expect(fmtTime(at(0, 0))).toBe('00:00');
  });
});

describe('parseStateNumber', () => {
  it('parses numeric states', () => {
    expect(parseStateNumber('0.15')).toBe(0.15);
    expect(parseStateNumber('0')).toBe(0);
    expect(parseStateNumber('-0.02')).toBe(-0.02);
  });

  it('treats blank states as missing rather than 0', () => {
    expect(parseStateNumber('')).toBeUndefined();
    expect(parseStateNumber('   ')).toBeUndefined();
  });

  it('returns undefined for non-numeric or non-string states', () => {
    expect(parseStateNumber('unavailable')).toBeUndefined();
    expect(parseStateNumber('unknown')).toBeUndefined();
    expect(parseStateNumber('Infinity')).toBeUndefined();
    expect(parseStateNumber(undefined)).toBeUndefined();
    expect(parseStateNumber(null)).toBeUndefined();
  });
});

describe('clampHours', () => {
  it('passes through values in range', () => {
    expect(clampHours(24)).toBe(24);
    expect(clampHours(6)).toBe(6);
    expect(clampHours(48)).toBe(48);
  });

  it('clamps zero, negative and oversized values into 6-48', () => {
    expect(clampHours(0)).toBe(6);
    expect(clampHours(-5)).toBe(6);
    expect(clampHours(100)).toBe(48);
  });

  it('defaults missing or non-numeric values to 24', () => {
    expect(clampHours(undefined)).toBe(24);
    expect(clampHours(null)).toBe(24);
    expect(clampHours('')).toBe(24);
    expect(clampHours('abc')).toBe(24);
    expect(clampHours(Number.NaN)).toBe(24);
  });

  it('accepts numeric strings from YAML', () => {
    expect(clampHours('12')).toBe(12);
  });
});
