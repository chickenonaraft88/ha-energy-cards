# Contributing

Issues and pull requests are welcome.

## Setup

```sh
npm install
npm run build        # bundles to dist/energy-price-graph-card.js
npm run typecheck
```

Before opening a PR also run `npm run lint` (Biome; `npm run lint:fix` applies fixes), `npm test` (unit), `npm run size` (bundle limit) and `npm run test:e2e` (browser). CI runs all of them.

## Trying changes without Home Assistant

`npm run screenshot` renders the card with mock Octopus data and writes PNGs (dark, light, mobile, negative price) to `preview/out/`. For a live view, serve the repo root and open `/preview/index.html?theme=dark`. Query options: `theme`, `time=HH:mm`, `width=px`, `scenario=flat|nosession`.

## Pull requests

- Keep each PR focused on one change.
- For anything that changes how the card looks, attach dark and light screenshots to the PR.
- Update the README if you add or change a config option.

## Releases

Maintainers publish a release by pushing a tag like `v0.1.3`. The release workflow builds the bundle and attaches `energy-price-graph-card.js`, which is what HACS installs.
