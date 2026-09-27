import { describe, expect, it } from 'vitest';
import {
  bestChain,
  bestWindow,
  buildChains,
  buildDeviceShape,
  clampMaxWait,
  findRuns,
  HISTORY_DAYS,
  parseStatistics,
  type StatPoint,
  statisticsRequest,
} from '../src/devices';
import type { Rate } from '../src/types';

const HOUR = 3600000;
const HALF_HOUR = 1800000;
const base = new Date('2026-09-20T00:00:00+01:00').getTime();

const pt = (hourOffset: number, mean: number): StatPoint => ({
  start: base + hourOffset * HOUR,
  end: base + (hourOffset + 1) * HOUR,
  mean,
});

describe('findRuns', () => {
  it('groups contiguous buckets above the idle threshold', () => {
    const points = [pt(0, 5), pt(1, 400), pt(2, 420), pt(3, 5), pt(4, 5), pt(5, 300)];
    expect(findRuns(points, 50)).toEqual([[pt(1, 400), pt(2, 420)], [pt(5, 300)]]);
  });

  it('sorts out-of-order buckets before grouping', () => {
    const points = [pt(2, 420), pt(0, 5), pt(1, 400)];
    expect(findRuns(points, 50)).toEqual([[pt(1, 400), pt(2, 420)]]);
  });

  it('includes a run still open at the end of the data', () => {
    expect(findRuns([pt(0, 5), pt(1, 400)], 50)).toEqual([[pt(1, 400)]]);
  });

  it('returns nothing when no bucket is above the threshold', () => {
    expect(findRuns([pt(0, 5), pt(1, 10)], 50)).toEqual([]);
  });
});

describe('buildDeviceShape', () => {
  it('is undefined with fewer than 3 runs', () => {
    const run = [pt(0, 400), pt(1, 600)];
    expect(buildDeviceShape([run, run])).toBeUndefined();
  });

  it('averages hour-of-run power across the runs', () => {
    const runs = [
      [pt(0, 400), pt(1, 600)],
      [pt(0, 600), pt(1, 800)],
      [pt(0, 500), pt(1, 1000)],
    ];
    expect(buildDeviceShape(runs)).toEqual({ hourlyWatts: [500, 800] });
  });

  it('uses the most common run length, clipping longer runs and zero-padding shorter ones', () => {
    const runs = [
      [pt(0, 400), pt(1, 600)],
      [pt(0, 400), pt(1, 600)],
      [pt(0, 400), pt(1, 600), pt(2, 900)], // one longer outlier, clipped to 2h
      [pt(0, 400)], // one shorter outlier, padded with 0 for hour 1
    ];
    expect(buildDeviceShape(runs)).toEqual({ hourlyWatts: [400, 450] });
  });
});

describe('bestWindow', () => {
  const dayStart = base;
  // Half-hourly rates: cheap 02:00-04:00, otherwise mid-priced, in pence.
  const rates: Rate[] = [];
  for (let h = 0; h < 24; h += 0.5) {
    const cheap = h >= 2 && h < 4;
    rates.push({ start: dayStart + h * HOUR, end: dayStart + h * HOUR + HALF_HOUR, value: cheap ? 8 : 25 });
  }

  it('finds the cheapest hour-aligned window matching the shape length', () => {
    const win = bestWindow([1000, 1000], rates, dayStart, dayStart + 24 * HOUR);
    expect(win).toEqual({ start: dayStart + 2 * HOUR, end: dayStart + 4 * HOUR, cost: 1 * 8 + 1 * 8 });
  });

  it('weights each hour by its own watt figure, not just the cheapest slot', () => {
    // A heavy first hour makes the window starting just before the cheap band worse than starting inside it.
    const win = bestWindow([2000, 200], rates, dayStart, dayStart + 24 * HOUR);
    expect(win?.start).toBe(dayStart + 2 * HOUR);
  });

  it('only considers windows that fully fit before the end', () => {
    const win = bestWindow([1000, 1000, 1000], rates, dayStart + 22 * HOUR, dayStart + 24 * HOUR);
    expect(win).toBeUndefined();
  });

  it('is undefined when no candidate window has full rate coverage', () => {
    const gappy = rates.filter((r) => r.start !== dayStart + 3 * HOUR);
    const win = bestWindow([1000], gappy, dayStart + 3 * HOUR, dayStart + 4 * HOUR);
    expect(win).toBeUndefined();
  });

  it('is undefined for an empty shape', () => {
    expect(bestWindow([], rates, dayStart, dayStart + 24 * HOUR)).toBeUndefined();
  });

  it('skips candidates starting before now, even when they start on the hour', () => {
    // The top of the current hour (14:00) has already passed at 14:45; the cheapest reachable window
    // starting at or after now must begin at 15:00, not the earlier cheap band at 02:00.
    const now = dayStart + 14 * HOUR + 45 * 60000;
    const win = bestWindow([1000, 1000], rates, dayStart, dayStart + 24 * HOUR, now);
    expect(win?.start).toBeGreaterThanOrEqual(now);
  });
});

