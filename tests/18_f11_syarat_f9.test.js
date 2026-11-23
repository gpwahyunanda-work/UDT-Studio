// F11: regresi penutupan syarat F9 (K-1..K-6). [LAPTOP: PostgreSQL 17 biasa]
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createTestDb } from './helpers/db.js';
import { Client, loggedIn, adminLoggedIn } from './helpers/http.js';
import { loadWorkbook, hasFixtures, REPO } from './helpers/fixtures.js';
import { readWorkbook } from '../server/import/sheetReader.js';
import { passwordProblems } from '../server/accounts.js';

const rd = (f) => readFileSync(join(REPO, f), 'utf8');
const opt = { skip: hasFixtures ? false : 'fixture data/sheets/csv tidak ada' };
let db, W, ADM, PID;
const body = (o = {}) => ({ medium: '4,5', batch: 'F1100Z26A', variant: '', test_date: '2026-11-01', comparator: 'B41968', timepoints: [5, 10, 15, 20, 30, 45, 60],
  vessels: [{ no: 1, values: [78.7, 84.4, 87.3, 88.8, 90, 92, 95] }, { no: 2, values: [60, 70, 75, 80, 82, 85, 92] }, { no: 3, values: [55, 70, 76, 82, 84, 86, 93] }], ...o });
const withVals = (vals) => body({ batch: 'F1100Z26R', vessels: [{ no: 1, values: [10, 20, 30, 40, 50, 60, vals] }, { no: 2, values: [11, 21, 31, 41, 51, 61, 70] }] });

before(async () => {
  if (!hasFixtures) return;
  db = await createTestDb('f11'); W = await loggedIn('Analis F11', '10.11.0.2'); ADM = await adminLoggedIn('10.11.0.1');
  const imp = await W.post('/api/imports', readWorkbook(loadWorkbook('Vastrol20', 'Development of Vastrol 20 mg Tablet.xlsx', ['pH_1_2', 'pH_4_5', 'pH_6_8']))); assert.equal(imp.status, 201);
  PID = (await W.get('/api/products')).json.products[0].id;
});
after(async () => { if (db) await db.drop(); });

