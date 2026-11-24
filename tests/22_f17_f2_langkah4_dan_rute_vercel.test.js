// F17: (A) parameter injeksi rewrite Vercel (?rute=...) tidak boleh merusak endpoint ber-parameter; (B) f2 resmi = Langkah 4:
// empat skenario demo Studio sama persis dengan fungsi Studio (index.html); (C) pembanding sheet/tim hanya catatan; (D) teks UI. [LAPTOP: PostgreSQL 17 biasa]
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createTestDb } from './helpers/db.js';
import { loggedIn, readerLoggedIn, adminLoggedIn } from './helpers/http.js';
import { REPO } from './helpers/fixtures.js';
import { loadPageHost } from './helpers/pageHost.js';
import { runProfile, f2Between } from '../server/lib/udtBridge.js';
import { stripInjected, INJECTED, handle } from '../server/app.js';

const rd = (f) => readFileSync(join(REPO, f), 'utf8');
const DEMO = join(REPO, 'sample-data', 'demo-package');
const opt = { skip: existsSync(DEMO) ? false : 'sample-data/demo-package tidak ada' };
let db, W, R, A;
before(async () => { db = await createTestDb('f17'); W = await loggedIn('Analis F17'); R = await readerLoggedIn('10.17.0.2'); A = await adminLoggedIn('10.17.0.3'); });
after(async () => { if (db) await db.drop(); });

// ------------------------------------------------------------------ A. rute Vercel
test('A1 stripInjected: membuang rute, ...rute, path, nxtP*; parameter klien lain tetap', () => {
  const u = stripInjected(new URL('https://x.test/api/a?rute=api%2Fa&...rute=a&path=b&nxtPrute=c&page=2&f.x=1&rute=lagi'));
  assert.equal(u.search, '?page=2&f.x=1');
  for (const k of ['rute', '...rute', 'path', 'nxtPrute', 'nxtPfoo']) assert.ok(INJECTED.test(k), k);
  for (const k of ['q', 'page', 'sort', 'dir', 'f.name', 'fx.name', 'format', 'dry', 'code', 'product', 'strength', 'form', 'ruteX', 'xrute']) assert.ok(!INJECTED.test(k), k);
});

const INJ = ['rute=api%2Frecord%2Ftables%2Frun', '...rute=api%2Frecord', 'path=x', 'nxtPrute=api%2Fx'];
const withInj = (p, inj) => p + (p.includes('?') ? '&' : '?') + inj;

test('A2 record: baca tabel dan CSV untuk semua tabel dan semua peran tetap 200 dengan parameter injeksi; parameter klien asing tetap 400', async () => {
  const { TABLES } = await import('../server/record.js');
  const names = Object.keys(TABLES);
  let n = 0;
  for (const [c, role] of [[R, 'pembaca'], [W, 'penulis'], [A, 'admin']]) {
    for (const t of names) {
      const base = (await c.get(`/api/record/tables/${t}`)).status;
      for (const inj of INJ) {
        const r = await c.get(withInj(`/api/record/tables/${t}`, inj)); assert.equal(r.status, base, `${role} ${t} ${inj}`); n++;
      }
      const csv = (await c.get(`/api/record/tables/${t}/csv`)).status;
      const csvI = await c.get(withInj(`/api/record/tables/${t}/csv`, INJ[0])); assert.equal(csvI.status, csv, `${role} ${t} csv`);
    }
  }
  assert.ok(n >= 3 * names.length * 4);
  // gabungan: injeksi + filter klien sah tetap bekerja; parameter asing dari klien tetap ditolak
  const ok = await W.get(withInj('/api/record/tables/run?page=1&sort=run_id&dir=desc&q=a', INJ[0])); assert.equal(ok.status, 200, JSON.stringify(ok.json));
  const bad = await W.get(withInj('/api/record/tables/run?zzz=1', INJ[0])); assert.equal(bad.status, 400); assert.match(JSON.stringify(bad.json), /parameter tidak dikenal/);
  const bad2 = await W.get('/api/record/tables/run?zzz=1'); assert.equal(bad2.status, 400);
});

