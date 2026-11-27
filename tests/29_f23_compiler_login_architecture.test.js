// F23 butir 1-5: nama produk utuh, rentang tanggal dinamis, login/ganti sandi (validasi klien + alert + tampilkan sandi),
// /architecture tanpa metadata developer/agent, placeholder netral. [LAPTOP: PostgreSQL 17 biasa]
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import * as step4 from '../server/step4.js';
import { runProfile, f2Between } from '../server/lib/udtBridge.js';
import { MIN_PW, MAX_PW } from '../server/accounts.js';
import { extractFunction } from '../scripts/modules_lock.mjs';
import { createTestDb } from './helpers/db.js';
import { loggedIn, Client } from './helpers/http.js';
import { REPO } from './helpers/fixtures.js';

const rd = (f) => readFileSync(join(REPO, f), 'utf8');
let db, W, PID;
before(async () => { db = await createTestDb('f23'); W = await loggedIn('Penulis Sembilan', '10.23.0.1'); });
after(async () => { if (db) await db.drop(); });

const vs = (means) => [1, 2, 3].map((no, i) => ({ no, values: means.map((m) => m + (i - 1) * 0.1) }));
const mk = (key, role, batch, medium, date, means) => ({ key, medium_code: medium, brand_name: role === 'reference' ? 'Empaglif Ref' : 'Test Empagliflozin 25 mg Tablet', batch_no: batch, role, variant: '', test_date: date, timepoints: [5, 10, 15], values: vs(means) });
async function seed() {
  const c = await W.post('/api/compiles', { product_name: 'Test Empagliflozin', strength: '25 mg', dosage_form: 'Tablet' });
  assert.equal(c.status, 201, JSON.stringify(c.json)); PID = c.json.compile_id;
  const runs = [mk('ref', 'reference', 'R1', 'Release', '2026-03-10', [30, 50, 70]), mk('u1', 'uji', 'U1', 'Release', '2026-03-18', [28, 48, 68]), mk('ref2', 'reference', 'R1', '1,2', '2026-03-10', [31, 51, 71]), mk('u1b', 'uji', 'U1', '1,2', '2026-05-18', [27, 47, 67]), mk('u2', 'uji', 'U2', 'Release', '2026-05-18', [29, 49, 69])];
  const prof = (r) => runProfile(step4, r.timepoints, Object.fromEntries(r.values.map((v) => [v.no, v.values])));
  const cmp = (t) => ({ testKey: t.key, refKey: 'ref', n_points: 3, total_sq: 12, f2: f2Between(step4, prof(runs[0]), prof(t)).f2, conclusion_code: 'similar', points: [] });
  const cmp2 = (t, ref, rk) => ({ testKey: t.key, refKey: rk, n_points: 3, total_sq: 12, f2: f2Between(step4, prof(ref), prof(t)).f2, conclusion_code: 'similar', points: [] });
  const pk = { compile_id: PID, mediums: [{ code: 'Release', full_name: 'Release' }, { code: '1,2', full_name: 'pH 1,2' }], runs, comparisons: [cmp(runs[1]), cmp2(runs[3], runs[2], 'ref2'), cmp(runs[4])] };
  const r = await W.post('/api/ingest/commit', { push_id: randomUUID(), package: pk });
  assert.equal(r.status, 201, JSON.stringify(r.json));
}

// ------------------------------------------------------------------ 1. nama produk utuh
test('1 nama produk utuh di semua keluaran: label dashboard, daftar produk, ekspor xlsx; ringkasan klien tak lagi memotong kata pertama', async () => {
  await seed();
  const FULL = 'Test Empagliflozin 25 mg Tablet';
  const d = (await W.get(`/api/products/${PID}/dashboard`)).json; assert.equal(d.product.name, FULL);
  assert.equal((await W.get('/api/products')).json.products.find((p) => p.id === PID).name, FULL);
  const x = await W.get(`/api/products/${PID}/export?format=xlsx`);
  assert.equal(x.status, 200);
  const raw = await (await import('../server/app.js')).handle(new Request(`https://udt.test/api/products/${PID}/export?format=xlsx`, { headers: { cookie: W.cookie, 'x-forwarded-for': W.ip } }));
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(await raw.arrayBuffer()));
  assert.ok(wb.worksheets.some((s) => String(s.getCell('A2').value).toUpperCase() === FULL.toUpperCase()), 'A2 ekspor = nama utuh');
  const app = rd('compiler/app.js');
  assert.doesNotMatch(app, /name\.split\(' '\)\[0\]/, 'tidak ada pemotongan nama pada kata pertama');
  assert.match(app, /batch ' \+ esc\(p\.name\) \+ ' terkompilasi/);
  assert.doesNotMatch(rd('server/dashboard.js'), /firstWord/);
});

