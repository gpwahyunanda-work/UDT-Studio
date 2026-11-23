// Server Node biasa (laptop atau Olympus): file statis repo + handler yang sama dengan Vercel. Membuktikan portabilitas (REQ-066).
// Jalankan: DATABASE_URL=... SESSION_SECRET=... UDT_SHARED_PASSWORD_HASH=... APP_ENV=dev node server/node-server.mjs [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from './app.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
const PUBLIC = [/^index\.html$/, /^UDT Studio\.html$/, /^compiler\//, /^theme\//, /^studio-ext\//, /^icons\//];   // hanya yang memang diterbitkan; bukan db/, server/, tests/, .env*

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const r = await handle(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }));
      const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
      const sc = r.headers.getSetCookie?.(); if (sc?.length) h['set-cookie'] = sc;
      res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer())); return;
    }
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    if (/^compiler\/?$/.test(rel)) rel = 'compiler/index.html';
    const full = normalize(join(ROOT, rel));
    if (!full.startsWith(ROOT + sep) || !PUBLIC.some(p => p.test(rel.replace(/\\/g, '/')))) { res.writeHead(404); res.end('Tidak ditemukan'); return; }
    res.writeHead(200, { 'content-type': MIME[extname(full)] || 'application/octet-stream', 'x-content-type-options': 'nosniff' });
    res.end(await readFile(full));
  } catch { res.writeHead(404); res.end('Tidak ditemukan'); }
}).listen(Number(process.argv[2] || 8787), '127.0.0.1', () => console.log('UDT Studio di http://127.0.0.1:' + (process.argv[2] || 8787)));
