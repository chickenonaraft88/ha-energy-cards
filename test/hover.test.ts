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
  // A local-time date avoids fmtTime's output depending on the test runner's timezone offset from epoch 0.
  const at = (h: number, m = 0) => new Date(2026, 0, 15, h, m).getTime();
  const summaryRates: Rate[] = [
    { start: at(0), end: at(1), value: 20 },
    { start: at(1), end: at(2), value: 10 },
    { start: at(2), end: at(3), value: 30 },
  ];

  it('reports the current price and the cheapest slot in view', () => {
    expect(chartSummary({ rates: summaryRates, start: at(0), end: at(3), now: at(0, 5), unit: 'p/kWh' })).toBe(
      'Energy price graph, current price 20.00p/kWh, cheapest 10.00p/kWh from 01:00 to 02:00',
    );
  });

  it('excludes slots outside the visible window from the cheapest search', () => {
    expect(chartSummary({ rates: summaryRates, start: at(1), end: at(2), now: at(1, 5), unit: 'p/kWh' })).toBe(
      'Energy price graph, current price 10.00p/kWh, cheapest 10.00p/kWh from 01:00 to 02:00',
    );
  });

  it('omits the current price when no rate covers now', () => {
    expect(chartSummary({ rates: summaryRates, start: at(0), end: at(3), now: at(5), unit: 'p/kWh' })).toBe(
      'Energy price graph, cheapest 10.00p/kWh from 01:00 to 02:00',
    );
  });

  it('is just the plain label with no rates', () => {
    expect(chartSummary({ rates: [], start: at(0), end: at(1), now: at(0, 5), unit: 'p/kWh' })).toBe(
      'Energy price graph',
    );
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
