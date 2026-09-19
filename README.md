# Energy Price Graph Card

A standalone Home Assistant Lovelace card that shows a 24h half-hourly energy price graph. It is a single dependency-free web component (Lit, inline SVG, about 26 kB minified). It doesn't need `config-template-card`, `apexcharts-card` or `card-mod`.

It's built around the [Octopus Energy integration](https://github.com/BottlecapDave/HomeAssistant-OctopusEnergy) but works with any event entity that exposes a `rates` attribute in the same shape.

- Line and area chart coloured by price: negative is cyan to blue, 0–5p is green, 5–20p goes green to orange, 20–30p goes orange to red, and 30p and above is red. Colours follow the HA dark/light theme.
- The header shows the current price with `NOW · HH:mm` (or `· FREE` at 0p or below), and the next price with `NEXT · HH:mm`.
- Active or upcoming reduced-usage incentive sessions (e.g. Octoplus Power Down) are shaded purple. The header switches to purple and adds the label while a session is active.
- A NOW marker line is drawn on the chart.
- A visual editor is built in.

## Installation

### HACS (custom repository)

1. HACS → ⋮ → **Custom repositories**.
2. Add this repository's URL with type **Dashboard** (called *Lovelace* in older HACS versions).
3. Install **Energy Price Graph Card** and reload the browser.

### Manual

Download `energy-price-graph-card.js` from the latest release, copy it to `config/www/`, and add a dashboard resource of type **JavaScript module**:

```
/local/energy-price-graph-card.js
```

## Configuration

Add the card from the dashboard card picker and use the visual editor, or use YAML:

```yaml
type: custom:energy-price-graph-card
current_rate_entity: sensor.octopus_energy_electricity_<mpan>_<serial>_current_rate
next_rate_entity: sensor.octopus_energy_electricity_<mpan>_<serial>_next_rate
current_day_rates_entity: event.octopus_energy_electricity_<mpan>_<serial>_current_day_rates
next_day_rates_entity: event.octopus_energy_electricity_<mpan>_<serial>_next_day_rates
incentive_events_entity: event.octopus_energy_<account>_octoplus_power_down_events
```

| Option | Default | Description |
|---|---|---|
| `current_day_rates_entity` | **required** | Event entity with a `rates` attribute (`start`, `end`, `value_inc_vat`). |
| `next_day_rates_entity` | – | Same shape. Empty until tomorrow's rates are published. |
| `current_rate_entity` | derived from rates | Sensor whose state is the current rate. |
| `next_rate_entity` | derived from rates | Sensor whose state is the next rate. |
| `incentive_events_entity` | – | Entity whose `joined_events` attribute lists sessions (`start`, `end`, or `duration_in_minutes`). |
| `incentive_events_attribute` | `joined_events` | Attribute holding the session list. |
| `incentive_label` | `POWER DOWN` | Label on the chart band and header. |
| `free_label` | `FREE` | Header suffix when the current price is 0p or below. |
| `unit` | `p/kWh` | Unit shown next to prices. |
| `rate_multiplier` | `100` | Applied to raw values (£ to p). Use `1` if your values are already in pence. |
| `hours` | `24` | Chart span, starting from the top of the current hour. |
| `height` | `190` | Chart height in px. |

The card assumes rate values are in £/kWh, as the Octopus Energy integration provides them, and multiplies them by 100 for display.

## Development

```sh
npm install
npm run typecheck
npm run build     # -> dist/energy-price-graph-card.js
```

## Releasing

Push a tag such as `v0.1.0`. The workflow in `.github/workflows/release.yml` type-checks, builds, and attaches `energy-price-graph-card.js` to a GitHub release, which is what HACS installs.

```sh
git tag v0.1.0 && git push origin v0.1.0
```

Before publishing, make sure the `documentationURL` in `src/energy-price-graph-card.ts` points at your repository.
