// F24: peladen bukti lokal (basis data uji + sesi tertanam) untuk tangkapan layar /compiler. Bukan bagian rilis. node scripts/f24_serve.mjs [port]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDb } from '../tests/helpers/db.js';
import { loggedIn } from '../tests/helpers/http.js';
import { loadWorkbook } from '../tests/helpers/fixtures.js';
import { readWorkbook } from '../server/import/sheetReader.js';
import { handle } from '../server/app.js';
import { PUBLIC_PATTERNS } from './public_manifest.mjs';
import { PAGE_HEADERS } from '../server/pageHeaders.js';
import { isPagePath } from '../server/pages.js';
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..'), port = Number(process.argv[2] || 8791);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const db = await createTestDb('f24srv'), A = await loggedIn('Analis Bukti F24', '10.24.9.9');
const r = await A.post('/api/imports', readWorkbook(loadWorkbook('Empagliflozin25', 'Development of Empagliflozin 25 mg Tablet.xlsx', ['UDT_Release', 'UDT_pH_1_2', 'UDT_pH_4_5', 'UDT_pH_6_8']))); if (r.status !== 201) throw new Error(JSON.stringify(r.json));
createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/') || isPagePath(url.pathname)) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const h = { ...req.headers, cookie: A.cookie, 'x-forwarded-for': A.ip };
      const o = await handle(new Request(url, { method: req.method, headers: h, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }));
      const hh = {}; o.headers.forEach((v, k) => { hh[k] = v; }); res.writeHead(o.status, hh); return res.end(Buffer.from(await o.arrayBuffer()));
    }
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, ''), full = normalize(join(ROOT, rel));
    if (!full.startsWith(ROOT + sep) || !PUBLIC_PATTERNS.some((p) => p.test(rel))) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'content-type': MIME[extname(full)] || 'application/octet-stream', ...(extname(full) === '.html' ? PAGE_HEADERS : {}) }); res.end(await readFile(full));
  } catch { res.writeHead(404); res.end('404'); }
}).listen(port, '127.0.0.1', () => console.log('f24 serve http://localhost:' + port + '/compiler'));
process.on('SIGTERM', async () => { await db.drop(); process.exit(0); });
