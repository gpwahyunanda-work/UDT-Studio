// F22: peladen uji lokal TANPA basis data: menyajikan Studio (/studio-app) dengan CSP penuh yang sama dengan produksi + stub API Compiler.
// Pakai: node scripts/f22_serve.mjs [port]   (hanya untuk bukti E2E; bukan bagian rilis)
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STUDIO_FRAME_HEADERS } from '../server/pageHeaders.js';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..'), port = Number(process.argv[2] || 19222);
const MIME = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
const json = (res, st, o) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
let commits = 0;
createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), p = u.pathname;
  if (p === '/studio-app') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...STUDIO_FRAME_HEADERS }); return res.end(readFileSync(join(ROOT, 'index.html'))); }
  if (p === '/api/me') return json(res, 200, { role: 'penulis', display_name: 'Uji F22' });
  if (p === '/api/products') return req.method === 'POST' ? json(res, 201, { compile_id: 1 }) : json(res, 200, { products: [] });
  if (p === '/api/products/match') return json(res, 200, { candidates: [] });
  if (p === '/api/ingest/preview') return json(res, 200, { runs: [] });
  if (p === '/api/ingest/commit') { commits++; return json(res, 200, { counts: { runs: 1 } }); }
  if (p === '/__commits') return json(res, 200, { commits });
  if (/^\/(vendor|theme|icons|studio-ext)\//.test(p)) {
    const f = normalize(join(ROOT, decodeURIComponent(p)));
    if (f.startsWith(ROOT + sep) && existsSync(f)) { res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream', 'x-content-type-options': 'nosniff' }); return res.end(readFileSync(f)); }
  }
  res.writeHead(404); res.end('404');
}).listen(port, '127.0.0.1', () => console.log('f22 serve di http://127.0.0.1:' + port + '/studio-app'));
