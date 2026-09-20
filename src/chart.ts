import { nothing, svg, type TemplateResult } from 'lit';
import { fmtTick, xTicks, yAxis } from './axis';
import { gradientStops, type PriceBands } from './colors';
import { fmtTime } from './data';
import { chartSummary, PAD, xAtTime } from './hover';
import { badgeWidth, clearOf, clearOfAll, fitLabel, type Span } from './layout';
import { windowLabels, windowTitle } from './predbat';
import type { BatteryWindow, Rate, Session } from './types';

export interface ChartInput {
  uid: string;
  rates: Rate[];
  width: number;
  height: number;
  dark: boolean;
  now: number;
  start: number;
  end: number;
  sessions: Session[];
  /** Predbat's predicted rates for the stretch after the real ones end; drawn dashed behind a dotted divider. */
  forecast?: Rate[];
  /** Predbat plan windows; undefined when Predbat isn't configured (no track is drawn). */
  battery?: BatteryWindow[];
  chargeColor: string;
  dischargeColor: string;
  nowColor: string;
  incentiveColor: string;
  incentiveLabel: string;
  unit: string;
  /** Price unit size relative to pence, see `priceScale`. */
  priceScale: number;
  /** Cheap/expensive bands; when set the bars use them instead of the smooth gradient. */
  bands?: PriceBands;
  /** The rate slot under the pointer, highlighted on the chart. */
  hover?: { start: number; end: number; value: number };
}

/** Extra height for the battery track under the plot: an 8px gap plus the 14px bar. */
const TRACK_GAP = 8;
const TRACK_H = 14;
const TRACK_SPACE = TRACK_GAP + TRACK_H;
/** Text on the light cyan discharge bars; white fails contrast on it in either theme. */
const DISCHARGE_INK = '#06212e';
/** Neutral badge colour for the forecast divider; white text on it passes contrast in both themes. */
const FORECAST_BADGE = '#6b7280';
const FORECAST_LABEL = 'PREDICTED';
/** Top edge shared by the NOW and incentive badges. */
const BADGE_Y = PAD.top - 24;

const badge = (x: number, y: number, text: string, color: string) => {
  const w = badgeWidth(text);
  return svg`<rect x=${x} y=${y} width=${w} height="16" rx="3" fill=${color}></rect>
    <text x=${x + w / 2} y=${y + 11.5} text-anchor="middle" fill="#fff" font-size="10" font-weight="600">${text}</text>`;
};

