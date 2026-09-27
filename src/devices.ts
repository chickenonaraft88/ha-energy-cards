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

/** Upper bound for `run_after_max_wait`, in hours. */
const MAX_WAIT_HOURS = 12;

/** `run_after_max_wait` as a whole number of hours in 0-12; anything unusable is 0 (start straight after). */
export const clampMaxWait = (hours: unknown): number => {
  const n = typeof hours === 'number' || typeof hours === 'string' ? Number(hours) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? Math.min(MAX_WAIT_HOURS, Math.floor(n)) : 0;
};

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

/** Cost of running `hourlyWatts` from `t`: each hour's kW at that hour's average rate. Undefined if a rate is missing. */
const windowCost = (hourlyWatts: number[], rates: Rate[], t: number): number | undefined => {
  let cost = 0;
  for (let i = 0; i < hourlyWatts.length; i++) {
    const rate = hourlyRate(rates, t + i * HOUR_MS);
    if (rate === undefined) return undefined;
    cost += (hourlyWatts[i] / 1000) * rate;
  }
  return cost;
};

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
): BestWindow | undefined => bestChain([hourlyWatts], rates, start, end, now)?.[0];

/**
 * Cheapest placement of devices that run one after another (e.g. a tumble dryer after the washing machine),
 * one window per shape, in order. Each device starts on the hour between the end of the one before it and
 * `maxWaitHours` later, so the first device's start is chosen for the cost of the whole sequence rather than
 * its own - running the washer a bit earlier can be worth it if that lets the dryer land in a cheap slot too.
 * Same rules as `bestWindow` otherwise: every window must fit before `end` with full rate coverage, and nothing
 * starts before `now`. Ties go to the earliest start and the shortest wait. Undefined if any shape is empty or
 * the sequence doesn't fit.
 */
export const bestChain = (
  shapes: number[][],
  rates: Rate[],
  start: number,
  end: number,
  now: number = start,
  maxWaitHours = 0,
): BestWindow[] | undefined => {
  if (!shapes.length || shapes.some((s) => s.length === 0)) return undefined;
  const maxWait = Math.max(0, Math.floor(maxWaitHours));
  // Cheapest placement of shapes[i..] given shapes[i] starts at one of `starts`; shapes are few and waits short,
  // so plain recursion is enough (at most (maxWait + 1) ^ (shapes - 1) placements per first start).
  const place = (i: number, starts: number[]): BestWindow[] | undefined => {
    let best: BestWindow[] | undefined;
    let bestCost = Infinity;
    for (const t of starts) {
      const stop = t + shapes[i].length * HOUR_MS;
      if (t < now || stop > end) continue;
      const cost = windowCost(shapes[i], rates, t);
      if (cost === undefined) continue;
      const rest =
        i + 1 < shapes.length
          ? place(
              i + 1,
              Array.from({ length: maxWait + 1 }, (_, g) => stop + g * HOUR_MS),
            )
          : [];
      if (!rest) continue;
      const total = cost + rest.reduce((sum, w) => sum + w.cost, 0);
      if (total < bestCost) {
        bestCost = total;
        best = [{ start: t, end: stop, cost }, ...rest];
      }
    }
    return best;
  };
  const firstStarts: number[] = [];
  for (let t = start; t < end; t += HOUR_MS) firstStarts.push(t);
  return place(0, firstStarts);
};

/**
 * Groups `devices` into sequences to schedule together, following `runAfter` (follower entity -> the entity it
 * runs after), each sequence in run order. Every device lands in exactly one sequence; one with no valid link is
 * a sequence of its own. A link is ignored when either end isn't in `devices`, when the device it points at
 * already has a follower (the first one listed in `devices` wins), or when it would close a loop.
 */
export const buildChains = (devices: string[], runAfter?: unknown): string[][] => {
  const links = runAfter && typeof runAfter === 'object' ? (runAfter as Record<string, unknown>) : {};
  const listed = new Set(devices);
  const next = new Map<string, string>();
  const prev = new Map<string, string>();
  const headOf = (id: string): string => {
    let h = id;
    while (prev.has(h)) h = prev.get(h) as string;
    return h;
  };
  for (const follower of devices) {
    const lead = links[follower];
    if (typeof lead !== 'string' || !listed.has(lead) || lead === follower) continue;
    if (next.has(lead) || headOf(lead) === follower) continue;
    next.set(lead, follower);
    prev.set(follower, lead);
  }
  const chains: string[][] = [];
  for (const id of devices) {
    if (prev.has(id)) continue;
    const chain = [id];
    for (let n = next.get(id); n; n = next.get(n)) chain.push(n);
    chains.push(chain);
  }
  return chains;
};
