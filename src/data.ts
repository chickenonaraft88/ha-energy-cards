import type { HassEntity, Rate, Session } from './types';

const SLOT_MS = 30 * 60 * 1000;

// Attribute values are untyped. Number(null) and new Date(null) are valid (0 and 1970), and Number('') is 0,
// so absent and blank values have to be rejected before converting.
const absent = (x: unknown): boolean =>
  x == null || (typeof x === 'string' && x.trim() === '') || typeof x === 'boolean';
const toNumber = (x: unknown): number => (absent(x) ? Number.NaN : Number(x));
const toTime = (x: unknown): number => (absent(x) ? Number.NaN : new Date(x as string | number).getTime());

export const parseRates = (entity: HassEntity | undefined, multiplier: number): Rate[] => {
  const raw = entity?.attributes?.rates;
  if (!Array.isArray(raw)) return [];
  const out: Rate[] = [];
  for (const r of raw) {
    const start = toTime(r?.start);
    const value = toNumber(r?.value_inc_vat) * multiplier;
    if (!Number.isFinite(start) || !Number.isFinite(value)) continue;
    const end = toTime(r?.end);
    out.push({ start, end: Number.isFinite(end) ? end : start + SLOT_MS, value });
  }
  return out;
};

/** Merge rate lists (later lists win on identical start times); sorted by start. */
export const mergeRates = (...lists: Rate[][]): Rate[] => {
  const byStart = new Map<number, Rate>();
  for (const list of lists) for (const r of list) byStart.set(r.start, r);
  return [...byStart.values()].sort((a, b) => a.start - b.start);
};

export const rateAt = (rates: Rate[], t: number): Rate | undefined => rates.find((r) => t >= r.start && t < r.end);

export const parseSessions = (entity: HassEntity | undefined, attribute: string): Session[] => {
  const raw = entity?.attributes?.[attribute];
  if (!Array.isArray(raw)) return [];
  const out: Session[] = [];
  for (const e of raw) {
    const start = toTime(e?.start);
    let end = toTime(e?.end);
    if (!Number.isFinite(end) && Number.isFinite(start)) {
      const mins = toNumber(e?.duration_in_minutes);
      if (Number.isFinite(mins)) end = start + mins * 60000;
    }
    if (Number.isFinite(start) && Number.isFinite(end)) out.push({ start, end });
  }
  return out.sort((a, b) => a.start - b.start);
};

export const sessionActive = (sessions: Session[], now: number): boolean =>
  sessions.some((s) => now >= s.start && now < s.end);

export const slotOverlapsSession = (sessions: Session[], slotStart: number): boolean =>
  sessions.some((s) => slotStart < s.end && slotStart + SLOT_MS > s.start);

export const currentSlotStart = (now: number): number => Math.floor(now / SLOT_MS) * SLOT_MS;
export const nextSlotStart = (now: number): number => currentSlotStart(now) + SLOT_MS;

export const fmtTime = (t: number): string => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Parse a sensor state as a number; blank, non-numeric and non-finite states (e.g. '', 'unavailable') give undefined. */
export const parseStateNumber = (state: unknown): number | undefined => {
  if (typeof state !== 'string' || state.trim() === '') return undefined;
  const n = Number(state);
  return Number.isFinite(n) ? n : undefined;
};

export const MIN_HOURS = 6;
export const MAX_HOURS = 48;
export const DEFAULT_HOURS = 24;

/** Chart span in hours, limited to the editor's range so YAML can't produce a zero or negative window. */
export const clampHours = (hours: unknown): number => {
  const n = Number(hours);
  if (hours == null || hours === '' || !Number.isFinite(n)) return DEFAULT_HOURS;
  return Math.min(MAX_HOURS, Math.max(MIN_HOURS, n));
};

export const MIN_HEIGHT = 100;
export const MAX_HEIGHT = 500;
export const DEFAULT_HEIGHT = 190;

/** Chart height in px, limited to the editor's range so YAML can't produce a zero, negative or NaN plot area. */
export const clampHeight = (height: unknown): number => {
  const n = Number(height);
  if (height == null || height === '' || typeof height === 'boolean' || !Number.isFinite(n)) return DEFAULT_HEIGHT;
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, n));
};
