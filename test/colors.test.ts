import { describe, expect, it } from 'vitest';
import { gradientStops, palette, priceColor, priceScale } from '../src/colors';

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

describe('priceColor with a scaled unit', () => {
  const at = (v: number, scale: number) => priceColor(v, true, scale).toLowerCase();

  it('treats £ prices the same as the equivalent pence price', () => {
    for (const pence of [-10, -3, 0, 4, 12, 25, 45]) {
      expect(at(pence / 100, 0.01)).toBe(at(pence, 1));
    }
  });

  it('is red for an expensive £/kWh price instead of staying green', () => {
    expect(at(0.45, 0.01)).toBe(palette(true).red.toLowerCase());
  });
});

describe('priceScale', () => {
  it('is 0.01 for a currency unit and 1 for pence', () => {
    expect(priceScale('£/kWh')).toBe(0.01);
    expect(priceScale('$/kWh')).toBe(0.01);
    expect(priceScale('p/kWh')).toBe(1);
  });

  it('does not depend on rate_multiplier, so a pence sensor with a multiplier of 1 keeps the pence bands', () => {
    // 33.7 from a pence sensor is displayed as 33.70 p/kWh and must be red, as it is with the default multiplier
    expect(priceColor(33.7, true, priceScale('p/kWh')).toLowerCase()).toBe(palette(true).red.toLowerCase());
    expect(priceColor(0.337, true, priceScale('£/kWh')).toLowerCase()).toBe(palette(true).red.toLowerCase());
  });
});

describe('gradientStops', () => {
  it('moves the stops with the unit scale', () => {
    const pence = gradientStops(true, 1).map(([v, c]) => [v * 0.01, c]);
    expect(gradientStops(true, 0.01).map(([v, c]) => [Math.round(v * 1e9) / 1e9, c])).toEqual(
      pence.map(([v, c]) => [Math.round((v as number) * 1e9) / 1e9, c]),
    );
  });

  it('is ordered from highest to lowest value', () => {
    const vals = gradientStops(true).map(([v]) => v);
    expect(vals).toEqual([...vals].sort((a, b) => b - a));
  });
});
