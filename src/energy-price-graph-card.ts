import { css, html, LitElement, nothing, type PropertyValues } from 'lit';
import { renderChart } from './chart';
import { palette, priceColor, priceScale, resolveBands } from './colors';
import {
  cheapestWindow,
  clampHeight,
  clampHours,
  clampWindowHours,
  currentSlotStart,
  fmtTime,
  mergeRates,
  nextSlotStart,
  parseRates,
  parseSessions,
  parseStateNumber,
  rateAt,
  rateSummary,
  sessionActive,
  slotOverlapsSession,
} from './data';
import { buildConfigForm } from './form';
import { hoverInfo, planText, timeAtX, tooltipLeft, xAtTime } from './hover';
import { hasWindowIn, parseBatteryWindows, parseForecastRates, predbatEntityIds } from './predbat';
import { buildStubConfig } from './stub';
import type { EnergyPriceGraphCardConfig, HomeAssistant } from './types';

// Injected by scripts/build.mjs from package.json (the release workflow sets that from the tag).
declare const __CARD_VERSION__: string;
const CARD_VERSION = __CARD_VERSION__;
const HOUR = 3600000;
let uidCounter = 0;

const ENTITY_KEYS = [
  'current_rate_entity',
  'next_rate_entity',
  'current_day_rates_entity',
  'next_day_rates_entity',
  'incentive_events_entity',
] as const;

const validTime = (raw: unknown): number | undefined => {
  const t = raw ? new Date(raw as string).getTime() : NaN;
  return Number.isFinite(t) ? t : undefined;
};

class EnergyPriceGraphCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _config: { state: true },
    _width: { state: true },
    _tick: { state: true },
    _hoverX: { state: true },
    _tipWidth: { state: true },
  };

  hass?: HomeAssistant;
  _config?: EnergyPriceGraphCardConfig;
  _width = 0;
  _tick = 0;
  /** Pointer x within the chart while hovering or after a tap; undefined when nothing is selected. */
  _hoverX?: number;
  /** Measured width of the tooltip, so it can be kept inside the card. */
  _tipWidth = 0;

  private _uid = `epgc${++uidCounter}`;
  private _ro?: ResizeObserver;
  private _observed?: Element;
  private _timer?: number;

  static getStubConfig(hass?: HomeAssistant, entities: string[] = []): Partial<EnergyPriceGraphCardConfig> {
    // `entities` is only a subset of the user's entities, so search all states.
    return buildStubConfig(hass ? Object.keys(hass.states) : entities);
  }

  static getConfigForm() {
    return buildConfigForm();
  }

  setConfig(config: EnergyPriceGraphCardConfig): void {
    if (!config?.current_day_rates_entity) {
      throw new Error('current_day_rates_entity is required');
    }
    this._config = config;
  }

  getCardSize(): number {
    return 4;
  }

  getGridOptions() {
    return { columns: 12, rows: 4, min_columns: 6, min_rows: 3 };
  }

  connectedCallback(): void {
    super.connectedCallback();
    // Re-render every minute so the NOW marker and labels keep moving.
    this._timer = window.setInterval(() => this._tick++, 60000);
    window.addEventListener('pointerdown', this._outside);
    // disconnectedCallback dropped the observer; a card that was only moved isn't necessarily re-rendered.
    if (this.hasUpdated) this._observe();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('pointerdown', this._outside);
    window.clearInterval(this._timer);
    this._ro?.disconnect();
    this._ro = undefined;
    this._observed = undefined;
  }

  // A tap elsewhere dismisses the tooltip; a mouse dismisses it by leaving the chart.
  private _outside = (e: Event): void => {
    if (this._hoverX !== undefined && !e.composedPath().includes(this._observed as Element)) this._hoverX = undefined;
  };

  private _point = (e: PointerEvent): void => {
    this._hoverX = e.clientX - (e.currentTarget as Element).getBoundingClientRect().left;
  };

  private _leave = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') this._hoverX = undefined;
  };

  // The browser cancels the pointer when a touch turns into a page scroll, and no pointerleave follows.
  private _cancel = (): void => {
    this._hoverX = undefined;
  };

  // Focusing a slot (Tab, or arrow-key navigation below) shows the same tooltip pointer hover does: the rects'
  // x/width are in the same pixel space as _hoverX, since the SVG has no scaling relative to the chart div.
  private _focusSlot = (e: FocusEvent): void => {
    const target = e.target as Element;
    if (!target.classList?.contains('slot-focus')) return;
    this._hoverX = Number(target.getAttribute('x')) + Number(target.getAttribute('width')) / 2;
  };

  private _blurSlot = (e: FocusEvent): void => {
    const related = e.relatedTarget as Node | null;
    if (!related || !(e.currentTarget as Element).contains(related)) this._hoverX = undefined;
  };

  // Left/Right move the roving tab stop between slots; the chart re-renders with the new one focusable.
  private _navSlot = (e: KeyboardEvent): void => {
    const target = e.target as Element;
    if (!target.classList?.contains('slot-focus') || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    const slots = [...(e.currentTarget as Element).querySelectorAll('.slot-focus')];
    const next = slots[slots.indexOf(target) + (e.key === 'ArrowRight' ? 1 : -1)] as SVGElement | undefined;
    next?.focus();
  };

  protected updated(): void {
    this._observe();
    const tip = this.renderRoot.querySelector<HTMLElement>('.tooltip');
    const tipWidth = tip?.getBoundingClientRect().width;
    if (tipWidth !== undefined && tipWidth !== this._tipWidth) this._tipWidth = tipWidth;
  }

  private _observe(): void {
    // The chart container only exists once config + hass are set, so attach lazily.
    const el = this.renderRoot.querySelector('.chart');
    if (!el || this._observed === el) return;
    this._ro?.disconnect();
    this._observed = el;
    this._ro = new ResizeObserver(([entry]) => {
      const w = Math.floor(entry.contentRect.width);
      if (w > 0 && w !== this._width) this._width = w;
    });
    this._ro.observe(el);
  }

  protected shouldUpdate(changed: PropertyValues): boolean {
    if (changed.size === 1 && changed.has('hass')) {
      const old = changed.get('hass') as HomeAssistant | undefined;
      const cfg = this._config;
      if (!old || !cfg) return true;
      if (old.themes?.darkMode !== this.hass?.themes?.darkMode) return true;
      const ids: Array<string | undefined> = ENTITY_KEYS.map((k) => cfg[k]);
      if (cfg.predbat_prefix) ids.push(...Object.values(predbatEntityIds(cfg.predbat_prefix)));
      return ids.some((id) => (id ? old.states[id] !== this.hass?.states[id] : false));
    }
    return true;
  }

  protected render() {
    const cfg = this._config;
    const hass = this.hass;
    if (!cfg || !hass) return nothing;

    const dark = !!hass.themes?.darkMode;
    const mult = cfg.rate_multiplier ?? 100;
    const now = Date.now();
    const unit = cfg.unit ?? 'p/kWh';
    const scale = priceScale(unit);
    const bands = resolveBands(cfg.cheap_below, cfg.expensive_above);
    const incentiveLabel = cfg.incentive_label ?? 'POWER DOWN';
    const freeLabel = cfg.free_label ?? 'FREE';

    const currentDay = cfg.current_day_rates_entity ? hass.states[cfg.current_day_rates_entity] : undefined;
    if (!currentDay) {
      return html`<ha-card><div class="msg">Entity not found: ${cfg.current_day_rates_entity}</div></ha-card>`;
    }

    const rates = mergeRates(
      parseRates(currentDay, mult),
      parseRates(cfg.next_day_rates_entity ? hass.states[cfg.next_day_rates_entity] : undefined, mult),
    );
    const sessions = parseSessions(
      cfg.incentive_events_entity ? hass.states[cfg.incentive_events_entity] : undefined,
      cfg.incentive_events_attribute ?? 'joined_events',
    );

    const predbat = cfg.predbat_prefix ? predbatEntityIds(cfg.predbat_prefix) : undefined;

    // Current / next price: prefer the dedicated sensors, fall back to the rates list.
    const price = (entityId: string | undefined, fallback: number | undefined) => {
      const raw = entityId ? parseStateNumber(hass.states[entityId]?.state) : undefined;
      return raw === undefined ? fallback : raw * mult;
    };
    const nextStart = nextSlotStart(now);
    const curPrice = price(cfg.current_rate_entity, rateAt(rates, now)?.value);
    const nextPrice = price(cfg.next_rate_entity, rateAt(rates, nextStart)?.value);

    const validFrom = (entityId: string | undefined) => {
      const attrs = entityId ? hass.states[entityId]?.attributes : undefined;
      return validTime(attrs?.rate?.valid_from ?? attrs?.valid_from);
    };
    const curTime = validFrom(cfg.current_rate_entity) ?? rateAt(rates, now)?.start ?? currentSlotStart(now);
    const nextTime = validFrom(cfg.next_rate_entity) ?? nextStart;

    const active = sessionActive(sessions, now);
    const nextIncentive = slotOverlapsSession(sessions, nextStart);
    const pal = palette(dark);
    const curColor = active ? pal.purple : priceColor(curPrice ?? 0, dark, scale, bands);
    const nextColor = nextIncentive ? pal.purple : priceColor(nextPrice ?? 0, dark, scale, bands);
    const nowLineColor = priceColor(curPrice ?? 0, dark, scale, bands);

    let curLabel = `NOW · ${fmtTime(curTime)}`;
    if (active) curLabel += ` · ${incentiveLabel}`;
    else if ((curPrice ?? 1) <= 0) curLabel += ` · ${freeLabel}`;
    const nextLabel = `NEXT · ${fmtTime(nextTime)}${nextIncentive ? ` · ${incentiveLabel}` : ''}`;

    const spanHours = clampHours(cfg.hours);
    const start = new Date(now);
    start.setMinutes(0, 0, 0);
    // No track when neither plan entity exists (wrong prefix, or Predbat isn't running), rather than an empty one.
    const battery =
      predbat && (hass.states[predbat.charge] || hass.states[predbat.export])
        ? parseBatteryWindows(
            hass.states[predbat.charge],
            hass.states[predbat.export],
            start.getTime() + spanHours * HOUR,
          )
        : undefined;

    // The legend explains what is drawn: plan swatches only with plan windows in range, the dashed line only with a forecast.
    const planShown = !!battery && hasWindowIn(battery, start.getTime(), start.getTime() + spanHours * HOUR);
    const lastReal = rates[rates.length - 1]?.end;
    const forecast =
      predbat && cfg.predbat_rates !== false && lastReal !== undefined
        ? parseForecastRates(hass.states[predbat.rates], scale, lastReal).filter(
            (r) => r.start < start.getTime() + spanHours * HOUR,
          )
        : [];

    const fmt = (v: number | undefined) => (v === undefined ? '—' : v.toFixed(2));

    const dayStart = new Date(now).setHours(0, 0, 0, 0);
    const summary = cfg.show_rate_summary ? rateSummary(rates, dayStart, dayStart + 24 * HOUR) : undefined;
    const vsAverage = summary && curPrice !== undefined ? curPrice - summary.average : undefined;

    const end = start.getTime() + spanHours * HOUR;
    const windowHours = clampWindowHours(cfg.cheapest_window_hours);
    const cheapest = windowHours
      ? cheapestWindow(
          rates.filter((r) => r.end > start.getTime() && r.start < end),
          windowHours,
        )
      : undefined;
    const cheapestLabel = windowHours ? `CHEAPEST ${windowHours}H` : '';
    const hoverT = this._hoverX === undefined ? undefined : timeAtX(this._hoverX, this._width, start.getTime(), end);
    const hover = hoverT === undefined ? undefined : hoverInfo({ t: hoverT, rates, forecast, sessions, battery });
    // The tooltip is centred on the slot's visible part, so it doesn't jump around as the pointer moves within it.
    const hoverMid = hover
      ? xAtTime(
          (Math.max(hover.start, start.getTime()) + Math.min(hover.end, end)) / 2,
          this._width,
          start.getTime(),
          end,
        )
      : 0;

    return html`<ha-card>
      <div class="header">
        <div class="stat">
          <div class="value" style="color:${curColor}">${fmt(curPrice)}<span class="uom">${unit}</span></div>
          <div class="label">${curLabel}</div>
        </div>
        <div class="stat right">
          <div class="value" style="color:${nextColor}">${fmt(nextPrice)}<span class="uom">${unit}</span></div>
          <div class="label">${nextLabel}</div>
        </div>
      </div>
      <div class="chart" @pointerdown=${this._point} @pointermove=${this._point} @pointerleave=${this._leave}
        @pointercancel=${this._cancel} @focusin=${this._focusSlot} @focusout=${this._blurSlot}
        @keydown=${this._navSlot}>
        ${
          this._width
            ? renderChart({
                uid: this._uid,
                rates,
                width: this._width,
                height: clampHeight(cfg.height),
                dark,
                now,
                start: start.getTime(),
                end: start.getTime() + spanHours * HOUR,
                sessions,
                forecast,
                battery,
                chargeColor: pal.blue,
                dischargeColor: pal.cyan,
                nowColor: nowLineColor,
                incentiveColor: pal.purple,
                incentiveLabel,
                unit,
                priceScale: scale,
                bands,
                hover,
                cheapestWindow: cheapest,
                cheapestLabel,
                cheapestColor: pal.green,
              })
            : nothing
        }
        ${
          hover
            ? html`<div
                id="${this._uid}-tip"
                class="tooltip"
                role="tooltip"
                style="left:${tooltipLeft(hoverMid, this._tipWidth, this._width)}px"
              >
                <div class="when">${fmtTime(hover.start)}–${fmtTime(hover.end)}</div>
                <div class="price">${fmt(hover.value)}<span class="uom">${unit}</span></div>
                ${hover.predicted ? html`<div class="note">Predicted by Predbat</div>` : nothing}
                ${hover.incentive ? html`<div class="note">${incentiveLabel}</div>` : nothing}
                ${hover.plan ? html`<div class="note">Predbat: ${planText(hover.plan)}</div>` : nothing}
              </div>`
            : nothing
        }
      </div>
      ${
        planShown || forecast.length || summary
          ? html`<div class="legend">
              ${
                summary
                  ? html`<span
                      >Avg ${fmt(summary.average)}${unit} · Min ${fmt(summary.min)}${unit} · Max
                      ${fmt(summary.max)}${unit}${
                        vsAverage === undefined ? '' : ` · ${vsAverage >= 0 ? '+' : ''}${fmt(vsAverage)}${unit} vs avg`
                      }</span
                    >`
                  : nothing
              }
              ${
                planShown
                  ? html`<span><i style="background:${pal.blue}"></i>Charge</span>
                      <span><i style="background:${pal.cyan}"></i>Discharge</span>`
                  : nothing
              }
              ${forecast.length ? html`<span><i class="dashed"></i>Predbat prices</span>` : nothing}
              ${planShown ? html`<span>Predbat plan</span>` : nothing}
            </div>`
          : nothing
      }
    </ha-card>`;
  }

  static styles = css`
    ha-card {
      padding: 10px 0 8px;
      overflow: hidden;
    }
    .msg {
      padding: 16px;
      color: var(--error-color, #db4437);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 0 16px;
    }
    .stat.right {
      text-align: right;
    }
    .value {
      font-size: 30px;
      font-weight: 500;
      line-height: 32px;
      letter-spacing: -0.6px;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .uom {
      margin-left: 4px;
      font-size: 14px;
      letter-spacing: 0;
      color: var(--secondary-text-color);
    }
    .label {
      margin-top: 5px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.25px;
      line-height: 13px;
      text-transform: uppercase;
      color: var(--primary-text-color);
      opacity: 0.82;
    }
    .chart {
      position: relative;
      margin-top: 4px;
      line-height: 0;
      /* Vertical drags still scroll the page; horizontal ones move the tooltip. */
      touch-action: pan-y;
    }
    .tooltip {
      position: absolute;
      top: 24px;
      z-index: 1;
      padding: 6px 10px;
      border-radius: 8px;
      background: var(--card-background-color, #fff);
      border: 1px solid var(--divider-color, rgba(120, 120, 128, 0.4));
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
      color: var(--primary-text-color);
      font-size: 12px;
      line-height: 16px;
      white-space: nowrap;
      pointer-events: none;
    }
    .tooltip .when {
      color: var(--secondary-text-color);
    }
    .tooltip .price {
      font-size: 16px;
      font-weight: 500;
      line-height: 20px;
      font-variant-numeric: tabular-nums;
    }
    .tooltip .uom {
      font-size: 11px;
    }
    .tooltip .note {
      color: var(--secondary-text-color);
    }
    .legend {
      display: flex;
      justify-content: flex-end;
      gap: 16px;
      padding: 6px 16px 0;
      font-size: 11px;
      color: var(--secondary-text-color);
    }
    .legend span {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .legend i {
      width: 10px;
      height: 10px;
      border-radius: 2px;
    }
    .legend i.dashed {
      width: 14px;
      height: 0;
      border-top: 2px dashed var(--secondary-text-color);
      border-radius: 0;
      background: none;
    }
    svg {
      display: block;
    }
    svg text {
      font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif);
    }
    svg .axis {
      font-size: 11px;
      fill: var(--primary-text-color);
      opacity: 0.85;
    }
    svg .grid,
    svg .zero {
      stroke: rgba(120, 120, 128, 0.18);
      stroke-dasharray: 4;
    }
    svg .zero {
      stroke: rgba(120, 120, 128, 0.4);
    }
    svg line {
      stroke-width: 1;
    }
    svg .slot-focus {
      outline: none;
    }
    svg .slot-focus:focus-visible {
      fill: var(--primary-text-color);
      fill-opacity: 0.08;
      stroke: var(--primary-color, #03a9f4);
      stroke-width: 2;
    }
  `;
}

customElements.define('energy-price-graph-card', EnergyPriceGraphCard);

(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: 'energy-price-graph-card',
  name: 'Energy Price Graph Card',
  description: '24h half-hourly energy price graph with incentive-session shading (Octopus Energy friendly).',
  preview: false,
  documentationURL: 'https://github.com/chickenonaraft88/ha-energy-cards',
});

console.info(`%c ENERGY-PRICE-GRAPH-CARD %c v${CARD_VERSION} `, 'color:#fff;background:#0A84FF', '');