// ------------------------------------------------------------------ 2. rentang tanggal dinamis
function loadFilter(D, st) {
  const src = ['anyValid', 'visibleRows'].map((n) => extractFunction(rd('compiler/app.js'), n)).join('\n');
  const ctx = vm.createContext({ D, st }); vm.runInContext(src, ctx); return ctx;
}
test('2 rentang tanggal: batas dari SEMUA run (termasuk 18 Mei 2026 di medium lain), bawaan mencakup semua, filter memakai semua tanggal baris', async () => {
  const d = (await W.get(`/api/products/${PID}/dashboard`)).json;
  assert.equal(d.product.date_min, '2026-03-10'); assert.equal(d.product.date_max, '2026-05-18');
  assert.deepEqual(d.product.months, ['2026-03', '2026-05']);
  const u1 = d.runs.find((r) => r.key === 'U1');
  assert.equal(u1.date, '2026-03-18'); assert.deepEqual([...u1.dates].sort(), ['2026-03-18', '2026-05-18']);
  const all = { comp: null, inc: 'all', from: '', to: '' };
  assert.deepEqual(loadFilter(d, all).visibleRows(true).map((r) => r.key).sort(), ['U1', 'U2']);   // bawaan: semua
  const may = loadFilter(d, { ...all, from: '2026-05-01', to: '2026-05-18' }).visibleRows(true).map((r) => r.key).sort();
  assert.deepEqual(may, ['U1', 'U2']);   // U1 punya run 18 Mei di medium lain
  const mar = loadFilter(d, { ...all, to: '2026-04-30' }).visibleRows(true).map((r) => r.key);
  assert.deepEqual(mar, ['U1']);
  assert.deepEqual(loadFilter(d, { ...all, from: '2026-05-19' }).visibleRows(true), []);
  const html = rd('compiler/index.html');
  assert.match(html, /id="dt-from" type="date"/); assert.match(html, /id="dt-to" type="date"/);
  assert.doesNotMatch(html, /id="dt-(from|to)"[^>]*value=/, 'bawaan kosong = semua');
  assert.doesNotMatch(rd('compiler/app.js'), /18 Mar|2026-03-18/);
  const fm = extractFunction(rd('compiler/app.js'), 'fillMonths'); assert.match(fm, /date_min/); assert.match(fm, /date_max/);
});

// ------------------------------------------------------------------ 3. login dan ganti sandi
function fakePage(html, fetchImpl) {
  const script = html.split('<script>').pop().split('</script>')[0];
  const els = {}; const toggles = [];
  const el = (id, extra = {}) => (els[id] = { id, value: '', textContent: '', type: 'password', attrs: {}, listeners: {}, focused: false, focus() { this.focused = true; }, addEventListener(t, f) { this.listeners[t] = f; }, getAttribute(k) { return this.attrs[k] ?? null; }, setAttribute(k, v) { this.attrs[k] = v; }, ...extra });
  for (const m of html.matchAll(/<(?:input|div|form|button)[^>]*\bid="([A-Za-z0-9_-]+)"/g)) el(m[1]);
  for (const m of html.matchAll(/<button type="button" class="t" data-for="([a-z0-9]+)"/g)) { const b = el('tg_' + m[1], { attrs: { 'data-for': m[1], 'aria-pressed': 'false' } }); toggles.push(b); }
  const calls = []; const loc = { assigned: null, pathname: '/masuk', href: 'https://udt.test/masuk', assign(u) { this.assigned = u; } };
  const ctx = vm.createContext({ document: { getElementById: (i) => els[i] || null, querySelectorAll: () => toggles }, fetch: async (p, o) => { calls.push({ p, o }); return fetchImpl(p, o); }, location: loc, Array, JSON, console });
  vm.runInContext(script, ctx);
  return { els, calls, loc, toggles, submit: async () => { els.f.listeners.submit({ preventDefault() {} }); await new Promise((r) => setTimeout(r, 15)); } };
}
const resp = (status, j) => ({ status, json: async () => j });

