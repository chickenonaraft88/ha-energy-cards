# Energy Price Graph Card

Lit/TypeScript Lovelace card, bundled with esbuild to `dist/energy-price-graph-card.js`.

## Commands

| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | Biome check; fails on warnings. `npm run lint:fix` applies fixes. |
| `npm test` | Vitest unit tests in `test/` (pure logic in `src/data.ts`, `src/colors.ts`, `src/stub.ts`) |
| `npm run build` | Bundle to `dist/` (`scripts/build.mjs`, bakes in the version from `package.json`) |
| `npm run size` | Fails if the bundle is over 40 kB (run after build) |
| `npm run test:e2e` | Playwright tests in `e2e/` against `preview/index.html`, using installed Chrome (`PW_CHANNEL=msedge` for Edge; run after build) |
| `npm run screenshot` | Render preview PNGs, see below |

CI (`.github/workflows/ci.yml`) runs all of these except `screenshot`, and none is optional. Run the same set locally before opening a PR.

## Conventions

- Biome owns formatting (single quotes, 2 spaces, 120 columns, LF line endings). Run `npm run lint:fix` rather than formatting by hand.
- Card logic that doesn't need a DOM belongs in a pure module under `src/` with a test in `test/`. `energy-price-graph-card.ts` registers a custom element on import, so it can't be unit tested directly.
- Bug fixes get a regression test. Layout bugs (clipping, overlap) go in `e2e/card.e2e.ts`.
- Work on a branch and open a PR rather than pushing to `main`.
- Releases: the git tag is the version, so don't bump `package.json` (it stays `0.0.0-dev`) or open a version PR. See "Releasing" below. Dependabot opens weekly dependency PRs.
- The card's version comes from `package.json` via `scripts/build.mjs` (`__CARD_VERSION__`); don't hard-code it in `src/`.

## PR titles

PR titles follow Conventional Commits: `type(scope): summary`, with a lowercase imperative summary and no full stop, e.g. `fix(predbat): hide the track and legend when there is no plan to show`. Merges are merge commits and the release notes are generated from PR titles, so the title is what readers of a release see and what decides the version bump. Commit messages inside a PR can be free-form.

| Type | Use for | Version bump |
|---|---|---|
| `feat` | a new option or visual feature | minor |
| `fix` | a bug fix, including layout bugs | patch |
| `perf` | speed or bundle size | patch |
| `refactor`, `docs`, `test`, `ci`, `build`, `chore`, `deps` | no user-visible change | none on their own |

A `!` after the type or scope (`feat(config)!: ...`) marks a breaking change to config or behaviour: major.

The scope is optional and short. Use one of `chart`, `predbat`, `config` (options and the visual editor), `colors`, `axis`, `release`, `deps`, or leave it out.

## Screenshots

`npm run screenshot` (run `npm run build` first) renders the card with mock data and writes `preview/out/{dark,light,dark-mobile,dark-free}.png`. Use `preview/index.html?theme=dark|light&time=HH:mm&width=px&scenario=flat|nosession|negative&blank=1&entity=pence&cfg={json}` to check other states (`predbat=1` adds a mock Predbat plan and sets `predbat_prefix`; `blank=1` makes the rate sensors report `''`; `entity=pence` makes them report pence instead of £ (pair with `cfg={"rate_multiplier":1}`); `scenario=negative` dips well past the -7p blue saturation point overnight and at midday while staying slightly positive around the morning/evening peaks, to exercise negative rates; `cfg` is merged into the card config, e.g. `cfg={"hours":0}`).

Those four are the only committed shots. Scenarios for a single change are one-offs: pass them on the command line as `name=query` (`npm run screenshot -- 'gbp-dark=theme=dark&cfg={"unit":"£/kWh","rate_multiplier":1}'`) rather than adding them to `scripts/screenshot.mjs`.

### Creating a PR

For any change that can affect what the card looks like (`src/chart.ts`, `src/colors.ts`, `src/energy-price-graph-card.ts` styles/render, `preview/`):

Every such PR must include **before and after** screenshots, and both must show data that exercises the change. A PR without both is not ready to open.

1. Pick the scenario(s) that show the change. The data has to make the difference visible: a fix for £ units needs a preview using `unit`/`rate_multiplier` for £, not the default pence data where nothing changes. Build it as a command-line shot (`npm run screenshot -- name=query`, see above) and don't add it to `scripts/screenshot.mjs`. If the preview page can't express the state, add a generic param to `preview/index.html` on the branch instead.
2. **Before:** check out `main` (or the PR's base), run `npm run build && npm run screenshot -- <your shots>`, and copy the PNGs you need to `preview/out/before-<name>.png`. If the scenario needs a new preview param, keep the branch's `preview/index.html` (it is static and loads `dist/`).
3. **After:** on the PR branch, run the same command, then open the PNGs and check they look right (dark and light at minimum). Copy them to `preview/out/after-<name>.png`.
4. Attach every pair with `gh` (needs a version that supports `--attach`; docs: https://docs.github.com/en/github-cli/github-cli/attaching-files-with-github-cli), with alt text saying which is which and what data it shows:
   - `gh pr create --attach 'preview/out/before-dark.png#Before, dark theme, £/kWh rates' --attach 'preview/out/after-dark.png#After, dark theme, £/kWh rates' ...`
   - or, on an existing PR, `gh pr comment <n> --attach ...` / `gh pr edit <n> --attach ...`.

   Alt text goes after `#`. The same file can't be attached twice, which is why before/after files are named separately. If `gh` rejects `--attach` (older version), fall back to telling the user which files in `preview/out/` to drag into the PR. Never commit `preview/out/` or add a branch just for images.
5. In the PR description, say in one line what each pair demonstrates and give the exact `npm run screenshot -- ...` command so a reviewer can reproduce it.

If the change is a new visual feature with no "before" (nothing equivalent existed), say so in the description and show the after screenshots only.

Skip screenshots for changes with no visual effect (docs, CI, types-only).

### Reviewing a PR

For visual changes, check that the PR shows both before and after screenshots (description or comments) and that the data in them actually exercises the change. If either is missing, or the screenshots show default data where nothing would differ, say so in the review and treat the PR as not ready. To verify, check out the branch, run `npm ci && npm run build && npm run screenshot`, and compare against what the PR shows. Look for clipped labels, overlapping badges, wrong colours, and both dark and light themes.

## Releasing

Tag from an up-to-date `main` with CI green, and only when the user asks for a release. Pushing the tag publishes it, so confirm first.

1. Pick the next version by looking at the latest tag (`git tag --sort=-v:refname | head -1`) and the PR titles merged since (`git log <tag>..main --merges --oneline`, or `gh pr list --state merged --search "merged:>=<tag date>"`). The highest type wins: any `!` is major, else any `feat` is minor, else `fix` or `perf` is patch. If only no-bump types merged, there is nothing to release.
2. `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. The release workflow (`.github/workflows/release.yml`) runs `npm version` from the tag, builds, and publishes the GitHub release with generated notes and `energy-price-graph-card.js` attached (what HACS installs). Check the run succeeded and the asset is on the release (`gh release view vX.Y.Z`).

The notes are generated from merged PR titles, so write descriptive ones (see "PR titles"). Tags must be `vMAJOR.MINOR.PATCH`.
