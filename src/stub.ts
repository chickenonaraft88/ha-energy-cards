import type { EnergyPriceGraphCardConfig } from './types';

/** Guess entities from the ids in `hass.states` (Octopus Energy integration naming). */
export const buildStubConfig = (ids: string[]): Partial<EnergyPriceGraphCardConfig> => {
  const find = (re: RegExp) => ids.find((e) => re.test(e) && !e.includes('_export_')) ?? '';

  // Pick one (import) meter from its day-rates entity, then derive its siblings.
  const dayRates = find(/^event\..*_current_day_rates$/);
  const prefix = dayRates.replace(/^event\./, '').replace(/_current_day_rates$/, '');
  const sibling = (domain: string, suffix: string) => {
    const id = `${domain}.${prefix}_${suffix}`;
    return prefix && ids.includes(id) ? id : '';
  };

  return {
    current_rate_entity: sibling('sensor', 'current_rate'),
    next_rate_entity: sibling('sensor', 'next_rate'),
    current_day_rates_entity: dayRates,
    next_day_rates_entity: sibling('event', 'next_day_rates'),
    incentive_events_entity: find(/^event\..*_octoplus_power_down_events$/),
    power_up_events_entity: find(/^event\..*_octoplus_power_up_events$/),
    predbat_prefix: ids.includes('predbat.best_charge_limit') ? 'predbat' : '',
  };
};