test('3a login: validasi klien SEBELUM API; pesan selalu di kotak alert dan fokus ke pesan', async () => {
  const html = (await new Client().get('/masuk')).text;
  assert.match(html, /id="er" class="err" role="alert" tabindex="-1"/);
  const p = fakePage(html, async () => resp(401, { error: 'Masuk gagal. Periksa email/username dan kata sandi, atau tunggu sebelum mencoba lagi.' }));
  await p.submit(); assert.equal(p.calls.length, 0); assert.match(p.els.er.textContent, /email atau username dan kata sandi/i); assert.equal(p.els.er.focused, true);
  p.els.er.focused = false; p.els.em.value = 'budi'; await p.submit(); assert.equal(p.calls.length, 0); assert.match(p.els.er.textContent, /Kata sandi wajib/); assert.equal(p.els.pw.focused, true);
  p.els.em.value = '   '; p.els.pw.value = 'x'; await p.submit(); assert.equal(p.calls.length, 0); assert.match(p.els.er.textContent, /Email atau username wajib/);
  p.els.em.value = ' budi '; p.els.pw.value = 'salah-sekali'; p.els.er.focused = false; await p.submit();
  assert.equal(p.calls.length, 1); assert.equal(JSON.parse(p.calls[0].o.body).identity, 'budi');
  assert.match(p.els.er.textContent, /Masuk gagal\./); assert.equal(p.els.er.focused, true); assert.equal(p.els.pw.value, '');
  const q = fakePage(html, async () => resp(500, {}));   // galat tanpa badan JSON tetap tampil jelas
  q.els.em.value = 'a'; q.els.pw.value = 'b'; await q.submit(); assert.match(q.els.er.textContent, /kode 500/);
});

test('3b login: pesan anti-enumerasi server tidak berubah (akun tak dikenal = sandi salah)', async () => {
  const c = new Client('10.23.0.9');
  const a = await c.post('/api/auth/login', { identity: 'tidak.ada@uji.test', password: 'apa-saja-12345' });
  const b = await c.post('/api/auth/login', { identity: W.email, password: 'sandi-salah-12345' });
  assert.equal(a.status, 401); assert.equal(b.status, 401); assert.equal(a.json.error, b.json.error);
});

test('3c ganti sandi: wajib, panjang sesuai kebijakan server, konfirmasi sama; alert dan fokus', async () => {
  const html = (await W.get('/ganti-sandi')).text;
  assert.match(html, new RegExp(`Minimal ${MIN_PW} karakter`));
  const p = fakePage(html, async () => resp(400, { error: 'Masukan tidak valid', details: ['new_password: terlalu umum'] }));
  const set = (cu, n1, n2) => { p.els.cu.value = cu; p.els.n1.value = n1; p.els.n2.value = n2; p.els.er.focused = false; };
  const bad = async (cu, n1, n2, re, focus) => { set(cu, n1, n2); const n = p.calls.length; await p.submit(); assert.equal(p.calls.length, n, 'API tidak dipanggil'); assert.match(p.els.er.textContent, re); assert.equal(p.els.er.focused, true); if (focus) assert.equal(p.els[focus].focused, true); };
  await bad('', 'x'.repeat(20), 'x'.repeat(20), /saat ini wajib/, 'cu');
  await bad('lama-lama-1234', '', '', /baru wajib/, 'n1');
  await bad('lama-lama-1234', 'x'.repeat(MIN_PW - 1), 'x'.repeat(MIN_PW - 1), new RegExp(`minimal ${MIN_PW} karakter`), 'n1');
  await bad('lama-lama-1234', 'x'.repeat(MAX_PW + 1), 'x'.repeat(MAX_PW + 1), new RegExp(`maksimal ${MAX_PW}`), 'n1');
  await bad('lama-lama-1234', 'x'.repeat(20), '', /Ulangi/, 'n2');
  await bad('lama-lama-1234', 'x'.repeat(20), 'y'.repeat(20), /tidak sama/, 'n2');
  set('lama-lama-1234', 'x'.repeat(MIN_PW), 'x'.repeat(MIN_PW)); await p.submit();   // tepat panjang minimum: lolos klien, server menolak -> pesan server tampil di alert
  assert.equal(p.calls.length, 1); assert.match(p.els.er.textContent, /Masukan tidak valid: new_password: terlalu umum/); assert.equal(p.els.er.focused, true);
});

test('3d tombol tampilkan/sembunyikan: <button type=button> (fokus keyboard), aria-pressed dan label; mengubah type input', async () => {
  for (const html of [(await new Client().get('/masuk')).text, (await W.get('/ganti-sandi')).text]) {
    const btns = [...html.matchAll(/<button type="button" class="t" data-for="([a-z0-9]+)" aria-pressed="false" aria-label="([^"]+)">Tampilkan<\/button>/g)];
    assert.ok(btns.length >= 1); for (const b of btns) assert.match(b[2], /^Tampilkan kata sandi/);
    assert.doesNotMatch(html, /class="t"[^>]*tabindex="-1"/, 'dapat difokus keyboard');
    assert.match(html, /button:focus-visible/);
    const p = fakePage(html, async () => resp(200, {}));
    const t = p.toggles[0], inp = p.els[t.attrs['data-for']];
    p.ctxClick = () => t.listeners.click.call(t);
    p.ctxClick(); assert.equal(inp.type, 'text'); assert.equal(t.attrs['aria-pressed'], 'true');
    p.ctxClick(); assert.equal(inp.type, 'password'); assert.equal(t.attrs['aria-pressed'], 'false');
  }
});

