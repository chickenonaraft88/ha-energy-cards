import { describe, expect, it } from 'vitest';
import { chartSummary, hoverInfo, PAD, planText, timeAtX, tooltipLeft, xAtTime } from '../src/hover';
import type { BatteryWindow, Rate } from '../src/types';

const H = 3600000;
const rates: Rate[] = [
  { start: 0, end: H, value: 10 },
  { start: H, end: 2 * H, value: 20 },
];
const forecast: Rate[] = [{ start: 2 * H, end: 3 * H, value: 30 }];
const base = { rates, forecast, sessions: [] };

// fmtTime formats in local time, so build times the same way it does rather than hard-coding an offset from epoch.
const at = (h: number, m = 0) => new Date(2026, 0, 15, h, m).getTime();

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

describe('chartSummary', () => {
  const day: Rate[] = [
    { start: at(0), end: at(1), value: 20 },
    { start: at(1), end: at(2), value: 10 },
    { start: at(2), end: at(3), value: 30 },
  ];

  it('reports the current price and the cheapest slot in view', () => {
    expect(chartSummary(day, at(0, 30), at(0), at(3), 'p/kWh')).toBe(
      'Energy price graph, current price 20.00 p/kWh, cheapest 01:00–02:00 at 10.00 p/kWh',
    );
  });

  it('only considers slots inside the visible range for "cheapest"', () => {
    expect(chartSummary(day, at(0, 30), at(0), at(1), 'p/kWh')).toBe(
      'Energy price graph, current price 20.00 p/kWh, cheapest 00:00–01:00 at 20.00 p/kWh',
    );
  });

  it('omits the current price when nothing covers "now"', () => {
    expect(chartSummary(day, at(5), at(0), at(3), 'p/kWh')).toBe(
      'Energy price graph, cheapest 01:00–02:00 at 10.00 p/kWh',
    );
  });

  it('falls back to a bare label with no rates', () => {
    expect(chartSummary([], at(0), at(0), at(3), 'p/kWh')).toBe('Energy price graph');
  });
});

describe('tooltipLeft', () => {
  it('centres on x when there is room', () => {
    expect(tooltipLeft(200, 100, 400)).toBe(150);
  });
  it('keeps the tooltip inside the card near either edge', () => {
    expect(tooltipLeft(20, 100, 400)).toBe(0);
    expect(tooltipLeft(390, 100, 400)).toBe(300);
  });
  it('pins to the left when the tooltip is wider than the card', () => {
    expect(tooltipLeft(100, 300, 200)).toBe(0);
  });
});
