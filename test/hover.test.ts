import { describe, expect, it } from 'vitest';
import { hoverInfo, PAD, planText, timeAtX, tooltipAlign, xAtTime } from '../src/hover';
import type { BatteryWindow, Rate } from '../src/types';

const H = 3600000;
const rates: Rate[] = [
  { start: 0, end: H, value: 10 },
  { start: H, end: 2 * H, value: 20 },
];
const forecast: Rate[] = [{ start: 2 * H, end: 3 * H, value: 30 }];
const base = { rates, forecast, sessions: [] };

describe('timeAtX / xAtTime', () => {
  const W = 236; // plot is 184px wide
  it('maps the plot edges to the span edges', () => {
    expect(timeAtX(PAD.left, W, 0, 24 * H)).toBe(0);
    expect(timeAtX(W - PAD.right, W, 0, 24 * H)).toBe(24 * H);
  });
  it('is undefined outside the plot', () => {
    expect(timeAtX(PAD.left - 1, W, 0, 24 * H)).toBeUndefined();
    expect(timeAtX(W - PAD.right + 1, W, 0, 24 * H)).toBeUndefined();
  });
  it('round-trips', () => {
    expect(xAtTime(timeAtX(100, W, 0, 24 * H) as number, W, 0, 24 * H)).toBeCloseTo(100);
  });
});

describe('hoverInfo', () => {
  it('finds the real rate and its slot', () => {
    expect(hoverInfo({ ...base, t: H + 5 })).toEqual({
      start: H,
      end: 2 * H,
      value: 20,
      predicted: false,
      incentive: false,
      plan: undefined,
    });
  });
  it('falls back to the forecast and marks it predicted', () => {
    const info = hoverInfo({ ...base, t: 2 * H + 5 });
    expect(info).toMatchObject({ value: 30, predicted: true });
  });
  it('is undefined where no rate covers the time', () => {
    expect(hoverInfo({ ...base, t: 5 * H })).toBeUndefined();
  });
  it('flags an active incentive session', () => {
    const sessions = [{ start: 0, end: H }];
    expect(hoverInfo({ ...base, sessions, t: 5 })?.incentive).toBe(true);
    expect(hoverInfo({ ...base, sessions, t: H + 5 })?.incentive).toBe(false);
  });
  it('reports the plan window, idle between windows, and nothing without Predbat', () => {
    const w: BatteryWindow = { start: 0, end: H, kind: 'charge', target: 100 };
    expect(hoverInfo({ ...base, battery: [w], t: 5 })?.plan).toBe(w);
    expect(hoverInfo({ ...base, battery: [w], t: H + 5 })?.plan).toBe('idle');
    expect(hoverInfo({ ...base, battery: [], t: 5 })?.plan).toBe('idle');
    expect(hoverInfo({ ...base, t: 5 })?.plan).toBeUndefined();
  });
});

describe('planText', () => {
  it('describes windows and idle', () => {
    expect(planText('idle')).toBe('Idle');
    expect(planText({ start: 0, end: 1, kind: 'discharge', target: 20 })).toBe('Discharge to 20%');
  });
});

describe('tooltipAlign', () => {
  it('keeps the tooltip inside the card near either edge', () => {
    expect(tooltipAlign(20, 400)).toBe('left');
    expect(tooltipAlign(200, 400)).toBe('center');
    expect(tooltipAlign(380, 400)).toBe('right');
  });
});
