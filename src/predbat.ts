import { fmtTime } from './data';
import type { BatteryWindow, HassEntity } from './types';

/** In `best_export_limit`, 100 means no export window and 99 means hold SoC without a forced discharge. */
const EXPORT_FREEZE = 99;

export const predbatEntityIds = (prefix: string) => ({
  charge: `${prefix}.best_charge_limit`,
  export: `${prefix}.best_export_limit`,
});

// Predbat formats keys as %Y-%m-%dT%H:%M:%S%z, e.g. 2026-09-20T02:00:00+0100. The colon-less offset is not valid
// ISO 8601 for Date.parse, and Safari rejects it, so add the colon.
const parseStamp = (key: string): number => new Date(key.replace(/([+-]\d\d)(\d\d)$/, '$1:$2')).getTime();

/** Change points from a `results` attribute (`{ timestamp: percent }`), sorted by time. Bad entries are skipped. */
export const parseResults = (entity: HassEntity | undefined): Array<[number, number]> => {
  const raw = entity?.attributes?.results;
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const out: Array<[number, number]> = [];
  for (const [key, value] of Object.entries(raw)) {
    const t = parseStamp(key);
    const v =
      typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
    if (Number.isFinite(t) && Number.isFinite(v)) out.push([t, v]);
  }
  return out.sort((a, b) => a[0] - b[0]);
};

/**
 * Turn change points into windows. `target` returns the percentage for a value inside a window, or undefined when the
 * value means "no window". A window still open at the last change point runs to `horizon`.
 */
const toWindows = (
  points: Array<[number, number]>,
  kind: BatteryWindow['kind'],
  target: (v: number) => number | undefined,
  horizon: number,
): BatteryWindow[] => {
  const out: BatteryWindow[] = [];
  let open: { start: number; target: number } | undefined;
  const close = (end: number) => {
    if (open && end > open.start) out.push({ start: open.start, end, kind, target: open.target });
    open = undefined;
  };
  for (const [t, v] of points) {
    const tgt = target(v);
    if (open && tgt === open.target) continue;
    close(t);
    if (tgt !== undefined) open = { start: t, target: tgt };
  }
  close(horizon);
  return out;
};

/** Forced charge windows from `predbat.best_charge_limit`: 0 outside a window, the target % inside it. */
export const parseChargeWindows = (entity: HassEntity | undefined, horizon: number): BatteryWindow[] =>
  toWindows(parseResults(entity), 'charge', (v) => (v > 0 ? Math.round(v) : undefined), horizon);

/**
 * Forced discharge windows from `predbat.best_export_limit`: 100 when idle, 99 to hold SoC without a forced
 * discharge, otherwise the target %. The fraction can encode a reduced export power, so it is dropped.
 */
export const parseExportWindows = (entity: HassEntity | undefined, horizon: number): BatteryWindow[] =>
  toWindows(parseResults(entity), 'discharge', (v) => (v < EXPORT_FREEZE ? Math.floor(v) : undefined), horizon);

/** Windows from both entities, sorted by start. */
export const parseBatteryWindows = (
  charge: HassEntity | undefined,
  exp: HassEntity | undefined,
  horizon: number,
): BatteryWindow[] =>
  [...parseChargeWindows(charge, horizon), ...parseExportWindows(exp, horizon)].sort((a, b) => a.start - b.start);

/**
 * Label candidates for a window, longest first. Charge is nearly always 100%, so its target is only shown when it
 * is something else.
 */
export const windowLabels = (w: BatteryWindow): string[] =>
  w.kind === 'charge'
    ? w.target < 100
      ? [`▲ Charge · ${w.target}%`, `▲ ${w.target}%`, '▲']
      : ['▲ Charge', '▲']
    : [`▼ Discharge · ${w.target}%`, `▼ ${w.target}%`, '▼'];

/** Tooltip text, the only place a narrow window's target is readable. */
export const windowTitle = (w: BatteryWindow): string =>
  `${w.kind === 'charge' ? 'Charge to' : 'Discharge to'} ${w.target}%, ${fmtTime(w.start)}–${fmtTime(w.end)}`;
