// F6: kontrak API Compiler (docs/KONTRAK_API_COMPILER.md): daftar produk, info, dashboard, ekspor, pratinjau dan simpan run, peran pembaca/penulis. [LAPTOP]
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestDb } from './helpers/db.js';
import { Client, loggedIn, readerLoggedIn } from './helpers/http.js';
import { loadWorkbook, hasFixtures } from './helpers/fixtures.js';
import { readWorkbook } from '../server/import/sheetReader.js';

const opt = { skip: hasFixtures ? false : 'fixture data/sheets/csv tidak ada' };
let db, W, R, PID;
before(async () => {
  if (!hasFixtures) return;
  db = await createTestDb('f6api'); W = await loggedIn('Analis F6'); R = await readerLoggedIn();
  const imp = await W.post('/api/imports', readWorkbook(loadWorkbook('Vastrol20', 'Development of Vastrol 20 mg Tablet.xlsx', ['pH_1_2', 'pH_4_5', 'pH_6_8']))); assert.equal(imp.status, 201);
  PID = (await W.get('/api/products')).json.products[0].id;
});
after(async () => { if (db) await db.drop(); });
const cnt = async (sql, p = []) => Number((await db.app.query(sql, p)).rows[0].n);

const body = (o = {}) => ({ medium: '4,5', batch: 'F0999Z26A', variant: '', test_date: '2026-11-01', comparator: 'B41968', timepoints: [5, 10, 15, 20, 30, 45, 60],
  vessels: [{ no: 1, values: [78.7, 84.4, 87.3, 88.8, 90, 92, 95] }, { no: 2, values: [60, 70, 75, 80, 82, 85, 92] }, { no: 3, values: [55, 70, 76, 82, 84, 86, 93] }], ...o });

test('Rute baru menuntut sesi (401) dan pembaca hanya membaca (403 untuk semua tulis)', opt, async () => {
  const anon = new Client('10.7.7.1');
  for (const [m, p] of [['GET', '/api/products'], ['GET', `/api/products/${PID}`], ['GET', `/api/products/${PID}/dashboard`], ['GET', `/api/products/${PID}/export`], ['POST', `/api/products/${PID}/runs/preview`], ['POST', `/api/products/${PID}/runs`], ['POST', '/api/products']]) assert.equal((await anon.call(m, p, m === 'GET' ? undefined : {})).status, 401, `${m} ${p}`);
  for (const p of ['/api/products', `/api/products/${PID}`, `/api/products/${PID}/dashboard`]) assert.equal((await R.get(p)).status, 200, p);
  assert.equal((await R.get(`/api/products/${PID}/export?format=csv`)).status, 200);
  for (const [p, b] of [[`/api/products/${PID}/runs/preview`, body()], [`/api/products/${PID}/runs`, { ...body(), push_id: randomUUID() }], ['/api/products', { product_name: 'X', strength: '1 mg', dosage_form: 'Tablet' }]]) assert.equal((await R.post(p, b)).status, 403, p);
});

test('GET /api/products dan /api/products/:id: daftar, nama tampil, metadata alat/medium untuk f-vol, f-app, f-met, pembanding, merek uji', opt, async () => {
  const l = (await W.get('/api/products')).json.products[0];
  assert.equal(l.name, 'Vastrol 20 mg Tablet'); assert.equal(l.run_count, 51); assert.ok(l.last_test_date);
  const i = (await W.get(`/api/products/${PID}`)).json;
  const m45 = i.mediums.find((m) => m.code === '4,5');
  assert.equal(m45.volume_text, '900 ml'); assert.equal(m45.apparatus, '2 (Paddle)'); assert.equal(m45.rpm_text, '50 rpm'); assert.equal(m45.method, 'HPLC'); assert.ok(m45.in_product);
  assert.ok(!i.mediums.find((m) => m.code === 'Air').in_product);
  assert.deepEqual(i.comparators.map((c) => c.lot).sort(), ['6005160', 'B41968']);
  assert.match(i.test_brand, /^Vastrol/);
  assert.equal((await W.get('/api/products/99999')).status, 404); assert.equal((await W.get('/api/products/99999/dashboard')).status, 404);
});

test('Dashboard: bentuk data (run, vessel/profil, f2_sheet + f2_langkah4, temuan, media) dan tanpa HTML mentah', opt, async () => {
  const d = (await R.get(`/api/products/${PID}/dashboard`)).json;
  for (const k of ['product', 'times', 'media', 'comps', 'comp_order', 'runs', 'cells', 'findings', 'warn']) assert.ok(k in d, k);
  const cell = d.cells.B41968.F0066A26A['4,5'];
  for (const k of ['f2s', 'ks', 'f2l', 'kl', 'nl', 'beda']) assert.ok(k in cell, k);
  const run = d.runs.find((r) => r.key === 'F0066A26A'); assert.equal(run.prof['4,5'].vessels, 3); assert.equal(run.prof['4,5'].avg.length, 8);
  assert.ok(d.media.find((m) => m.id === 'Air' && m.has === false));
  assert.equal(d.media.find((m) => m.id === '4,5').apparatus, '2 (Paddle)');
});