// ------------------------------------------------------------------ 4. /architecture bersih
const BAD = { commit: /\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/, cabang: /feat\//, kartu: /\bF\d+[a-z]?\b/, agen: /GANESHA|BRAHMA|AGNI|INDRA/, jalur: /repo\//, lokal: /[A-Za-z]:[\\/]Users|\/Users\//, cabang2: /feat\/|compile-s1/ };
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;   // request_id/push_id sah, bukan hash commit
const scan = (label, raw) => { const text = String(raw).replace(UUID_RE, '<uuid>'); for (const [k, re] of Object.entries(BAD)) { const m = re.exec(text); assert.ok(!m, `${label}: pola ${k} ditemukan: "${text.slice(Math.max(0, m?.index - 30), (m?.index || 0) + 50).replace(/\s+/g, ' ')}"`); } };

test('4 /architecture dan /api: tanpa hash commit, cabang, id agen/kartu, jalur lokal; versi aplikasi netral', async () => {
  const idxRes = await W.get('/architecture/index.json'); assert.equal(idxRes.status, 200);
  const idx = idxRes.json ?? JSON.parse(idxRes.text);
  assert.equal(idx.versi, '0.4'); assert.equal(idx.dibuat, '2026-11-26'); assert.ok(!('sumber' in idx) && !('dibuat_oleh' in idx));
  const files = [...idx.diagram.map((d) => d.berkas), ...idx.lampiran.map((d) => d.berkas)];
  assert.ok(files.length >= 10);
  for (const f of files) { const r = await W.get(`/architecture/${f}`); assert.equal(r.status, 200, f); scan(`/architecture/${f}`, r.text ?? JSON.stringify(r.json)); }
  scan('/architecture/index.json', JSON.stringify(idx));
  for (const p of ['/architecture', '/architecture/', '/architecture/erd-relasi']) { const r = await W.get(p); assert.equal(r.status, 200, p); scan(p, r.text); }
  assert.match((await W.get('/architecture')).text, /Versi 0\.4, 26 Nov 2026/);
  for (const p of ['/api/health', '/api/me', '/api/products', `/api/products/${PID}/dashboard`, `/api/products/${PID}/info`, '/api/compiles', '/api/record/tables']) { const r = await W.get(p); if (r.status === 200) scan(p, JSON.stringify(r.json)); }
  // integritas: ukuran dan sha256 di index.json cocok dengan berkas sesudah pembersihan
  const { createHash } = await import('node:crypto');
  for (const d of idx.diagram) { const b = readFileSync(join(REPO, 'architecture', d.berkas)); assert.equal(b.length, d.ukuran_byte, d.berkas); assert.equal(createHash('sha256').update(b).digest('hex'), d.sha256, d.berkas); }
  // peta sumber (paspor node) tidak lagi memuat revisi/URL repositori
  for (const f of idx.diagram.map((d) => d.berkas)) assert.match(rd(`architecture/${f}`), /id="archify-source-evidence-data" type="application\/json">\{"schemaVersion":1,"verified":false\}</);
});

// ------------------------------------------------------------------ 5. placeholder netral
test('5 placeholder: tanpa contoh data tersemat (F0048J26A, F0066A26A, Kp Tinggi, "mis. ...") di compiler/, shell/, server/shell.js', () => {
  const files = ['compiler/index.html', 'compiler/app.js', 'shell/shell.js', 'shell/record.js', 'shell/architecture.js', 'server/shell.js', 'server/pages.js'];
  for (const f of files) { const t = rd(f); assert.doesNotMatch(t, /F00\d\d[A-Z]\d\d[A-Z]/, `${f}: kode batch contoh`); assert.doesNotMatch(t, /Kp Tinggi/, f); assert.doesNotMatch(t, /placeholder="mis\./, f); assert.doesNotMatch(t, /'mis\. /, f); }
  const html = rd('compiler/index.html');
  assert.match(html, /<input id="q" type="search" placeholder="Kode batch"/);
  assert.match(html, /id="f-batch" value="" placeholder="Kode batch"/);
});
