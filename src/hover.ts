import { rateAt, sessionActive } from './data';
import { windowSummary } from './predbat';
import type { BatteryWindow, Rate, Session } from './types';

/** Space around the plot inside the SVG; the chart and the pointer maths must agree on it. */
export const PAD = { left: 36, right: 16, top: 28, bottom: 22 };

const plotWidth = (width: number): number => Math.max(width - PAD.left - PAD.right, 10);

/** SVG x for a time, given the chart's pixel width and time span. */
export const xAtTime = (t: number, width: number, start: number, end: number): number =>
  PAD.left + ((t - start) / (end - start)) * plotWidth(width);

/** Time under an x offset within the chart, or undefined when the pointer is outside the plot. */
export const timeAtX = (px: number, width: number, start: number, end: number): number | undefined => {
  const f = (px - PAD.left) / plotWidth(width);
  return f < 0 || f > 1 ? undefined : start + f * (end - start);
};

export interface HoverInput {
  t: number;
  rates: Rate[];
  forecast: Rate[];
  sessions: Session[];
  /** Undefined when Predbat isn't configured. */
  battery?: BatteryWindow[];
}

export interface HoverInfo {
  start: number;
  end: number;
  value: number;
  /** The price comes from Predbat's forecast rather than the real rates. */
  predicted: boolean;
  incentive: boolean;
  /** The Predbat plan at this time (undefined when Predbat isn't configured): its window, or 'idle' between them. */
  plan?: BatteryWindow | 'idle';
}

/** What the tooltip shows for time `t`, or undefined when no rate covers it. */
export const hoverInfo = ({ t, rates, forecast, sessions, battery }: HoverInput): HoverInfo | undefined => {
  const real = rateAt(rates, t);
  const rate = real ?? rateAt(forecast, t);
  if (!rate) return undefined;
  return {
    start: rate.start,
    end: rate.end,
    value: rate.value,
    predicted: !real,
    incentive: sessionActive(sessions, t),
    plan: battery ? (battery.find((w) => t >= w.start && t < w.end) ?? 'idle') : undefined,
  };
};

/** The plan line of the tooltip, e.g. `Charge to 100%` or `Idle`. */
export const planText = (plan: NonNullable<HoverInfo['plan']>): string =>
  plan === 'idle' ? 'Idle' : windowSummary(plan);

/** Left edge for a tooltip of width `tipWidth` centred on `x`, kept inside a card `width` wide (pinned left if it can't fit). */
export const tooltipLeft = (x: number, tipWidth: number, width: number): number =>
  Math.max(0, Math.min(x - tipWidth / 2, width - tipWidth));
