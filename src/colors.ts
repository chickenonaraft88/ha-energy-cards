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

/** Colour for a single price (p/kWh): <0 cyan/blue, 0-5 green, 5-20 green->orange, 20-30 orange->red, 30+ red. */
export const priceColor = (price: number, dark: boolean): string => {
  const p = palette(dark);
  if (price < 0) return mix(p.cyan, p.blue, Math.min(Math.abs(price) / 7, 1));
  if (price < 5) return p.green;
  if (price < 20) return mix(p.green, p.orange, (price - 5) / 15);
  if (price < 30) return mix(p.orange, p.red, (price - 20) / 10);
  return p.red;
};

/** Value-anchored gradient stops, highest value first. */
export const gradientStops = (dark: boolean): Array<[number, string]> => {
  const p = palette(dark);
  return [
    [30, p.red],
    [20, p.orange],
    [5, p.green],
    [0, p.green],
    [-0.001, p.cyan],
    [-7, p.blue],
  ];
};