test('Pratinjau: statistik, f2 sheet (n=3) dan Langkah 4 dari server; tanpa nama analis tetap boleh (tidak menulis)', opt, async () => {
  const noName = await loggedIn(null, '10.7.7.2');
  const r = await noName.post(`/api/products/${PID}/runs/preview`, body());
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const j = r.json; assert.deepEqual(j.times, [5, 10, 15, 20, 30, 45, 60]); assert.equal(j.n_vessels, 3);
  assert.ok(Math.abs(j.stats.avg[0] - (78.7 + 60 + 55) / 3) < 1e-9);
  assert.equal(j.f2.sheet.n, 3); assert.deepEqual(j.f2.sheet.minutes, [5, 10, 15]); assert.ok(Number.isFinite(j.f2.sheet.sumsq) && j.f2.sheet.a > 0 && j.f2.sheet.a < 1);
  assert.ok('f2' in j.f2.langkah4 && j.f2.langkah4.n >= 1); assert.equal(j.f2.ref.lot, 'B41968'); assert.equal(j.duplicate.status, 'baru');
  assert.ok(j.checks.some((c) => /bukan duplikat/.test(c.text)));
  assert.equal(await cnt('SELECT count(*) n FROM run'), 51, 'pratinjau tidak menulis');
  // F10: simpan oleh pembaca ditolak (nama analis = nama akun, bukan isian)
  assert.equal((await R.post(`/api/products/${PID}/runs`, { ...body(), push_id: randomUUID() })).status, 403);
});

test('Validasi isian: medium asing, batch kosong, batch = pembanding, tanpa vessel, nilai bukan angka, menit ganda, >12 vessel -> 400', opt, async () => {
  const bad = [body({ medium: 'XYZ' }), body({ batch: '' }), body({ batch: 'B41968' }), body({ vessels: [] }), body({ vessels: [{ no: 1, values: ['a', 1, 1, 1, 1, 1, 1] }] }), body({ timepoints: [5, 5, 10, 15, 20, 30, 45] }), body({ test_date: '01/11/2026' }),
    body({ vessels: Array.from({ length: 13 }, (_, i) => ({ no: i + 1, values: [1, 2, 3, 4, 5, 6, 7] })) }), body({ comparator: 'F0048J26A' })];
  for (const b of bad) { const r = await W.post(`/api/products/${PID}/runs/preview`, b); assert.equal(r.status, 400, JSON.stringify(b).slice(0, 80)); assert.ok(r.json.error); }
});

test('Simpan: run baru + perbandingan Langkah 4 tersimpan, jejak audit memuat analis, tampil di dashboard; ulang dengan push_id sama aman', opt, async () => {
  const push = randomUUID(), runs0 = await cnt('SELECT count(*) n FROM run');
  const r = await W.post(`/api/products/${PID}/runs`, { ...body(), push_id: push });
  assert.equal(r.status, 201, JSON.stringify(r.json)); assert.equal(r.json.status, 'baru'); assert.equal(r.json.replay, false);
  assert.equal(r.json.comparator.lot, 'B41968'); assert.ok(Number.isFinite(r.json.f2_sheet) && Number.isFinite(r.json.f2_langkah4));
  assert.equal(await cnt('SELECT count(*) n FROM run'), runs0 + 1);
  const cmp = (await db.app.query(`SELECT c.f2::float8 f2, c.f2_source, c.conclusion_code, c.n_points FROM comparison c WHERE c.test_run_id=$1`, [r.json.run_id])).rows;
  assert.equal(cmp.length, 1); assert.equal(cmp[0].f2_source, 'studio'); assert.ok(Math.abs(cmp[0].f2 - r.json.f2_langkah4) < 1e-6); assert.ok(['similar', 'not_similar', 'very_rapid'].includes(cmp[0].conclusion_code));
  assert.ok(await cnt(`SELECT count(*) n FROM comparison_point WHERE comparison_id IN (SELECT comparison_id FROM comparison WHERE test_run_id=$1)`, [r.json.run_id]) >= 1);
  assert.equal(await cnt(`SELECT count(*) n FROM audit_event e JOIN analyst a ON a.analyst_id=e.analyst_id WHERE e.action='ingest_commit' AND a.name='Analis F6' AND e.entity_id=$1`, [PID]) >= 1, true);
  const again = await W.post(`/api/products/${PID}/runs`, { ...body(), push_id: push });
  assert.equal(again.status, 200); assert.equal(again.json.replay, true); assert.equal(again.json.run_id, r.json.run_id);
  assert.equal(await cnt('SELECT count(*) n FROM run'), runs0 + 1, 'ulang aman: tidak menggandakan');
  assert.equal((await W.post(`/api/products/${PID}/runs`, { ...body({ batch: 'F0999Z26B' }), push_id: push })).status, 409, 'push_id sama untuk isi berbeda ditolak');
  const d = (await R.get(`/api/products/${PID}/dashboard`)).json;
  const row = d.runs.find((x) => x.key === 'F0999Z26A'); assert.ok(row); assert.equal(row.prof['4,5'].vessels, 3); assert.ok(d.cells.B41968.F0999Z26A['4,5']);
  const pv = await W.post(`/api/products/${PID}/runs/preview`, body()); assert.equal(pv.json.duplicate.status, 'sama_persis');
});

