export interface HassEntity {
  state: string;
  attributes: Record<string, any>;
}

export interface HomeAssistant {
  states: Record<string, HassEntity | undefined>;
  themes?: { darkMode?: boolean };
  /** Not present on the lightweight preview stub - device stats are simply skipped when it's missing. */
  callWS?: (msg: Record<string, unknown>) => Promise<unknown>;
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
  /** Entity with a list of Octoplus Power Up (encouraged-usage) events, shaded separately from incentive_events_entity. */
  power_up_events_entity?: string;
  /** Attribute on the power-up entity holding the list of events. */
  power_up_events_attribute?: string;
  /** Label shown for an active/upcoming power-up session. */
  power_up_label?: string;
  free_label?: string;
  unit?: string;
  /** Multiplier applied to raw values to reach display units (default 100: £ -> p). */
  rate_multiplier?: number;
  /** Rates below this (in the card's unit) are coloured green. Setting either threshold switches to green/amber/red bands. */
  cheap_below?: number;
  /** Rates at or above this (in the card's unit) are coloured red; those between the thresholds are amber. */
  expensive_above?: number;
  /** Entity prefix of a Predbat install (usually `predbat`). Shows its charge/discharge plan under the chart. */
  predbat_prefix?: string;
  /** Fill the chart past the end of the real rates with Predbat's predicted rates (default true; needs `predbat_prefix`). */
  predbat_rates?: boolean;
  /** Chart span in hours (default 24). */
  hours?: number;
  /** Chart height in px (default 190). */
  height?: number;
  /** Shades the cheapest contiguous run of this many hours in the visible rates. Unset disables it. */
  cheapest_window_hours?: number;
  /** Power sensors to suggest a cheapest run time for, learned from each one's usage history. */
  devices?: string[];
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