describe('bestChain', () => {
  const dayStart = base;
  // Half-hourly rates in pence: cheap 02:00-04:00, a little cheaper 04:00-05:00, otherwise mid-priced.
  const rates: Rate[] = [];
  for (let h = 0; h < 24; h += 0.5) {
    const value = h >= 2 && h < 4 ? 8 : h >= 4 && h < 5 ? 20 : 25;
    rates.push({ start: dayStart + h * HOUR, end: dayStart + h * HOUR + HALF_HOUR, value });
  }
  const dayEnd = dayStart + 24 * HOUR;

  it('starts the second device straight after the first, costing each window separately', () => {
    const wins = bestChain([[1000], [1000]], rates, dayStart, dayEnd);
    expect(wins).toEqual([
      { start: dayStart + 2 * HOUR, end: dayStart + 3 * HOUR, cost: 8 },
      { start: dayStart + 3 * HOUR, end: dayStart + 4 * HOUR, cost: 8 },
    ]);
  });

  it('picks the first start for the whole sequence, not just the first device', () => {
    // Alone, the washer would take 02:00-04:00 and push a heavy dryer out of the cheap band. Starting the washer
    // earlier costs it more but lets the dryer use the cheap hours, which is cheaper overall.
    const washer = [300, 300];
    const dryer = [2000, 2000];
    expect(bestWindow(washer, rates, dayStart, dayEnd)?.start).toBe(dayStart + 2 * HOUR);
    const wins = bestChain([washer, dryer], rates, dayStart, dayEnd);
    expect(wins?.map((w) => w.start)).toEqual([dayStart, dayStart + 2 * HOUR]);
  });

  it('never overlaps the devices, even when both would rather run in the same cheap hours', () => {
    const wins = bestChain(
      [
        [1000, 1000],
        [1000, 1000],
      ],
      rates,
      dayStart,
      dayEnd,
    );
    expect(wins?.[1].start).toBeGreaterThanOrEqual(wins?.[0].end ?? Infinity);
  });

  it('lets the second device wait up to maxWaitHours for a cheaper slot', () => {
    // Two separate cheap hours, 01:00 and 05:00: the washer wants the first and the dryer the second, which
    // needs the dryer to wait 3h after the washer ends at 02:00.
    const twoDips: Rate[] = [];
    for (let h = 0; h < 24; h += 0.5) {
      const value = Math.floor(h) === 1 || Math.floor(h) === 5 ? 5 : 30;
      twoDips.push({ start: dayStart + h * HOUR, end: dayStart + h * HOUR + HALF_HOUR, value });
    }
    const starts = (wait: number) =>
      bestChain([[1000], [1000]], twoDips, dayStart, dayEnd, dayStart, wait)?.map((w) => (w.start - dayStart) / HOUR);
    expect(starts(0)).toEqual([0, 1]);
    expect(starts(2)).toEqual([0, 1]); // 05:00 is out of reach, so nothing beats the earliest equal-cost pair
    expect(starts(3)).toEqual([1, 5]);
  });

  it('prefers the shortest wait when waiting longer costs the same', () => {
    const wins = bestChain([[1000], [1000]], rates, dayStart, dayEnd, dayStart, 3);
    expect(wins?.map((w) => w.start)).toEqual([dayStart + 2 * HOUR, dayStart + 3 * HOUR]);
  });

  it('is undefined when the whole sequence does not fit before the end', () => {
    expect(bestChain([[1000, 1000], [1000]], rates, dayStart + 22 * HOUR, dayEnd)).toBeUndefined();
  });

  it('is undefined for an empty shape anywhere in the sequence', () => {
    expect(bestChain([[1000], []], rates, dayStart, dayEnd)).toBeUndefined();
    expect(bestChain([], rates, dayStart, dayEnd)).toBeUndefined();
  });

  it('matches bestWindow for a single device', () => {
    expect(bestChain([[2000, 200]], rates, dayStart, dayEnd)).toEqual([
      bestWindow([2000, 200], rates, dayStart, dayEnd),
    ]);
  });
});