test('A3 semua endpoint ber-parameter: hasil dengan ?rute=... sama dengan tanpa (status dan isi): compiles/match, export, dashboard, produk, jejak run, removed, impor dry', async () => {
  const mk = await W.post('/api/compiles', { product_name: 'Rute', strength: '1 mg', dosage_form: 'Tablet', project_code: 'SKU-RUTE' });
  const cid = mk.json.compile_id;
  const pkg = { compile_id: cid, mediums: [{ code: '6,8', full_name: 'Buffer Phosphate pH 6,8' }], runs: [
    { key: 'r', medium_code: '6,8', brand_name: 'Ref', batch_no: 'B1', role: 'reference', variant: '', test_date: '2026-02-01', timepoints: [5, 10, 15], values: [{ no: 1, values: [30, 50, 70] }, { no: 2, values: [32, 52, 72] }, { no: 3, values: [31, 51, 71] }] },
    { key: 'u', medium_code: '6,8', brand_name: 'Uji', batch_no: 'F1', role: 'uji', variant: '', test_date: '2026-03-01', timepoints: [5, 10, 15], values: [{ no: 1, values: [20, 40, 60] }, { no: 2, values: [22, 42, 62] }, { no: 3, values: [21, 41, 61] }] }], comparisons: [] };
  const c = await W.post('/api/ingest/commit', { push_id: randomUUID(), decisions: {}, package: pkg }); assert.ok([200, 201].includes(c.status), JSON.stringify(c.json));
  const pid = (await W.get('/api/products')).json.products.find((p) => /Rute/.test(p.name)).id;
  const runId = (await db.owner.query('SELECT run_id FROM run WHERE compile_id=$1 ORDER BY run_id LIMIT 1', [cid])).rows[0].run_id;
  const paths = ['/api/products', `/api/products/${pid}`, `/api/products/${pid}/dashboard`, `/api/compiles`, '/api/compiles/match?code=SKU-RUTE', '/api/compiles/match?product=Rute&strength=1%20mg&form=Tablet',
    `/api/compiles/${cid}/data`, `/api/compiles/${cid}/removed`, `/api/compiles/${cid}/export?format=csv`, `/api/compiles/${cid}/export?format=tsv`, `/api/runs/${runId}/audit`, '/api/me', '/api/record/tables/run?page=1'];
  for (const p of paths) {
    const a = await W.get(p);
    for (const inj of INJ) {
      const b = await W.get(withInj(p, inj));
      assert.equal(b.status, a.status, `${p} ${inj}`);
      if (a.json && !/dashboard|\/data/.test(p)) assert.deepEqual(b.json, a.json, `${p} ${inj}`);
      if (a.text !== null && a.json === null) assert.equal(b.text, a.text, `${p} ${inj}`);
    }
  }
  assert.equal((await W.get(withInj(`/api/compiles/${cid}/export?format=csv`, INJ[0]))).status, 200);
  assert.equal((await W.get(`/api/compiles/${cid}/export?format=zzz`)).status, 400, 'format asing tetap ditolak');
  // POST dengan ?dry=1 dan injeksi: sampai ke validasi berkas (400 bukan .xlsx), bukan galat parameter
  const dry = await W.call('POST', withInj('/api/imports/xlsx?dry=1', INJ[0]), undefined, { raw: Buffer.from('bukan xlsx'), headers: { 'x-file-name': 'a.xlsx' } });
  assert.equal(dry.status, 400); assert.match(JSON.stringify(dry.json), /xlsx/i);
  // jalur halaman (bukan /api) juga menerima injeksi
  for (const p of ['/compiler', '/record', '/masuk']) assert.equal((await W.get(withInj(p, INJ[0]))).status, (await W.get(p)).status, p);
});

test('A4 kode sumber: stripInjected dipanggil sekali di handle() sebelum routing; vercel.json tetap rewrite catch-all', () => {
  const s = rd('server/app.js');
  assert.match(s, /const url = new URL\(req\.url\); stripInjected\(url\)/);
  assert.match(rd('vercel.json'), /"source": "\/api\/:rute\(\.\+\)"/);
});

