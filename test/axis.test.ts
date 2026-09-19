import { describe, expect, it } from 'vitest';
import { fmtTick, unitSymbol, yAxis } from '../src/axis';

describe('yAxis', () => {
  it('keeps the pence axis unchanged for typical prices', () => {
    const { yMin, yMax, step, ticks } = yAxis([-5.2, 14, 21.7, 35.8]);
    expect(step).toBe(10);
    expect([yMin, yMax]).toEqual([-10, 40]);
    expect(ticks).toEqual([-10, 0, 10, 20, 30, 40]);
  });

  it('gives £-scale values a proportionate axis instead of padding them out to 3', () => {
    const { yMax, step, ticks } = yAxis([0.14, 0.22, 0.358]);
    expect(step).toBeCloseTo(0.1);
    expect(yMax).toBeLessThan(0.6);
    expect(ticks.length).toBeLessThanOrEqual(8);
  });

  it('gives distinct ticks for £-scale values that dip negative', () => {
    const { ticks } = yAxis([-0.052, 0.14, 0.358]);
    expect(new Set(ticks).size).toBe(ticks.length);
  });

  it('copes with all-zero values', () => {
    const { ticks, step } = yAxis([0, 0, 0]);
    expect(Number.isFinite(step)).toBe(true);
    expect(ticks.length).toBeGreaterThan(1);
  });
});

describe('unitSymbol', () => {
  it('takes the part before the slash', () => {
    expect(unitSymbol('p/kWh')).toBe('p');
    expect(unitSymbol('£/kWh')).toBe('£');
    expect(unitSymbol('c/kWh')).toBe('c');
    expect(unitSymbol('EUR')).toBe('EUR');
  });
});

describe('fmtTick', () => {
  it('matches the old pence labels', () => {
    expect(fmtTick(40, 10, 'p/kWh')).toBe('40p');
    expect(fmtTick(-10, 10, 'p/kWh')).toBe('-10p');
  });

  it('adds decimals for fractional steps and prefixes currency signs', () => {
    expect(fmtTick(0.2, 0.1, '£/kWh')).toBe('£0.2');
    expect(fmtTick(0.25, 0.05, '£/kWh')).toBe('£0.25');
    expect(fmtTick(0.5, 0.5, '$/kWh')).toBe('$0.5');
  });

  it('puts the minus sign before a currency sign', () => {
    expect(fmtTick(-0.1, 0.1, '£/kWh')).toBe('-£0.1');
  });

  it('suffixes non-currency symbols', () => {
    expect(fmtTick(0.25, 0.05, 'c/kWh')).toBe('0.25c');
  });
});