test('Run bentrok (identitas sama, nilai beda): tanpa keputusan 409; timpa, ulang, batal masing-masing benar', opt, async () => {
  const changed = body({ vessels: [{ no: 1, values: [70, 80, 85, 88, 90, 92, 95] }, { no: 2, values: [65, 75, 80, 85, 88, 90, 94] }] });
  assert.equal((await W.post(`/api/products/${PID}/runs/preview`, changed)).json.duplicate.status, 'bentrok');
  const r0 = await W.post(`/api/products/${PID}/runs`, { ...changed, push_id: randomUUID() });
  assert.equal(r0.status, 409); assert.deepEqual(r0.json.conflicts, ['f6']);
  const nb = await W.post(`/api/products/${PID}/runs`, { ...changed, push_id: randomUUID(), decision: 'batal' }); assert.equal(nb.status, 201); assert.equal(nb.json.status, 'dibatalkan'); assert.equal(nb.json.run_id, null);
  const ul = await W.post(`/api/products/${PID}/runs`, { ...changed, push_id: randomUUID(), decision: 'ulang' }); assert.equal(ul.json.status, 'run_ulang');
  const c2 = body({ vessels: [{ no: 1, values: [71, 81, 86, 88, 90, 92, 95] }, { no: 2, values: [66, 76, 81, 85, 88, 90, 94] }] });
  const tm = await W.post(`/api/products/${PID}/runs`, { ...c2, push_id: randomUUID(), decision: 'timpa' }); assert.equal(tm.json.status, 'ditimpa');
  assert.ok(await cnt(`SELECT count(*) n FROM run_removal WHERE kind='ditimpa'`) >= 1);
});

test('Medium baru untuk produk (Air) dan produk baru lewat /api/products + kunci produk; dashboard produk kosong tidak galat', opt, async () => {
  const air = await W.post(`/api/products/${PID}/runs`, { ...body({ medium: 'Air', batch: 'F0998Z26A' }), push_id: randomUUID() });
  assert.equal(air.status, 201, JSON.stringify(air.json)); assert.equal(air.json.status, 'baru');
  const d = (await R.get(`/api/products/${PID}/dashboard`)).json; assert.ok(d.media.find((m) => m.id === 'Air').has);
  const m1 = (await W.get('/api/products/match?product=Vastrol&strength=20%20mg&form=Tablet&code=')).json; assert.ok(m1.candidates.length >= 1);
  const np = await W.post('/api/products', { product_name: 'Produk F6', strength: '5 mg', dosage_form: 'Tablet', api: 'Zat', project_code: 'F6-001' }); assert.equal(np.status, 201);
  const e = (await R.get(`/api/products/${np.json.compile_id}/dashboard`)); assert.equal(e.status, 200); assert.deepEqual(e.json.runs, []); assert.deepEqual(e.json.comp_order, []);
  const info = (await W.get(`/api/products/${np.json.compile_id}`)).json; assert.deepEqual(info.comparators, []);
  const first = await W.post(`/api/products/${np.json.compile_id}/runs`, { ...body({ comparator: null, batch: 'N1' }), push_id: randomUUID() });
  assert.equal(first.status, 201, JSON.stringify(first.json)); assert.equal(first.json.f2_sheet, null);
  assert.equal((await W.post('/api/products', { product_name: 'Produk F6', strength: '5 mg', dosage_form: 'Tablet' })).status, 409);
});

test('Ekspor lewat /api/products/:id/export: xlsx, csv, tsv; format asing 400', opt, async () => {
  for (const [f, ct] of [['xlsx', /spreadsheetml/], ['csv', /text\/csv/], ['tsv', /tab-separated/]]) { const r = await R.get(`/api/products/${PID}/export?format=${f}`); assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), ct); }
  assert.equal((await R.get(`/api/products/${PID}/export?format=pdf`)).status, 400);
});

test('Jalur lama tetap: /api/compiles dan /api/ingest/* masih ada (Studio Kirim ke Compiler)', opt, async () => {
  assert.equal((await W.get('/api/compiles')).status, 200); assert.equal((await W.get(`/api/compiles/${PID}/data`)).status, 200);
  assert.equal((await W.post('/api/ingest/preview', { compile_id: PID, mediums: [], runs: [] })).status, 400);
});
