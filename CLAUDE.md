# Energy Price Graph Card

Lit/TypeScript Lovelace card, bundled with esbuild to `dist/energy-price-graph-card.js`.

## Commands

| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | Biome check; fails on warnings. `npm run lint:fix` applies fixes. |
| `npm test` | Vitest unit tests in `test/` (pure logic in `src/data.ts`, `src/colors.ts`, `src/stub.ts`) |
| `npm run build` | Bundle to `dist/` |
| `npm run size` | Fails if the bundle is over 40 kB (run after build) |
| `npm run test:e2e` | Playwright tests in `e2e/` against `preview/index.html`, using installed Chrome (`PW_CHANNEL=msedge` for Edge; run after build) |
| `npm run screenshot` | Render preview PNGs, see below |

CI (`.github/workflows/ci.yml`) runs all of these except `screenshot`, and none is optional. Run the same set locally before opening a PR.

## Conventions

- Biome owns formatting (single quotes, 2 spaces, 120 columns, LF line endings). Run `npm run lint:fix` rather than formatting by hand.
- Card logic that doesn't need a DOM belongs in a pure module under `src/` with a test in `test/`. `energy-price-graph-card.ts` registers a custom element on import, so it can't be unit tested directly.
- Bug fixes get a regression test. Layout bugs (clipping, overlap) go in `e2e/card.e2e.ts`.
- Work on a branch and open a PR rather than pushing to `main`.
- Releases: push a tag like `v0.1.3`; the release workflow builds and attaches `energy-price-graph-card.js`, which is what HACS installs. Dependabot opens weekly dependency PRs.

## Screenshots

`npm run screenshot` (run `npm run build` first) renders the card with mock data and writes `preview/out/{dark,light,dark-mobile,dark-free}.png`. Use `preview/index.html?theme=dark|light&time=HH:mm&width=px&scenario=flat|nosession` to check other states.

### Creating a PR

For any change that can affect what the card looks like (`src/chart.ts`, `src/colors.ts`, `src/energy-price-graph-card.ts` styles/render, `preview/`):

Every such PR must include **before and after** screenshots, and both must show data that exercises the change. A PR without both is not ready to open.

1. Pick the scenario(s) that show the change. The data has to make the difference visible: a fix for £ units needs a preview using `unit`/`rate_multiplier` for £, not the default pence data where nothing changes. If no existing scenario does, add one to the preview page or `scripts/screenshot.mjs` first (on the branch, so it is available for both runs).
2. **Before:** with the new scenario available, check out `main` (or the PR's base), run `npm run build && npm run screenshot`, and copy the PNGs you need to `preview/out/before-<name>.png`.
3. **After:** on the PR branch, run `npm run build && npm run screenshot`, then open the PNGs and check they look right (dark and light at minimum). Copy them to `preview/out/after-<name>.png`.
4. Attach every pair with `gh` (needs a version that supports `--attach`; docs: https://docs.github.com/en/github-cli/github-cli/attaching-files-with-github-cli), with alt text saying which is which and what data it shows:
   - `gh pr create --attach 'preview/out/before-dark.png#Before, dark theme, £/kWh rates' --attach 'preview/out/after-dark.png#After, dark theme, £/kWh rates' ...`
   - or, on an existing PR, `gh pr comment <n> --attach ...` / `gh pr edit <n> --attach ...`.

   Alt text goes after `#`. The same file can't be attached twice, which is why before/after files are named separately. If `gh` rejects `--attach` (older version), fall back to telling the user which files in `preview/out/` to drag into the PR. Never commit `preview/out/` or add a branch just for images.
5. In the PR description, say in one line what each pair demonstrates and which scenario/data it uses.

If the change is a new visual feature with no "before" (nothing equivalent existed), say so in the description and show the after screenshots only.

Skip screenshots for changes with no visual effect (docs, CI, types-only).

### Reviewing a PR

For visual changes, check that the PR shows both before and after screenshots (description or comments) and that the data in them actually exercises the change. If either is missing, or the screenshots show default data where nothing would differ, say so in the review and treat the PR as not ready. To verify, check out the branch, run `npm ci && npm run build && npm run screenshot`, and compare against what the PR shows. Look for clipped labels, overlapping badges, wrong colours, and both dark and light themes.
