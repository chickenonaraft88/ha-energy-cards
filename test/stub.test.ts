import { describe, expect, it } from 'vitest';
import { buildStubConfig } from '../src/stub';

const imp = 'octopus_energy_electricity_111_aaa';
const exp = 'octopus_energy_electricity_222_bbb_export';

describe('buildStubConfig', () => {
  it('derives sibling entities from the import meter and finds the incentive entity', () => {
    const ids = [
      `event.${imp}_current_day_rates`,
      `event.${imp}_next_day_rates`,
      `sensor.${imp}_current_rate`,
      `sensor.${imp}_next_rate`,
      'event.octopus_energy_a_1_octoplus_power_down_events',
    ];
    expect(buildStubConfig(ids)).toEqual({
      current_rate_entity: `sensor.${imp}_current_rate`,
      next_rate_entity: `sensor.${imp}_next_rate`,
      current_day_rates_entity: `event.${imp}_current_day_rates`,
      next_day_rates_entity: `event.${imp}_next_day_rates`,
      incentive_events_entity: 'event.octopus_energy_a_1_octoplus_power_down_events',
      predbat_prefix: '',
    });
  });

  it('never picks the export meter, even when it is listed first', () => {
    const ids = [
      `event.${exp}_current_day_rates`,
      `sensor.${exp}_current_rate`,
      `event.${imp}_current_day_rates`,
      `sensor.${imp}_current_rate`,
    ];
    const cfg = buildStubConfig(ids);
    expect(cfg.current_day_rates_entity).toBe(`event.${imp}_current_day_rates`);
    expect(cfg.current_rate_entity).toBe(`sensor.${imp}_current_rate`);
  });

  it('leaves entities empty when they do not exist', () => {
    expect(buildStubConfig([`event.${imp}_current_day_rates`])).toEqual({
      current_rate_entity: '',
      next_rate_entity: '',
      current_day_rates_entity: `event.${imp}_current_day_rates`,
      next_day_rates_entity: '',
      incentive_events_entity: '',
      predbat_prefix: '',
    });
  });

  it('enables Predbat when its plan entities exist', () => {
    expect(buildStubConfig(['predbat.best_charge_limit', 'predbat.best_export_limit']).predbat_prefix).toBe('predbat');
  });

  it('returns all empty strings for an install without the integration', () => {
    expect(Object.values(buildStubConfig(['light.kitchen'])).every((v) => v === '')).toBe(true);
  });
});
