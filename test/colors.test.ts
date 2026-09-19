import { describe, expect, it } from 'vitest';
import { gradientStops, palette, priceColor } from '../src/colors';

describe('priceColor', () => {
  const p = palette(true);
  // mix() emits lowercase hex, the palette constants are uppercase
  const color = (v: number) => priceColor(v, true).toLowerCase();

  it('is green from 0 up to 5p', () => {
    expect(color(0)).toBe(p.green.toLowerCase());
    expect(color(4.99)).toBe(p.green.toLowerCase());
  });

  it('starts green at 5p and moves towards orange by 20p', () => {
    expect(color(5)).toBe(p.green.toLowerCase());
    expect(color(19.99)).not.toBe(p.green.toLowerCase());
  });

  it('is orange at 20p and red from 30p', () => {
    expect(color(20)).toBe(p.orange.toLowerCase());
    expect(color(30)).toBe(p.red.toLowerCase());
    expect(color(80)).toBe(p.red.toLowerCase());
  });

  it('goes cyan to blue for negative prices and saturates at -7p', () => {
    expect(color(-7)).toBe(p.blue.toLowerCase());
    expect(color(-50)).toBe(p.blue.toLowerCase());
    expect(color(-0.001)).not.toBe(p.green.toLowerCase());
  });

  it('returns a valid hex colour everywhere in range', () => {
    for (let v = -10; v <= 40; v += 0.5) expect(priceColor(v, false)).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('uses a different palette for light and dark', () => {
    expect(priceColor(0, true)).not.toBe(priceColor(0, false));
  });
});

describe('gradientStops', () => {
  it('is ordered from highest to lowest value', () => {
    const vals = gradientStops(true).map(([v]) => v);
    expect(vals).toEqual([...vals].sort((a, b) => b - a));
  });
});
