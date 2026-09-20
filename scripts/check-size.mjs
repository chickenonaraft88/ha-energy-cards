// Fails if the built bundle grows past the limit. Run `npm run build` first.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const file = 'dist/energy-price-graph-card.js';
const limitKb = Number(process.env.MAX_KB ?? 42);

const bytes = readFileSync(file);
const kb = bytes.length / 1024;
const gz = gzipSync(bytes).length / 1024;
console.log(`${file}: ${kb.toFixed(1)} kB (${gz.toFixed(1)} kB gzipped), limit ${limitKb} kB`);

if (kb > limitKb) {
  console.error(`Bundle is over the ${limitKb} kB limit.`);
  process.exit(1);
}
