import type { HassEntity, Rate, Session } from './types';

const SLOT_MS = 30 * 60 * 1000;

export const parseRates = (entity: HassEntity | undefined, multiplier: number): Rate[] => {
  const raw = entity?.attributes?.rates;
  if (!Array.isArray(raw)) return [];
  const out: Rate[] = [];
  for (const r of raw) {
    const start = new Date(r?.start).getTime();
    const value = Number(r?.value_inc_vat) * multiplier;
    if (!Number.isFinite(start) || !Number.isFinite(value)) continue;
    const end = new Date(r?.end).getTime();
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
    const start = new Date(e?.start).getTime();
    let end = new Date(e?.end).getTime();
    if (!Number.isFinite(end) && Number.isFinite(start)) {
      const mins = Number(e?.duration_in_minutes);
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