// ---------------- K-1 ----------------
test('K-1: /api/bridge 404 generik (tanpa login, dengan login, semua metode), tanpa ACAO; bukan fungsi Vercel; kode worker tetap ada; DEFAULT_BACKEND_URL tidak berubah', opt, async () => {
  for (const c of [new Client('10.11.1.1'), W]) {
    for (const m of ['GET', 'POST', 'OPTIONS', 'PUT']) {
      const r = await c.call(m, '/api/bridge', m === 'GET' || m === 'OPTIONS' ? undefined : {});
      assert.equal(r.status, 404, m); assert.match(r.json.error, /dinonaktifkan/); assert.equal(r.headers.get('access-control-allow-origin'), null);
    }
  }
  const v = JSON.parse(rd('vercel.json'));
  assert.ok(!Object.keys(v.functions).some((k) => /bridge/.test(k)), 'tidak ada fungsi bridge');
  assert.ok(!JSON.stringify(v.rewrites).includes('bridge'), 'rewrite tanpa pengecualian bridge: /api/* seluruhnya ke fungsi utama');
  assert.ok(!existsSync(join(REPO, 'api', 'bridge.js')), 'api/bridge.js tidak boleh jadi fungsi');
  assert.ok(existsSync(join(REPO, 'cloudflare-worker', 'worker.js')) && existsSync(join(REPO, 'cloudflare-worker', 'vercel-entry.js')), 'kode tidak dihapus');
  assert.match(rd('index.html'), /DEFAULT_BACKEND_URL = "https:\/\/udt-studio\.vercel\.app\/api\/bridge"/);
  assert.doesNotMatch(JSON.stringify(v.headers), /"Access-Control-Allow-Origin","value":"\*"/);
  for (const f of ['server/app.js', 'server/node-server.mjs', 'server/pages.js', 'server/pageHeaders.js']) assert.doesNotMatch(rd(f), /access-control-allow-origin['"]?\s*[:,]\s*['"]\*/i, f);
});

// ---------------- K-2 ----------------
test('K-2: POST dengan body null (juga angka, larik, string) = 400, bukan 500', opt, async () => {
  for (const b of [null, 5, [], 'x']) {
    for (const p of [`/api/products/${PID}/runs/preview`, `/api/products/${PID}/runs`, '/api/products', `/api/compiles/${PID}/aliases`, '/api/ingest/preview']) {
      const r = await W.post(p, b); assert.equal(r.status, 400, `${p} ${JSON.stringify(b)}`);
    }
  }
  assert.equal((await W.post(`/api/products/${PID}/runs/preview`, body())).status, 200, 'masukan sah tetap 200');
});

// ---------------- K-3 ----------------
test('K-3: kata sandi yang memuat bagian lokal email (>= 6 huruf) ditolak tanpa memandang kapital; bagian lokal pendek tidak', () => {
  const e = 'bagianlokal@uji.test';
  for (const pw of ['bagianlokal+12345', 'BagianLokal+12345', 'BAGIANLOKAL-9876-xyz', 'xx-BagianLokal-xx-99']) assert.ok(passwordProblems(pw, { email: e }).some((x) => /bagian depan email/.test(x)), pw);
  assert.deepEqual(passwordProblems('sandi-kuat-acak-7391', { email: e }), []);
  assert.deepEqual(passwordProblems('abcde-sandi-kuat-7391', { email: 'abcde@uji.test' }), [], 'bagian lokal 5 huruf: tidak ditolak');
  assert.ok(passwordProblems('Abcdef-sandi-7391', { email: 'abcdef@uji.test' }).length, 'tepat 6 huruf: ditolak');
});
test('K-3 (API): ganti kata sandi dengan bagian lokal email = 400', opt, async () => {
  const c = await loggedIn('Rahmawati Uji', '10.11.0.9');
  const r = await c.post('/api/auth/password', { current_password: (await import('./helpers/db.js')).TEST_PASSWORD, new_password: 'RAHMAWATI.uji+12345' });
  assert.equal(r.status, 400); assert.ok(r.json.details.length);
});

// ---------------- K-4 ----------------
test('K-4: persen terlarut di luar -5..150 = 400 "di luar rentang wajar" (pratinjau dan simpan); -5..150 termasuk 100-110 boleh', opt, async () => {
  for (const v of [-5.1, -50, 150.1, 1e9]) {
    const pv = await W.post(`/api/products/${PID}/runs/preview`, withVals(v)); assert.equal(pv.status, 400, String(v)); assert.match(JSON.stringify(pv.json.details), /di luar rentang wajar/);
    const sv = await W.post(`/api/products/${PID}/runs`, { ...withVals(v), push_id: randomUUID() }); assert.equal(sv.status, 400, 'simpan ' + v);
  }
  for (const v of [-5, 0, 100, 105, 110, 150]) assert.equal((await W.post(`/api/products/${PID}/runs/preview`, withVals(v))).status, 200, String(v));
  const n0 = Number((await db.app.query('SELECT count(*) n FROM run')).rows[0].n);
  const ok = await W.post(`/api/products/${PID}/runs`, { ...withVals(104.2), push_id: randomUUID() }); assert.equal(ok.status, 201);
  assert.equal(Number((await db.app.query('SELECT count(*) n FROM run')).rows[0].n), n0 + 1);
});

// ---------------- K-5 ----------------
test('K-5: dialog Compiler dan Studio: focus trap (Tab/Shift+Tab berputar), ESC menutup, fokus kembali ke pemicu', () => {
  const c = rd('compiler/app.js'), s = rd('studio-ext/kirim.js');
  assert.match(c, /opener = document\.activeElement/); assert.match(c, /opener\.focus\(\)/); assert.match(c, /e\.key !== 'Tab'/); assert.match(c, /e\.shiftKey && i <= 0/); assert.match(c, /e\.key === 'Escape'/);
  assert.match(s, /e\.key !== 'Tab'/); assert.match(s, /e\.shiftKey && i <= 0/); assert.match(s, /btn\.focus\(\)/); assert.match(s, /e\.key === 'Escape'/);
});

// ---------------- K-6 ----------------
test('K-6: Timpa menulis entri audit pada run lama (/api/runs/:id/audit tidak kosong); 404 teks polos memakai nosniff', opt, async () => {
  const first = await W.post(`/api/products/${PID}/runs`, { ...body({ batch: 'F1100Z26T' }), push_id: randomUUID() }); assert.equal(first.status, 201);
  const old = first.json.run_id;
  assert.deepEqual((await W.get(`/api/runs/${old}/audit`)).json.events, [], 'sebelum timpa: kosong');
  const changed = body({ batch: 'F1100Z26T', vessels: [{ no: 1, values: [70, 80, 85, 88, 90, 92, 95] }, { no: 2, values: [65, 75, 80, 85, 88, 90, 94] }] });
  const t = await W.post(`/api/products/${PID}/runs`, { ...changed, push_id: randomUUID(), decision: 'timpa' }); assert.equal(t.status, 201); assert.equal(t.json.status, 'ditimpa');
  const ev = (await W.get(`/api/runs/${old}/audit`)).json.events;
  assert.equal(ev.length, 1); assert.equal(ev[0].action, 'run_timpa'); assert.equal(ev[0].analyst, 'Analis F11');
  assert.ok(ev[0].changes.some((x) => x.field === 'visible' && x.new === 'false') && ev[0].changes.some((x) => x.field === 'replaced_by_run_id' && x.new === String(t.json.run_id)));
  assert.equal((await W.get(`/api/compiles/${PID}/removed`)).json.runs.find((r) => r.run_id === old).kind, 'ditimpa', 'jejak lama tetap');
  const v = JSON.parse(rd('vercel.json')); assert.ok(v.headers.some((h) => h.source === '/(.*)' && h.headers.some((x) => x.key === 'X-Content-Type-Options' && x.value === 'nosniff')));
});
test('K-6: server Node 404 teks polos: X-Content-Type-Options nosniff + content-type text/plain', async () => {
  const port = 19100 + Math.floor(Math.random() * 90);
  const child = spawn(process.execPath, ['server/node-server.mjs', String(port)], { cwd: REPO, stdio: 'ignore' });
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 40; i++) { try { await fetch(base + '/theme/pharos-theme.css'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
    for (const p of ['/tidak-ada.txt', '/server/app.js']) { const r = await fetch(base + p); assert.equal(r.status, 404, p); assert.equal(r.headers.get('x-content-type-options'), 'nosniff', p); assert.match(r.headers.get('content-type'), /^text\/plain/); await r.text(); }
  } finally { child.kill(); }
});