export const renderChart = (c: ChartInput): TemplateResult => {
  const { width: W } = c;
  const H = c.height + (c.battery ? TRACK_SPACE : 0);
  const plotW = Math.max(W - PAD.left - PAD.right, 10);
  const plotH = c.height - PAD.top - PAD.bottom;

  const pts: Array<[number, number]> = c.rates.map((r) => [r.start, r.value]);
  const last = c.rates[c.rates.length - 1];
  if (last) pts.push([last.end, last.value]);

  // The forecast is joined to the real line's last point with a short solid step at the divider, so the line is
  // continuous even when the predicted prices sit far from the real ones.
  const fwd: Array<[number, number]> = (c.forecast ?? []).map((r) => [r.start, r.value]);
  const flast = c.forecast?.[c.forecast.length - 1];
  if (flast) fwd.push([flast.end, flast.value]);
  const fpts: Array<[number, number]> = last && fwd.length ? [[last.end, last.value], ...fwd] : fwd;
  const divider = last && fpts.length ? last.end : undefined;

  const visible = [...pts, ...fpts].filter(([t]) => t >= c.start && t <= c.end);
  if (!visible.length) {
    return svg`<svg width=${W} height=${H} viewBox="0 0 ${W} ${H}"><text x=${W / 2} y=${H / 2}
      text-anchor="middle" fill="var(--secondary-text-color)" font-size="13">No rate data</text></svg>`;
  }

  const { yMin, yMax, step, ticks } = yAxis(visible.map((p) => p[1]));

  const x = (t: number) => xAtTime(t, W, c.start, c.end);
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;
  const y0 = y(0);

  const line = pts.map(([t, v], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = `${line}L${x(pts[pts.length - 1][0]).toFixed(1)},${y0.toFixed(1)}L${x(pts[0][0]).toFixed(1)},${y0.toFixed(1)}Z`;

  const path = (p: Array<[number, number]>) =>
    p.map(([t, v], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const fline = fwd.length ? path(fwd) : '';
  const fjoin = fpts.length > fwd.length ? path(fpts.slice(0, 2)) : '';
  const farea = fpts.length
    ? `${path(fpts)}L${x(fpts[fpts.length - 1][0]).toFixed(1)},${y0.toFixed(1)}L${x(fpts[0][0]).toFixed(1)},${y0.toFixed(1)}Z`
    : '';

  const gid = `g-${c.uid}`;
  const cid = `c-${c.uid}`;
  const stops = gradientStops(c.dark, c.priceScale, c.bands).map(([v, col]) => {
    const off = Math.min(Math.max((yMax - v) / (yMax - yMin), 0), 1);
    return svg`<stop offset=${off} stop-color=${col}></stop>`;
  });

  // x-axis: labels from the window start, spaced to fit the plot width
  const xLabels = xTicks(c.start, c.end, plotW).map(
    (t) => svg`<text x=${x(t)} y=${H - 5} text-anchor="middle" class="axis">${fmtTime(t)}</text>`,
  );

  const grid = ticks.map(
    (v) => svg`<line x1=${PAD.left} x2=${W - PAD.right} y1=${y(v)} y2=${y(v)} class=${v === 0 ? 'zero' : 'grid'}></line>
      <text x=${PAD.left - 6} y=${y(v) + 4} text-anchor="end" class="axis">${fmtTick(v, step, c.unit)}</text>`,
  );

  const nx = x(c.now);
  const nowVisible = c.now >= c.start && c.now <= c.end;
  const nowBadge = { x: Math.min(nx - 17, W - PAD.right - badgeWidth('NOW')), w: badgeWidth('NOW') };

  // Badges already placed along the top edge, which later ones keep clear of.
  const placed: Span[] = nowVisible ? [nowBadge] : [];
  const sessions = c.sessions
    .filter((s) => s.end >= c.start && s.start <= c.end)
    .map((s) => {
      const x1 = x(Math.max(s.start, c.start));
      const x2 = x(Math.min(s.end, c.end));
      const labelW = badgeWidth(c.incentiveLabel);
      const bx = clearOf(x1 + 4, labelW, nowVisible ? nowBadge : undefined, 0, W - PAD.right - labelW);
      placed.push({ x: bx, w: labelW });
      return svg`<rect x=${x1} y=${PAD.top} width=${Math.max(x2 - x1, 1)} height=${plotH}
          fill=${c.incentiveColor} opacity=${c.dark ? 0.14 : 0.09}></rect>
        <line x1=${x1} x2=${x1} y1=${PAD.top} y2=${PAD.top + plotH} stroke=${c.incentiveColor}></line>
        <line x1=${x2} x2=${x2} y1=${PAD.top} y2=${PAD.top + plotH} stroke=${c.incentiveColor}></line>
        ${badge(bx, BADGE_Y, c.incentiveLabel, c.incentiveColor)}`;
    });

  const forecastW = badgeWidth(FORECAST_LABEL);
  const forecastX = clearOfAll(
    divider === undefined ? 0 : x(divider) + 4,
    forecastW,
    placed,
    0,
    W - PAD.right - forecastW,
  );
  const dividerMarker =
    divider !== undefined && divider > c.start && divider < c.end
      ? svg`<line x1=${x(divider)} x2=${x(divider)} y1=${PAD.top - 8} y2=${PAD.top + plotH} class="forecast-divider"
          stroke="var(--secondary-text-color)" stroke-dasharray="1 3" stroke-linecap="round"></line>
        ${badge(forecastX, BADGE_Y, FORECAST_LABEL, FORECAST_BADGE)}`
      : nothing;

  // A band over the hovered slot, and a dot on the line at its middle (the middle of the visible part, for a slot cut off by the edge).
  const hv = c.hover;
  const hx1 = hv ? x(Math.max(hv.start, c.start)) : 0;
  const hx2 = hv ? x(Math.min(hv.end, c.end)) : 0;
  const hoverBand = hv
    ? svg`<rect class="hover-band" x=${hx1} y=${PAD.top} width=${Math.max(hx2 - hx1, 1)} height=${plotH}
        fill="var(--primary-text-color)" opacity="0.1"></rect>`
    : nothing;
  const hoverDot = hv
    ? svg`<circle class="hover-dot" cx=${(hx1 + hx2) / 2} cy=${y(hv.value)} r="4.5"
        fill="var(--card-background-color, #fff)" stroke="var(--primary-text-color)" stroke-width="2"></circle>`
    : nothing;

  // Invisible, keyboard-focusable targets over each slot, so the tooltip that pointer hover shows is also reachable
  // with Tab/arrow keys. Roving tabindex: one tab stop into the chart, on the hovered slot or else "now".
  const visibleRates = c.rates.filter((r) => r.end > c.start && r.start < c.end);
  const activeSlot =
    (hv && visibleRates.find((r) => r.start === hv.start && r.end === hv.end)) ||
    visibleRates.find((r) => c.now >= r.start && c.now < r.end) ||
    visibleRates[0];
  const tipId = `${c.uid}-tip`;
  const slotTargets = visibleRates.map((r) => {
    const x1 = x(Math.max(r.start, c.start));
    const x2 = x(Math.min(r.end, c.end));
    return svg`<rect class="slot-focus" x=${x1} y=${PAD.top} width=${Math.max(x2 - x1, 1)} height=${plotH}
      fill="transparent" tabindex=${r === activeSlot ? 0 : -1}
      aria-label=${`${fmtTime(r.start)} to ${fmtTime(r.end)}, ${r.value.toFixed(2)}${c.unit}`}
      aria-describedby=${tipId}></rect>`;
  });

  const track = c.battery ? batteryTrack(c, c.battery, x, PAD.top + plotH + TRACK_GAP, plotW) : nothing;

  const nowMarker = nowVisible
    ? svg`<line x1=${nx} x2=${nx} y1=${PAD.top - 8} y2=${PAD.top + plotH} stroke=${c.nowColor}></line>
        ${badge(nowBadge.x, BADGE_Y, 'NOW', c.nowColor)}`
    : nothing;

  const summary = chartSummary({ rates: c.rates, start: c.start, end: c.end, now: c.now, unit: c.unit });
  return svg`<svg width=${W} height=${H} viewBox="0 0 ${W} ${H}" role="group" aria-label=${summary}>
    <defs>
      <linearGradient id=${gid} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1=${y(yMax)} y2=${y(yMin)}>${stops}</linearGradient>
      <clipPath id=${cid}><rect x=${PAD.left} y=${PAD.top - 8} width=${plotW} height=${plotH + 16}></rect></clipPath>
    </defs>
    ${grid}
    ${sessions}
    ${hoverBand}
    <g clip-path="url(#${cid})">
      <path d=${area} fill="url(#${gid})" fill-opacity="0.16" stroke="none"></path>
      <path class="price-line" d=${line} fill="none" stroke="url(#${gid})" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"></path>
      ${
        fpts.length
          ? svg`<path class="forecast" d=${farea} fill="url(#${gid})" fill-opacity="0.08" stroke="none"></path>
      <path class="forecast-join" d=${fjoin} fill="none" stroke="url(#${gid})" stroke-opacity="0.75" stroke-width="3"></path>
      <path class="forecast" d=${fline} fill="none" stroke="url(#${gid})" stroke-opacity="0.75" stroke-width="3" stroke-dasharray="5 5" stroke-linejoin="round"></path>`
          : nothing
      }
    </g>
    ${hoverDot}
    ${dividerMarker}
    ${track}
    ${xLabels}
    ${nowMarker}
    ${slotTargets}
  </svg>`;
};

const batteryTrack = (c: ChartInput, windows: BatteryWindow[], x: (t: number) => number, y: number, plotW: number) => {
  const bars = windows
    .filter((w) => w.end > c.start && w.start < c.end)
    .map((w) => {
      const x1 = x(Math.max(w.start, c.start));
      const width = Math.max(x(Math.min(w.end, c.end)) - x1, 1);
      const discharge = w.kind === 'discharge';
      const label = fitLabel(width, windowLabels(w));
      return svg`<g class="window"><title>${windowTitle(w)}</title>
        <rect x=${x1} y=${y} width=${width} height=${TRACK_H} rx="3" fill=${discharge ? c.dischargeColor : c.chargeColor}></rect>
        ${label ? svg`<text x=${x1 + width / 2} y=${y + 10.5} text-anchor="middle" font-size="10" font-weight="600" fill=${discharge ? DISCHARGE_INK : '#fff'}>${label}</text>` : nothing}</g>`;
    });
  return svg`<g class="battery">
    <rect x=${PAD.left} y=${y} width=${plotW} height=${TRACK_H} rx="3" fill="rgba(120, 120, 128, 0.12)"></rect>
    <g fill="none" stroke="var(--secondary-text-color)" stroke-width="1.2"><rect x="9" y=${y + 3} width="15" height="8" rx="1.5"></rect><path d=${`M25.5 ${y + 5.5}v3`}></path></g>
    <rect x="11" y=${y + 5} width="7" height="4" rx="0.5" fill="var(--secondary-text-color)"></rect>
    ${bars}
  </g>`;
};
