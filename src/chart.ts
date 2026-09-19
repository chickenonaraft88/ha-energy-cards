import { nothing, svg, type TemplateResult } from 'lit';
import { fmtTick, xTicks, yAxis } from './axis';
import { gradientStops } from './colors';
import { fmtTime } from './data';
import type { Rate, Session } from './types';

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
  nowColor: string;
  incentiveColor: string;
  incentiveLabel: string;
  unit: string;
}

const PAD = { left: 36, right: 16, top: 28, bottom: 22 };

const badge = (x: number, y: number, text: string, color: string) => {
  const w = text.length * 6.4 + 12;
  return svg`<rect x=${x} y=${y} width=${w} height="16" rx="3" fill=${color}></rect>
    <text x=${x + w / 2} y=${y + 11.5} text-anchor="middle" fill="#fff" font-size="10" font-weight="600">${text}</text>`;
};

export const renderChart = (c: ChartInput): TemplateResult => {
  const { width: W, height: H } = c;
  const plotW = Math.max(W - PAD.left - PAD.right, 10);
  const plotH = H - PAD.top - PAD.bottom;

  const pts: Array<[number, number]> = c.rates.map((r) => [r.start, r.value]);
  const last = c.rates[c.rates.length - 1];
  if (last) pts.push([last.end, last.value]);

  const visible = pts.filter(([t]) => t >= c.start && t <= c.end);
  if (!visible.length) {
    return svg`<svg width=${W} height=${H} viewBox="0 0 ${W} ${H}"><text x=${W / 2} y=${H / 2}
      text-anchor="middle" fill="var(--secondary-text-color)" font-size="13">No rate data</text></svg>`;
  }

  const { yMin, yMax, step, ticks } = yAxis(visible.map((p) => p[1]));

  const x = (t: number) => PAD.left + ((t - c.start) / (c.end - c.start)) * plotW;
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;
  const y0 = y(0);

  const line = pts.map(([t, v], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = `${line}L${x(pts[pts.length - 1][0]).toFixed(1)},${y0.toFixed(1)}L${x(pts[0][0]).toFixed(1)},${y0.toFixed(1)}Z`;

  const gid = `g-${c.uid}`;
  const cid = `c-${c.uid}`;
  const stops = gradientStops(c.dark).map(([v, col]) => {
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

  const sessions = c.sessions
    .filter((s) => s.end >= c.start && s.start <= c.end)
    .map((s) => {
      const x1 = x(Math.max(s.start, c.start));
      const x2 = x(Math.min(s.end, c.end));
      const labelW = c.incentiveLabel.length * 6.4 + 12;
      return svg`<rect x=${x1} y=${PAD.top} width=${Math.max(x2 - x1, 1)} height=${plotH}
          fill=${c.incentiveColor} opacity=${c.dark ? 0.14 : 0.09}></rect>
        <line x1=${x1} x2=${x1} y1=${PAD.top} y2=${PAD.top + plotH} stroke=${c.incentiveColor}></line>
        <line x1=${x2} x2=${x2} y1=${PAD.top} y2=${PAD.top + plotH} stroke=${c.incentiveColor}></line>
        ${badge(Math.min(x1 + 4, W - PAD.right - labelW), 2, c.incentiveLabel, c.incentiveColor)}`;
    });

  const nx = x(c.now);
  const nowMarker =
    c.now >= c.start && c.now <= c.end
      ? svg`<line x1=${nx} x2=${nx} y1=${PAD.top - 8} y2=${PAD.top + plotH} stroke=${c.nowColor}></line>
        ${badge(Math.min(nx - 17, W - PAD.right - 34), PAD.top - 24, 'NOW', c.nowColor)}`
      : nothing;

  return svg`<svg width=${W} height=${H} viewBox="0 0 ${W} ${H}" role="img" aria-label="Energy price graph">
    <defs>
      <linearGradient id=${gid} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1=${y(yMax)} y2=${y(yMin)}>${stops}</linearGradient>
      <clipPath id=${cid}><rect x=${PAD.left} y=${PAD.top - 8} width=${plotW} height=${plotH + 16}></rect></clipPath>
    </defs>
    ${grid}
    ${sessions}
    <g clip-path="url(#${cid})">
      <path d=${area} fill="url(#${gid})" fill-opacity="0.16" stroke="none"></path>
      <path d=${line} fill="none" stroke="url(#${gid})" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"></path>
    </g>
    ${xLabels}
    ${nowMarker}
  </svg>`;
};
