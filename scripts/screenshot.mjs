// Renders preview/index.html in headless Chrome/Edge and writes PNGs to preview/out/.
// Usage: npm run screenshot            (needs `npm run build` first)
//        CHROME=/path/to/chrome npm run screenshot
// Extra one-off shots go on the command line as name=query, so PR-specific scenarios aren't committed:
//   npm run screenshot -- 'gbp-dark=theme=dark&cfg={"unit":"£/kWh","rate_multiplier":1}' blank=blank=1
// The query is passed to preview/index.html (see its params: theme, time, width, scenario, blank, entity, cfg).

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const root = resolve(import.meta.dirname, '..');
const outDir = join(root, 'preview', 'out');

const candidates = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const browser = candidates.find((p) => existsSync(p));
if (!browser) throw new Error('No Chrome/Edge found. Set the CHROME env var to its path.');
if (!existsSync(join(root, 'dist', 'energy-price-graph-card.js'))) throw new Error('Run `npm run build` first.');

const types = { '.html': 'text/html', '.js': 'text/javascript' };
const server = createServer((req, res) => {
  const file = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!file.startsWith(root) || !existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/preview/index.html`;

mkdirSync(outDir, { recursive: true });
const shots = [
  ['dark', 'theme=dark'],
  ['light', 'theme=light'],
  ['dark-mobile', 'theme=dark&width=360'],
  ['dark-free', 'theme=dark&time=03:10'],
];
for (const arg of process.argv.slice(2)) {
  const [name, ...rest] = arg.split('=');
  if (!/^[\w-]+$/.test(name) || !rest.length) throw new Error(`Bad shot "${arg}", expected name=query`);
  shots.push([name, new URLSearchParams(rest.join('=')).toString()]);
}
const b = await puppeteer.launch({ executablePath: browser, headless: true });
try {
  for (const [name, query] of shots) {
    const page = await b.newPage();
    page.on('pageerror', (e) => console.error(`[${name}]`, e.message));
    await page.setViewport({ width: 600, height: 340, deviceScaleFactor: 2 });
    await page.goto(`${base}?${query}`);
    await page.waitForFunction(
      () => document.querySelector('energy-price-graph-card')?.shadowRoot?.querySelector('svg path'),
      { timeout: 15000 },
    );
    const out = join(outDir, `${name}.png`);
    await (await page.$('#card')).screenshot({ path: out });
    console.log(`wrote ${out}`);
    await page.close();
  }
} finally {
  await b.close();
  server.close();
}
