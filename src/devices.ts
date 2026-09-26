import { rateAt, SLOT_MS } from './data';
import type { Rate } from './types';

const HOUR_MS = 3600000;

/** One hourly bucket from `recorder/statistics_during_period`, mean power in watts. */
export interface StatPoint {
  start: number;
  end: number;
  mean: number;
}

/** Runs shorter than this aren't trusted enough to build a shape from. */
const MIN_RUNS = 3;

/** Power below this is treated as the device sitting idle, not running. */
export const DEFAULT_IDLE_WATTS = 50;

/** How much history to ask the recorder for. */
export const HISTORY_DAYS = 14;

/** How often the card refetches a device's statistics. */
export const REFRESH_INTERVAL_MS = 4 * 3600000;

/** WebSocket message for `hass.callWS`, requesting hourly statistics for these entities up to `now`. */
export const statisticsRequest = (entityIds: string[], now: number): Record<string, unknown> => ({
  type: 'recorder/statistics_during_period',
  start_time: new Date(now - HISTORY_DAYS * 24 * HOUR_MS).toISOString(),
  end_time: new Date(now).toISOString(),
  statistic_ids: entityIds,
  period: 'hour',
  types: ['mean'],
});

const toMs = (x: unknown): number =>
  typeof x === 'number' ? x : typeof x === 'string' ? new Date(x).getTime() : Number.NaN;

/** `hourlyWatts`-ready buckets for one entity out of a `statistics_during_period` response; malformed entries are dropped. */
export const parseStatistics = (raw: unknown, entityId: string): StatPoint[] => {
  const list = raw && typeof raw === 'object' ? (raw as Record<string, unknown>)[entityId] : undefined;
  if (!Array.isArray(list)) return [];
  const out: StatPoint[] = [];
  for (const p of list) {
    const start = toMs((p as Record<string, unknown>)?.start);
    const mean = Number((p as Record<string, unknown>)?.mean);
    if (!Number.isFinite(start) || !Number.isFinite(mean)) continue;
    const end = toMs((p as Record<string, unknown>)?.end);
    out.push({ start, end: Number.isFinite(end) ? end : start + HOUR_MS, mean });
  }
  return out;
};

/** Contiguous stretches of hourly buckets whose mean power is above `idleWatts`, oldest first. */
export const findRuns = (points: StatPoint[], idleWatts: number): StatPoint[][] => {
  const sorted = [...points].sort((a, b) => a.start - b.start);
  const runs: StatPoint[][] = [];
  let current: StatPoint[] = [];
  for (const p of sorted) {
    if (p.mean > idleWatts) {
      current.push(p);
    } else if (current.length) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length) runs.push(current);
  return runs;
};

export interface DeviceShape {
  /** Average watts for each hour of the run, index 0 = the hour the device starts. */
  hourlyWatts: number[];
}

/** The most common run length in hours; ties break towards the shorter length. */
const modalLength = (runs: StatPoint[][]): number => {
  const counts = new Map<number, number>();
  let best = runs[0].length;
  let bestCount = 0;
  for (const r of runs) {
    const count = (counts.get(r.length) ?? 0) + 1;
    counts.set(r.length, count);
    if (count > bestCount || (count === bestCount && r.length < best)) {
      best = r.length;
      bestCount = count;
    }
  }
  return best;
};

/**
 * Average power shape across all detected runs, one value per hour-of-run. Runs are clipped or zero-padded to
 * the modal length, so one unusually long or short run doesn't skew the average. Undefined with fewer than
 * `MIN_RUNS` runs - not enough history to be confident, so the card omits the device rather than guessing.
 */
export const buildDeviceShape = (runs: StatPoint[][]): DeviceShape | undefined => {
  if (runs.length < MIN_RUNS) return undefined;
  const length = modalLength(runs);
  const sums = new Array(length).fill(0);
  for (const run of runs) {
    for (let i = 0; i < length; i++) sums[i] += run[i]?.mean ?? 0;
  }
  return { hourlyWatts: sums.map((s) => s / runs.length) };
};

/** Average rate covering the hour starting at `hourStart`, from its two half-hour slots; undefined if either is missing. */
const hourlyRate = (rates: Rate[], hourStart: number): number | undefined => {
  const a = rateAt(rates, hourStart);
  const b = rateAt(rates, hourStart + SLOT_MS);
  return a && b ? (a.value + b.value) / 2 : undefined;
};

export interface BestWindow {
  start: number;
  end: number;
  /** Total cost across the window, in the card's display unit (same unit as `rates[].value`). */
  cost: number;
}

/**
 * Cheapest contiguous window the length of `hourlyWatts`, starting on the hour, between `start` and `end`. Cost
 * is summed hour by hour: `hourlyWatts[i]` in kW at that hour's average rate. A candidate start is skipped when
 * any of its hours has an incomplete rate (a missing half-hour slot), or when it falls before `now` - a device
 * can't be started in the past, even if `start` (the top of the current hour) already has. Defaults `now` to
 * `start` so callers that don't care about "the past" (e.g. tests scanning a whole day) see every candidate.
 */
export const bestWindow = (
  hourlyWatts: number[],
  rates: Rate[],
  start: number,
  end: number,
  now: number = start,
): BestWindow | undefined => {
  const length = hourlyWatts.length;
  if (length === 0) return undefined;
  let best: BestWindow | undefined;
  for (let t = start; t + length * HOUR_MS <= end; t += HOUR_MS) {
    if (t < now) continue;
    let cost = 0;
    let ok = true;
    for (let i = 0; i < length; i++) {
      const rate = hourlyRate(rates, t + i * HOUR_MS);
      if (rate === undefined) {
        ok = false;
        break;
      }
      cost += (hourlyWatts[i] / 1000) * rate;
    }
    if (ok && (!best || cost < best.cost)) best = { start: t, end: t + length * HOUR_MS, cost };
  }
  return best;
};
