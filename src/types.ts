export interface HassEntity {
  state: string;
  attributes: Record<string, any>;
}

export interface HomeAssistant {
  states: Record<string, HassEntity | undefined>;
  themes?: { darkMode?: boolean };
}

export interface EnergyPriceGraphCardConfig {
  type: string;
  current_rate_entity?: string;
  next_rate_entity?: string;
  current_day_rates_entity: string;
  next_day_rates_entity?: string;
  incentive_events_entity?: string;
  /** Attribute on the incentive entity holding the list of events. */
  incentive_events_attribute?: string;
  /** Label shown for an active/upcoming incentive session. */
  incentive_label?: string;
  free_label?: string;
  unit?: string;
  /** Multiplier applied to raw values to reach display units (default 100: £ -> p). */
  rate_multiplier?: number;
  /** Entity prefix of a Predbat install (usually `predbat`). Shows its charge/discharge plan under the chart. */
  predbat_prefix?: string;
  /** Chart span in hours (default 24). */
  hours?: number;
  /** Chart height in px (default 190). */
  height?: number;
}

export interface Rate {
  start: number;
  end: number;
  value: number;
}

export interface Session {
  start: number;
  end: number;
}

/** A planned forced battery charge or discharge, from Predbat. `target` is the SoC percentage aimed for. */
export interface BatteryWindow {
  start: number;
  end: number;
  kind: 'charge' | 'discharge';
  target: number;
}
