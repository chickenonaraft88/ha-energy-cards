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

The git tag is the version; there is no version-bump PR. Maintainers publish a release from an up-to-date `main` with CI green:

```sh
gh release create v0.1.4 --target main --generate-notes
```

That creates the tag and the release with generated notes. The tag triggers the release workflow, which sets the package version from it, builds the bundle and attaches `energy-price-graph-card.js` to that release, which is what HACS installs. `package.json` stays at `0.0.0-dev`. The release notes list merged PR titles, so keep those descriptive.