// ------------------------------------------------------------------ B. empat skenario demo = Studio
const SCEN = [
  { dir: '01_Empagliflozin_HPLC_Similar_and_VeryRapid', name: 'Empagliflozin', strength: '25 mg', times: [5, 10, 15, 20, 30, 45, 60], std: 12500, tabs: [['1,2', 'pH_1.2'], ['4,5', 'pH_4.5'], ['6,8', 'pH_6.8'], ['Air', 'pH_Air']], test: (t) => `Empagliflozin_Test_${t}.csv`, ref: (t) => `Jardiance_Ref_${t}.csv`, tb: 'F0048J26A', rb: 'F0006H26A' },
  { dir: '02_Candesartan_HPLC_NotSimilar', name: 'Candesartan', strength: '16 mg', times: [5, 10, 15, 30, 45, 60], std: 15200, tabs: [['6,8', 'pH_6.8']], test: () => 'Candesartan_Test_pH_6.8_NotSimilar.csv', ref: () => 'Blopress_Ref_pH_6.8.csv', tb: 'F0091L26B', rb: 'B8014K26A' },
  { dir: '03_Metformin_UV_Cary60_Rapid', name: 'Metformin', strength: '500 mg', times: [5, 10, 15, 20, 30, 45], std: 0.525, tabs: [['6,8', 'pH_6.8']], test: () => 'Metformin_Test_pH_6.8_Cary60.csv', ref: () => 'Glucophage_Ref_pH_6.8_Cary60.csv', tb: 'F0012A26A', rb: 'G0088F26A' },
  { dir: '04_Atorvastatin_HPLC_HighRSD_Warning', name: 'Atorvastatin', strength: '20 mg', times: [5, 10, 15, 20, 30, 45, 60], std: 18500, tabs: [['4,5', 'pH_4.5']], test: () => 'Atorvastatin_Test_pH_4.5_HighRSD.csv', ref: () => 'Lipitor_Ref_pH_4.5.csv', tb: 'F0077C26A', rb: 'L0042D26A' },
];
// pembaca CSV demo: nilai % = area / rerata standar x 100 (cara yang sama dengan verify_scenarios.py); BUKAN rumus f2.
function pctOf(file, times, stdNom) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/), samples = new Map(), stds = [];
  const hi = lines.findIndex((l) => l.includes('Sample Name')); assert.ok(hi >= 0, file);
  for (const l of lines.slice(hi + 1)) {
    if (!l.trim()) continue;
    const p = l.split(',').map((x) => x.replace(/^"|"$/g, '')), name = p[0], area = Number(p.length > 2 ? p[2] : p[1]);
    if (!Number.isFinite(area)) continue;
    if (/Std|Standar/.test(name)) { stds.push(area); continue; }
    const tok = name.split(/\s+/); let t = null, v = null;
    tok.forEach((x, i) => { if (x.includes("'")) { t = parseInt(x.replace("'", ''), 10); if (i + 1 < tok.length) v = parseInt(tok[i + 1], 10); } });
    if (t !== null && v !== null) samples.set(`${t}|${v}`, area);
  }
  const std = stds.length ? stds.reduce((a, x) => a + x, 0) / stds.length : stdNom, out = [];
  for (let v = 1; v <= 12; v++) { const vals = times.map((t) => (samples.has(`${t}|${v}`) ? samples.get(`${t}|${v}`) / std * 100 : null)); if (vals.some((x) => x !== null)) out.push({ no: v, values: vals }); }
  return out;
}

