import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import { renderChart } from './chart';
import { palette, priceColor } from './colors';
import {
  currentSlotStart,
  fmtTime,
  mergeRates,
  nextSlotStart,
  parseRates,
  parseSessions,
  rateAt,
  sessionActive,
  slotOverlapsSession,
} from './data';
import { buildStubConfig } from './stub';
import type { EnergyPriceGraphCardConfig, HomeAssistant } from './types';

const CARD_VERSION = '0.1.0';
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
  };

  hass?: HomeAssistant;
  _config?: EnergyPriceGraphCardConfig;
  _width = 0;
  _tick = 0;

  private _uid = `epgc${++uidCounter}`;
  private _ro?: ResizeObserver;
  private _observed?: Element;
  private _timer?: number;

  static getStubConfig(hass?: HomeAssistant, entities: string[] = []): Partial<EnergyPriceGraphCardConfig> {
    // `entities` is only a subset of the user's entities, so search all states.
    return buildStubConfig(hass ? Object.keys(hass.states) : entities);
  }

  static getConfigForm() {
    const labels: Record<string, string> = {
      current_rate_entity: 'Current rate sensor',
      next_rate_entity: 'Next rate sensor',
      current_day_rates_entity: 'Current day rates',
      next_day_rates_entity: 'Next day rates',
      incentive_events_entity: 'Reduced usage incentive events',
      incentive_label: 'Incentive label',
      free_label: 'Free label',
      unit: 'Unit',
      rate_multiplier: 'Rate multiplier',
      hours: 'Hours shown',
      height: 'Chart height (px)',
      incentive_events_attribute: 'Incentive events attribute',
    };
    const helpers: Record<string, string> = {
      current_rate_entity: 'Optional - derived from the rates if empty.',
      next_rate_entity: 'Optional - derived from the rates if empty.',
      current_day_rates_entity: 'Event entity with a "rates" attribute.',
      next_day_rates_entity: 'Optional. Empty until tomorrow\'s rates are published.',
      incentive_events_entity: 'Optional. Shades active/upcoming sessions on the chart.',
      rate_multiplier: 'Applied to raw values. 100 converts £ to p.',
    };
    return {
      schema: [
        { name: 'current_day_rates_entity', required: true, selector: { entity: { domain: 'event' } } },
        { name: 'next_day_rates_entity', selector: { entity: { domain: 'event' } } },
        { name: 'current_rate_entity', selector: { entity: { domain: 'sensor' } } },
        { name: 'next_rate_entity', selector: { entity: { domain: 'sensor' } } },
        { name: 'incentive_events_entity', selector: { entity: { domain: 'event' } } },
        {
          type: 'expandable',
          title: 'Advanced',
          schema: [
            { name: 'incentive_label', selector: { text: {} } },
            { name: 'incentive_events_attribute', selector: { text: {} } },
            { name: 'free_label', selector: { text: {} } },
            { name: 'unit', selector: { text: {} } },
            { name: 'rate_multiplier', selector: { number: { mode: 'box', step: 'any' } } },
            { name: 'hours', selector: { number: { min: 6, max: 48, mode: 'box' } } },
            { name: 'height', selector: { number: { min: 100, max: 500, mode: 'box' } } },
          ],
        },
      ],
      computeLabel: (s: { name: string }) => labels[s.name] ?? s.name,
      computeHelper: (s: { name: string }) => helpers[s.name],
    };
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
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this._timer);
    this._ro?.disconnect();
    this._ro = undefined;
    this._observed = undefined;
  }

  protected updated(): void {
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
      if (!old || !this._config) return true;
      if (old.themes?.darkMode !== this.hass?.themes?.darkMode) return true;
      return ENTITY_KEYS.some((k) => {
        const id = this._config![k];
        return id ? old.states[id] !== this.hass?.states[id] : false;
      });
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

    // Current / next price: prefer the dedicated sensors, fall back to the rates list.
    const price = (entityId: string | undefined, fallback: number | undefined) => {
      const raw = entityId ? Number(hass.states[entityId]?.state) : NaN;
      return Number.isFinite(raw) ? raw * mult : fallback;
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
    const curColor = active ? pal.purple : priceColor(curPrice ?? 0, dark);
    const nextColor = nextIncentive ? pal.purple : priceColor(nextPrice ?? 0, dark);
    const nowLineColor = priceColor(curPrice ?? 0, dark);

    let curLabel = `NOW · ${fmtTime(curTime)}`;
    if (active) curLabel += ` · ${incentiveLabel}`;
    else if ((curPrice ?? 1) <= 0) curLabel += ` · ${freeLabel}`;
    const nextLabel = `NEXT · ${fmtTime(nextTime)}${nextIncentive ? ` · ${incentiveLabel}` : ''}`;

    const spanHours = cfg.hours ?? 24;
    const start = new Date(now);
    start.setMinutes(0, 0, 0);

    const fmt = (v: number | undefined) => (v === undefined ? '—' : v.toFixed(2));

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
      <div class="chart">
        ${this._width
          ? renderChart({
              uid: this._uid,
              rates,
              width: this._width,
              height: cfg.height ?? 190,
              dark,
              now,
              start: start.getTime(),
              end: start.getTime() + spanHours * HOUR,
              sessions,
              nowColor: nowLineColor,
              incentiveColor: pal.purple,
              incentiveLabel,
            })
          : nothing}
      </div>
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
      margin-top: 4px;
      line-height: 0;
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
