// Bundles the card to dist/. The card's version is taken from package.json and baked in as __CARD_VERSION__.
// The release workflow sets package.json's version from the git tag before building, so tags are the source of truth.
// Usage: npm run build            npm run watch
import { readFileSync } from 'node:fs';
import { build, context } from 'esbuild';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const options = {
  entryPoints: ['src/energy-price-graph-card.ts'],
  bundle: true,
  minify: true,
  format: 'esm',
  target: 'es2021',
  legalComments: 'none',
  outfile: 'dist/energy-price-graph-card.js',
  define: { __CARD_VERSION__: JSON.stringify(version) },
  logLevel: 'info',
};

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
