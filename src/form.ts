interface FormSchema {
  name?: string;
  title?: string;
}

const LABELS: Record<string, string> = {
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
  predbat_prefix: 'Predbat entity prefix',
  predbat_rates: 'Show Predbat predicted rates',
};

const HELPERS: Record<string, string> = {
  current_rate_entity: 'Optional - derived from the rates if empty.',
  next_rate_entity: 'Optional - derived from the rates if empty.',
  current_day_rates_entity: 'Event entity with a "rates" attribute.',
  next_day_rates_entity: "Optional. Empty until tomorrow's rates are published.",
  incentive_events_entity: 'Optional. Shades active/upcoming sessions on the chart.',
  predbat_prefix: 'Optional, usually "predbat". Shows the planned battery charge/discharge under the chart.',
  predbat_rates: "Fills the chart after the last published rate with Predbat's predictions, marked with a dotted line.",
  rate_multiplier: 'Applied to raw values. 100 converts £ to p.',
};

/**
 * Label for a schema entry. Home Assistant falls back to `schema.name.split(...)` when this
 * returns something falsy, which throws for nameless entries such as `expandable`, so always
 * return a non-empty string.
 */
export const computeLabel = (s: FormSchema): string => (s.name && LABELS[s.name]) || s.title || s.name || '-';

export const computeHelper = (s: FormSchema): string | undefined => (s.name ? HELPERS[s.name] : undefined);

/** Schema for Home Assistant's built-in (ha-form based) visual editor. */
export const buildConfigForm = () => ({
  schema: [
    { name: 'current_day_rates_entity', required: true, selector: { entity: { domain: 'event' } } },
    { name: 'next_day_rates_entity', selector: { entity: { domain: 'event' } } },
    { name: 'current_rate_entity', selector: { entity: { domain: 'sensor' } } },
    { name: 'next_rate_entity', selector: { entity: { domain: 'sensor' } } },
    { name: 'incentive_events_entity', selector: { entity: { domain: 'event' } } },
    { name: 'predbat_prefix', selector: { text: {} } },
    { name: 'predbat_rates', selector: { boolean: {} } },
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
  computeLabel,
  computeHelper,
});
