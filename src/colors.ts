import { isCurrencyUnit } from './axis';

export interface Palette {
  blue: string;
  cyan: string;
  green: string;
  orange: string;
  red: string;
  purple: string;
  teal: string;
}

export const palette = (dark: boolean): Palette =>
  dark
    ? {
        blue: '#0A84FF',
        cyan: '#64D2FF',
        green: '#30D158',
        orange: '#FF9F0A',
        red: '#FF453A',
        purple: '#BF5AF2',
        teal: '#6AC4DC',
      }
    : {
        blue: '#007AFF',
        cyan: '#32ADE6',
        green: '#34C759',
        orange: '#FF9500',
        red: '#FF3B30',
        purple: '#AF52DE',
        teal: '#30B0C7',
      };

const mix = (a: string, b: string, t: number): string => {
  const ah = parseInt(a.slice(1), 16);
  const bh = parseInt(b.slice(1), 16);
  const ch = (shift: number) => {
    const x = (ah >> shift) & 255;
    const y = (bh >> shift) & 255;
    return Math.round(x + (y - x) * t);
  };
  return `#${((1 << 24) + (ch(16) << 16) + (ch(8) << 8) + ch(0)).toString(16).slice(1)}`;
};

/** Price bands in the card's display unit; a missing edge leaves that band out. */
export interface PriceBands {
  cheapBelow?: number;
  expensiveAbove?: number;
}

/** Bands from the config values, or undefined when none is usable (unset, non-numeric, or cheap above expensive). */
export const resolveBands = (cheapBelow?: unknown, expensiveAbove?: unknown): PriceBands | undefined => {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const cheap = num(cheapBelow);
  const expensive = num(expensiveAbove);
  if (cheap === undefined && expensive === undefined) return undefined;
  if (cheap !== undefined && expensive !== undefined && cheap > expensive) return undefined;
  return { cheapBelow: cheap, expensiveAbove: expensive };
};

/** Green below `cheapBelow`, red from `expensiveAbove`, orange (normal) in between. */
const bandColor = (price: number, p: Palette, bands: PriceBands): string => {
  if (bands.cheapBelow !== undefined && price < bands.cheapBelow) return p.green;
  if (bands.expensiveAbove !== undefined && price >= bands.expensiveAbove) return p.red;
  return p.orange;
};

/**
 * Colour for a single price: <0 cyan/blue, 0-5p green, 5-20p green->orange, 20-30p orange->red, 30p+ red.
 * `scale` is the price unit's size relative to pence (see `priceScale`): 1 for pence, 0.01 for £.
 * With `bands` the price is instead coloured by band, and `value` is compared in the card's own unit.
 */
export const priceColor = (value: number, dark: boolean, scale = 1, bands?: PriceBands): string => {
  const p = palette(dark);
  if (bands) return bandColor(value, p, bands);
  const price = value / scale;
  if (price < 0) return mix(p.cyan, p.blue, Math.min(Math.abs(price) / 7, 1));
  if (price < 5) return p.green;
  if (price < 20) return mix(p.green, p.orange, (price - 5) / 15);
  if (price < 30) return mix(p.orange, p.red, (price - 20) / 10);
  return p.red;
};

/** Value-anchored gradient stops (in the card's unit, see `priceColor`), highest value first. */
export const gradientStops = (dark: boolean, scale = 1, bands?: PriceBands): Array<[number, string]> => {
  const p = palette(dark);
  if (bands) {
    // hard steps: two stops at each edge; the ends pad with the first and last colour
    const stops: Array<[number, string]> = [];
    if (bands.expensiveAbove !== undefined) stops.push([bands.expensiveAbove, p.red], [bands.expensiveAbove, p.orange]);
    if (bands.cheapBelow !== undefined) stops.push([bands.cheapBelow, p.orange], [bands.cheapBelow, p.green]);
    return stops;
  }
  return [
    [30 * scale, p.red],
    [20 * scale, p.orange],
    [5 * scale, p.green],
    [0, p.green],
    [-0.001 * scale, p.cyan],
    [-7 * scale, p.blue],
  ];
};

/**
 * Size of the displayed unit relative to pence: 0.01 for a currency unit ('£/kWh'), otherwise 1.
 * Follows the unit, not `rate_multiplier`: a pence sensor uses a multiplier of 1 too.
 */
export const priceScale = (unit: string): number => (isCurrencyUnit(unit) ? 0.01 : 1);

/**
 * Colours for the "best time to run" device rows, cycling for however many devices are configured. Deliberately
 * separate from `Palette`: every one of its colours is already spoken for (price bands, Predbat charge/discharge,
 * the incentive and power-up badges), so reusing one here would make a device row look like it belonged to
 * whichever of those features happens to share its colour.
 */
export const deviceColors = (dark: boolean): string[] =>
  dark ? ['#FF375F', '#5E5CE6', '#FFD60A'] : ['#FF2D55', '#5856D6', '#FFCC00'];
