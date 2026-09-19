export interface Palette {
  blue: string;
  cyan: string;
  green: string;
  orange: string;
  red: string;
  purple: string;
}

export const palette = (dark: boolean): Palette =>
  dark
    ? { blue: '#0A84FF', cyan: '#64D2FF', green: '#30D158', orange: '#FF9F0A', red: '#FF453A', purple: '#BF5AF2' }
    : { blue: '#007AFF', cyan: '#32ADE6', green: '#34C759', orange: '#FF9500', red: '#FF3B30', purple: '#AF52DE' };

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

/**
 * Colour for a single price: <0 cyan/blue, 0-5p green, 5-20p green->orange, 20-30p orange->red, 30p+ red.
 * `scale` is the price unit's size relative to pence (the card's `rate_multiplier` / 100): 1 for pence, 0.01 for £.
 */
export const priceColor = (value: number, dark: boolean, scale = 1): string => {
  const price = value / scale;
  const p = palette(dark);
  if (price < 0) return mix(p.cyan, p.blue, Math.min(Math.abs(price) / 7, 1));
  if (price < 5) return p.green;
  if (price < 20) return mix(p.green, p.orange, (price - 5) / 15);
  if (price < 30) return mix(p.orange, p.red, (price - 20) / 10);
  return p.red;
};

/** Value-anchored gradient stops (in the card's unit, see `priceColor`), highest value first. */
export const gradientStops = (dark: boolean, scale = 1): Array<[number, string]> => {
  const p = palette(dark);
  return [
    [30 * scale, p.red],
    [20 * scale, p.orange],
    [5 * scale, p.green],
    [0, p.green],
    [-0.001 * scale, p.cyan],
    [-7 * scale, p.blue],
  ];
};

/** Size of the card's price unit relative to pence: `rate_multiplier` 100 (pence) -> 1, 1 (£) -> 0.01. */
export const priceScale = (multiplier: number): number =>
  multiplier > 0 && Number.isFinite(multiplier) ? multiplier / 100 : 1;
