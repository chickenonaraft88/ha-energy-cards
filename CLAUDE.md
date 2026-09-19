# Energy Price Graph Card

Lit/TypeScript Lovelace card, bundled with esbuild to `dist/energy-price-graph-card.js`. Commands: `npm run typecheck`, `npm run build`, `npm run screenshot`.

## Screenshots

`npm run screenshot` (run `npm run build` first) renders the card with mock data and writes `preview/out/{dark,light,dark-mobile,dark-free}.png`. Use `preview/index.html?theme=dark|light&time=HH:mm&width=px&scenario=flat|nosession` to check other states.

### Creating a PR

For any change that can affect what the card looks like (`src/chart.ts`, `src/colors.ts`, `src/energy-price-graph-card.ts` styles/render, `preview/`):

1. Build and run `npm run screenshot`, then open the PNGs and check they look right.
2. Add a scenario to the preview page or `scripts/screenshot.mjs` if the change needs a state that isn't covered.
3. `gh` can't upload images, so end the PR description with a "Screenshots" section and tell the user which files in `preview/out/` to drag into the PR. Never commit `preview/out/` or add a branch just for images.

Skip screenshots for changes with no visual effect (docs, CI, types-only).

### Reviewing a PR

For visual changes, check that the PR shows screenshots (description or comments). If they're missing, say so in the review. To verify, check out the branch, run `npm ci && npm run build && npm run screenshot`, and compare against what the PR shows. Look for clipped labels, overlapping badges, wrong colours, and both dark and light themes.