describe('buildChains', () => {
  const washer = 'sensor.washer';
  const dryer = 'sensor.dryer';
  const dish = 'sensor.dishwasher';

  it('keeps every device on its own without links', () => {
    expect(buildChains([washer, dryer, dish])).toEqual([[washer], [dryer], [dish]]);
  });

  it('puts a follower after the device it runs after, whatever the listed order', () => {
    expect(buildChains([dryer, dish, washer], { [dryer]: washer })).toEqual([[dish], [washer, dryer]]);
  });

  it('follows links into longer sequences', () => {
    const iron = 'sensor.iron';
    expect(buildChains([iron, dryer, washer], { [dryer]: washer, [iron]: dryer })).toEqual([[washer, dryer, iron]]);
  });

  it('ignores links to devices that are not listed, and to the device itself', () => {
    expect(buildChains([dryer, dish], { [dryer]: washer, [dish]: dish })).toEqual([[dryer], [dish]]);
  });

  it('gives a device only one follower, the first one listed', () => {
    expect(buildChains([washer, dryer, dish], { [dryer]: washer, [dish]: washer })).toEqual([[washer, dryer], [dish]]);
  });

  it('breaks a loop rather than dropping its devices', () => {
    // Links are taken in `devices` order, so the washer's (listed first) is kept and the dryer's closes the loop.
    expect(buildChains([washer, dryer], { [dryer]: washer, [washer]: dryer })).toEqual([[dryer, washer]]);
  });

  it('ignores a run_after that is not a mapping', () => {
    expect(buildChains([washer, dryer], 'nonsense')).toEqual([[washer], [dryer]]);
    expect(buildChains([washer, dryer], null)).toEqual([[washer], [dryer]]);
  });
});

describe('clampMaxWait', () => {
  it('defaults to 0 for missing or unusable values', () => {
    for (const v of [undefined, null, '', 'x', -2, Number.NaN, true]) expect(clampMaxWait(v)).toBe(0);
  });

  it('rounds down to whole hours and caps at 12', () => {
    expect(clampMaxWait(2.7)).toBe(2);
    expect(clampMaxWait('3')).toBe(3);
    expect(clampMaxWait(40)).toBe(12);
  });
});

describe('statisticsRequest', () => {
  it('asks the recorder for hourly stats over HISTORY_DAYS up to now', () => {
    const now = base + 5 * HOUR;
    const msg = statisticsRequest(['sensor.washer_power'], now);
    expect(msg).toEqual({
      type: 'recorder/statistics_during_period',
      start_time: new Date(now - HISTORY_DAYS * 24 * HOUR).toISOString(),
      end_time: new Date(now).toISOString(),
      statistic_ids: ['sensor.washer_power'],
      period: 'hour',
      types: ['mean'],
    });
  });
});

describe('parseStatistics', () => {
  it('reads the named entity out of a multi-entity response', () => {
    const raw = {
      'sensor.washer_power': [{ start: base, end: base + HOUR, mean: 400 }],
      'sensor.other': [{ start: base, end: base + HOUR, mean: 999 }],
    };
    expect(parseStatistics(raw, 'sensor.washer_power')).toEqual([{ start: base, end: base + HOUR, mean: 400 }]);
  });

  it('accepts an ISO string as well as an epoch-ms number', () => {
    const raw = { x: [{ start: new Date(base).toISOString(), end: base + HOUR, mean: 400 }] };
    expect(parseStatistics(raw, 'x')).toEqual([{ start: base, end: base + HOUR, mean: 400 }]);
  });

  it('derives a missing end from start + 1h', () => {
    const raw = { x: [{ start: base, mean: 400 }] };
    expect(parseStatistics(raw, 'x')).toEqual([{ start: base, end: base + HOUR, mean: 400 }]);
  });

  it('drops entries with a non-finite start or mean', () => {
    const raw = {
      x: [
        { start: 'not a date', mean: 400 },
        { start: base, mean: 'nope' },
        { start: base, mean: 400 },
      ],
    };
    expect(parseStatistics(raw, 'x')).toEqual([{ start: base, end: base + HOUR, mean: 400 }]);
  });

  it('is empty for a missing entity or malformed response', () => {
    expect(parseStatistics({}, 'x')).toEqual([]);
    expect(parseStatistics(null, 'x')).toEqual([]);
    expect(parseStatistics({ x: 'not an array' }, 'x')).toEqual([]);
  });
});
