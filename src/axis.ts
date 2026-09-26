const niceStep = (rough: number): number => {
  const pow = 10 ** Math.floor(Math.log10(rough));
  const f = rough / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pow;
};

export interface YAxis {
  yMin: number;
  yMax: number;
  step: number;
  ticks: number[];
}

/** Headroom above the highest value, as a share of the data range (about 3p on typical pence prices). */
const HEADROOM = 0.07;

/**
 * y-axis for the visible values: min is never above 0, max leaves a little headroom, ~6 ticks on a "nice" step.
 * Headroom scales with the data so £-scale values (0.15-0.35) get a usable axis, not one padded out to £3.
 */
export const yAxis = (values: number[]): YAxis => {
  const lo = Math.min(0, ...values);
  const max = Math.max(...values);
  const hi = max + (max - lo || 1) * HEADROOM;
  const step = niceStep((hi - lo) / 5);
  const yMin = Math.floor(lo / step) * step;
  const yMax = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = yMin; v <= yMax + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { yMin, yMax, step, ticks };
};

const HOUR = 3600000;
const LABEL_STEPS_H = [2, 3, 4, 6, 12, 24];
/** Room one 'HH:mm' label needs at 11px, with a gap either side. */
const MIN_LABEL_SPACING = 48;

/** Times for the x-axis labels: every 2h when they fit, otherwise the smallest step that keeps them apart. */
export const xTicks = (start: number, end: number, plotW: number): number[] => {
  const pxPerHour = plotW / ((end - start) / HOUR);
  const stepH = LABEL_STEPS_H.find((h) => h * pxPerHour >= MIN_LABEL_SPACING) ?? 24;
  const ticks: number[] = [];
  for (let t = start; t < end; t += stepH * HOUR) ticks.push(t);
  return ticks;
};

/** Short symbol for the axis, from the unit's currency part: 'p/kWh' -> 'p', '£/kWh' -> '£'. */
export const unitSymbol = (unit: string): string => unit.split('/')[0].trim();

const CURRENCY_PREFIX = /^[£$€¥]$/;

/** True when the unit is priced in a whole currency ('£/kWh') rather than a subunit ('p/kWh'). */
export const isCurrencyUnit = (unit: string): boolean => CURRENCY_PREFIX.test(unitSymbol(unit));

/** Tick label with enough decimals for the step, unit symbol prefixed for currency signs and suffixed otherwise. */
export const fmtTick = (v: number, step: number, unit: string): string => {
  const decimals = step > 0 ? Math.max(0, -Math.floor(Math.log10(step) + 1e-9)) : 0;
  const num = v.toFixed(decimals);
  const sym = unitSymbol(unit);
  if (!isCurrencyUnit(unit)) return `${num}${sym}`;
  return num.startsWith('-') ? `-${sym}${num.slice(1)}` : `${sym}${num}`;
};

/**
 * A one-off amount (not a per-kWh rate) in the card's unit, e.g. the estimated cost to run a device: whole
 * pence/cents with the symbol suffixed, or 2-decimal currency with the symbol prefixed.
 */
export const formatCost = (value: number, unit: string): string => {
  const sym = unitSymbol(unit);
  if (!isCurrencyUnit(unit)) return `${Math.round(value)}${sym}`;
  return value < 0 ? `-${sym}${Math.abs(value).toFixed(2)}` : `${sym}${value.toFixed(2)}`;
};