test('B Studio: empat skenario demo dikirim sebagai data baru; f2, n, status, Total di matriks = fungsi Studio (index.html) PERSIS; ekspor membawa angka yang sama; RSD skenario 4 tercatat', opt, async () => {
  const host = loadPageHost('UDT Studio.html');
  const seen = [];
  for (const s of SCEN) {
    const cid = (await W.post('/api/compiles', { product_name: s.name, strength: s.strength, dosage_form: 'Tablet', project_code: 'F17-' + s.name })).json.compile_id;
    const runs = [], cmp = [], oracle = {};
    for (const [code, tab] of s.tabs) {
      const f = (fn) => join(DEMO, s.dir, 'csv', fn);
      const ref = pctOf(f(s.ref(tab)), s.times, s.std), tst = pctOf(f(s.test(tab)), s.times, s.std);
      assert.ok(ref.length >= 3 && tst.length >= 3, `${s.dir} ${tab}: vessel terbaca`);
      runs.push({ key: 'r' + code, medium_code: code, brand_name: s.ref(tab).split('_')[0], batch_no: s.rb, role: 'reference', variant: '', test_date: '2026-11-04', timepoints: s.times, values: ref });
      runs.push({ key: 'u' + code, medium_code: code, brand_name: s.name, batch_no: s.tb, role: 'uji', variant: '', test_date: '2026-11-04', timepoints: s.times, values: tst });
      const P = (v) => runProfile(host, s.times, Object.fromEntries(v.map((x) => [x.no, x.values])));
      const o = f2Between(host, P(ref), P(tst)); oracle[code] = o;   // fungsi ASLI Studio (halaman), bukan modul server
      cmp.push({ testKey: 'u' + code, refKey: 'r' + code, f2: o.f2, n_points: o.n, total_sq: 0, conclusion_code: o.outcome.code });
    }
    const pkg = { compile_id: cid, mediums: s.tabs.map(([code]) => ({ code, full_name: code === 'Air' ? 'Air' : `Buffer pH ${code}` })), runs, comparisons: cmp };
    const c = await W.post('/api/ingest/commit', { push_id: randomUUID(), decisions: {}, package: pkg }); assert.ok([200, 201].includes(c.status), `${s.dir} ${JSON.stringify(c.json)}`);
    const pid = (await W.get('/api/products')).json.products.find((p) => p.name.startsWith(s.name)).id;
    const d = (await W.get(`/api/products/${pid}/dashboard`)).json;
    for (const [code] of s.tabs) {
      const cell = d.cells[s.rb][s.tb][code], o = oracle[code];
      assert.equal(cell.src, 'langkah4'); assert.equal(cell.sheet, null, 'data Studio tidak punya angka sheet');
      assert.equal(cell.f2, o.f2, `${s.name} ${code} f2 persis`); assert.equal(cell.n, o.n, `${s.name} ${code} n`);
      assert.equal(cell.k, { very_rapid: 'rap', similar: 'sim', not_similar: 'not' }[o.outcome.code], `${s.name} ${code} status`);
      assert.equal(cell.total, o.usedRef.reduce((a, x, i) => a + (x - o.usedTest[i]) ** 2, 0), `${s.name} ${code} Total`);
      assert.equal(cell.beda_sheet, false); assert.equal(cell.beda_tim === true || cell.beda_tim === false, true);
      seen.push([s.name, code, +cell.f2.toFixed(2), cell.n, cell.k]);
    }
    // ekspor: rumus f2 tersimpan di xlsx = angka yang sama
    const ExcelJS = (await import('exceljs')).default, wb = new ExcelJS.Workbook();
    const xr = await handle(new Request(`https://udt.test/api/compiles/${cid}/export?format=xlsx`, { headers: { cookie: W.cookie, 'x-forwarded-for': W.ip } }));
    await wb.xlsx.load(Buffer.from(await xr.arrayBuffer()));
    const cached = []; wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((cl) => { const v = cl.value; if (v && typeof v === 'object' && /LOG10/.test(v.formula || '') && typeof v.result === 'number') cached.push(v.result); })));
    for (const [code] of s.tabs) assert.ok(cached.some((x) => x === oracle[code].f2), `${s.name} ${code}: f2 Studio ada di ekspor`);
    if (s.name === 'Atorvastatin') {
      const rsd = d.findings.find((f) => f.type === 'RSD di atas batas' && /26,4% pada 5 menit/.test(f.text));
      assert.ok(rsd, 'peringatan RSD 26,4% pada 5 menit'); assert.match(rsd.text, /10,6% pada 20 menit/);
    }
  }
  assert.equal(seen.length, 7, 'empat skenario, tujuh sel medium');
  if (process.env.UDT_F17_DUMP) (await import('node:fs')).writeFileSync(process.env.UDT_F17_DUMP, JSON.stringify(seen));   // untuk NOTES_F17 (tabel lembar rujukan vs Studio)
  // Angka pada lembar rujukan (RINGKASAN_SKENARIO_DEMO.md) tidak dipaksakan cocok: yang resmi = Studio. Hanya status yang dikunci.
  const byName = (n, m) => seen.find((x) => x[0] === n && x[1] === m);
  assert.equal(byName('Candesartan', '6,8')[4], 'not'); assert.equal(byName('Metformin', '6,8')[4], 'rap');
  assert.equal(byName('Empagliflozin', '1,2')[4], 'rap'); assert.equal(byName('Atorvastatin', '4,5')[4], 'sim');
});

// ------------------------------------------------------------------ C/D. kode dan teks UI
test('C Pembanding: server memberi f2 resmi, sheet, tim dan penyebab; kontrak payload tanpa kunci lama', () => {
  const s = rd('server/dashboard.js');
  assert.match(s, /src: 'langkah4'/); assert.doesNotMatch(s, /src: 'sheet'/); assert.doesNotMatch(s, /beda_resmi|beda_l4/);
  assert.match(s, /beda_sheet: !!sheet/); assert.match(s, /Beda dengan sheet lama/);
  const b = rd('server/lib/udtBridge.js'); assert.match(b, /host\.evalSimilarityF2/);
  assert.doesNotMatch(rd('server/f2resmi.js').replace(/\/\/.*$/gm, ''), /log10|Math\.(log|pow|sqrt)/, 'tidak ada rumus f2 tertulis ulang');
});

test('D Teks UI: legenda "Angka resmi = Langkah 4"; rincian sel memuat Langkah 4 (resmi) lalu catatan sheet/tim; pratinjau dan konfirmasi simpan memakai langkah4', () => {
  assert.match(rd('compiler/index.html'), /Angka resmi = Langkah 4/);
  const a = rd('compiler/app.js');
  assert.match(a, /Langkah 4 \(resmi\): n = /); assert.match(a, /Catatan: sheet lama mencetak f2/); assert.match(a, /Catatan: hitung ulang tim \(n = 3\)/); assert.match(a, /Penyebab selisih/);
  assert.match(a, /f2 resmi \(Langkah 4\) terhadap/); assert.match(a, /var f = prev\.f2 && prev\.f2\.langkah4;/); assert.match(a, /f2: r\.j\.f2_langkah4, kind: r\.j\.kind_langkah4/);
  assert.doesNotMatch(a, /Tercetak di sheet'/);
  const g = rd('server/gated/compiler/app.js'); assert.match(g, /Langkah 4 \(resmi\): n = /, 'server/gated sudah dibangun ulang');
});
