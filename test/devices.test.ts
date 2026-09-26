import { describe, expect, it } from 'vitest';
import {
  bestWindow,
  buildDeviceShape,
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
