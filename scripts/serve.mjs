// Minimal static file server for the preview page and tests. Usage: node scripts/serve.mjs [port]
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const port = Number(process.argv[2] ?? 4173);
const types = { '.html': 'text/html', '.js': 'text/javascript' };

createServer((req, res) => {
  const file = normalize(join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/preview/index.html`));
