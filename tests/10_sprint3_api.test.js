// Sprint 3 (F4c): peran sesi, Kirim ke Compiler (idempoten), ubah/hapus/pulihkan + jejak, kunci produk, ekspor, impor .xlsx dari UI. [LAPTOP]
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { createTestDb } from './helpers/db.js';
import { loggedIn, readerLoggedIn, Client, BASE } from './helpers/http.js';
import { REPO } from './helpers/fixtures.js';
import { readWorkbook } from '../server/import/sheetReader.js';
import { handle } from '../server/app.js';
import { readXlsxTabs } from '../server/import/xlsxReader.js';

let db, w, r;
before(async () => { db = await createTestDb('s3'); w = await loggedIn('Penulis Uji'); r = await readerLoggedIn('10.0.0.9'); });
after(async () => { await db.drop(); });

const UUID = () => crypto.randomUUID();
const pkg = (compile_id, over = {}) => ({
  compile_id, mediums: [{ code: '6,8', full_name: 'Buffer fosfat pH 6,8' }],
  runs: [
    { key: 'ref', medium_code: '6,8', brand_name: 'Ezero 20 mg', batch_no: 'B1', role: 'reference', variant: '', test_date: '2026-02-01', timepoints: [5, 10, 15], values: [{ no: 1, values: [30, 50, 70] }, { no: 2, values: [32, 52, 72] }, { no: 3, values: [31, 51, 71] }] },
    { key: 'uji', medium_code: '6,8', brand_name: 'Vastrol 20 mg', batch_no: 'F100', role: 'uji', variant: '', test_date: '2026-03-01', timepoints: [5, 10, 15], values: [{ no: 1, values: [20, 40, 60] }, { no: 2, values: [22, 42, 62] }, { no: 3, values: [21, 41, 61] }] },
  ],
  comparisons: [{ testKey: 'uji', refKey: 'ref', total_sq: 300, n_points: 3, f2: 56.1, conclusion_code: 'similar', conclusion_printed: '50 – 100: Similar', points: [{ seq: 1, sq_diff: 100 }, { seq: 2, sq_diff: 100 }, { seq: 3, sq_diff: 100 }] }],
  ...over,
});
const newCompile = async (extra = {}) => (await w.post('/api/compiles', { product_name: 'Vastrol', strength: '20 mg', dosage_form: 'Tablet', ...extra })).json.compile_id;

test('Peran: pembaca boleh baca (GET) tetapi ditolak 403 untuk semua tulis; kata sandi salah 401', async () => {
  const me = await r.get('/api/me'); assert.equal(me.json.role, 'pembaca');
  assert.equal((await r.get('/api/compiles')).status, 200);
  assert.equal((await r.post('/api/compiles', { product_name: 'X', strength: '1 mg', dosage_form: 'Tablet' })).status, 403);
  assert.equal((await r.put('/api/me/analyst', { name: 'Budi' })).status, 403);
  assert.equal((await r.post('/api/ingest/commit', { push_id: UUID(), package: {} })).status, 403);
  const bad = await new Client('10.0.0.50').post('/api/auth/login', { password: 'salah' }); assert.equal(bad.status, 401);
  assert.equal((await w.get('/api/me')).json.role, 'penulis');
});

test('Kirim ke Compiler: preview, commit, ulang aman (replay), klik ganda serentak, isi berbeda dengan push_id sama ditolak', async () => {
  const cid = await newCompile({ project_code: 'SKU-VAS-20' });
  const pv = await w.post('/api/ingest/preview', pkg(cid)); assert.equal(pv.status, 200); assert.equal(pv.json.counts.baru, 2);
  const pid = UUID(), body = { push_id: pid, decisions: {}, package: pkg(cid) };
  const [a, b] = await Promise.all([w.post('/api/ingest/commit', body), w.post('/api/ingest/commit', body)]);   // klik ganda serentak
  assert.deepEqual([a.status, b.status].sort(), [200, 201]);
  assert.equal([a, b].filter((x) => x.json.replay).length, 1);
  const again = await w.post('/api/ingest/commit', body); assert.equal(again.status, 200); assert.equal(again.json.replay, true);
  const n = await db.owner.query('SELECT count(*)::int AS n FROM run WHERE compile_id=$1', [cid]); assert.equal(n.rows[0].n, 2, 'tidak ada gandaan');
  const other = await w.post('/api/ingest/commit', { push_id: pid, decisions: {}, package: pkg(cid, { runs: pkg(cid).runs.slice(0, 1), comparisons: [] }) });
  assert.equal(other.status, 409);
  const dup = await w.post('/api/ingest/commit', { push_id: UUID(), decisions: {}, package: pkg(cid) }); assert.equal(dup.status, 201); assert.equal(dup.json.counts.sama_persis, 2);
  assert.equal((await db.owner.query('SELECT count(*)::int AS n FROM run WHERE compile_id=$1', [cid])).rows[0].n, 2);
  const changed = pkg(cid); changed.runs[1].values[0].values = [25, 45, 65];
  const nope = await w.post('/api/ingest/commit', { push_id: UUID(), decisions: {}, package: changed }); assert.equal(nope.status, 409); assert.deepEqual(nope.json.conflicts, ['uji']);
  const timpa = await w.post('/api/ingest/commit', { push_id: UUID(), decisions: { uji: 'timpa' }, package: changed }); assert.equal(timpa.status, 201); assert.equal(timpa.json.counts.ditimpa, 1);
  const data = (await w.get(`/api/compiles/${cid}/data`)).json; assert.equal(data.runs.filter((x) => x.batch_no === 'F100').length, 1, 'yang lama tersembunyi');
});

test('Kunci produk: cocok per kode project, per nama ternormalisasi, per alias; tidak ada gabung otomatis', async () => {
  const m1 = (await r.get('/api/compiles/match?code=sku-vas-20')).json.candidates; assert.equal(m1[0].matched_by, 'kode');
  const m2 = (await r.get('/api/compiles/match?product=VASTROL&strength=20mg&form=tablet')).json.candidates; assert.equal(m2[0].matched_by, 'nama');
  assert.equal((await r.get('/api/compiles/match?product=Lain&strength=5 mg&form=Tablet')).json.candidates.length, 0);
  const cid = m1[0].compile_id;
  assert.equal((await w.post(`/api/compiles/${cid}/aliases`, { alias: 'Development of Vastrol 20mg Tab' })).status, 201);
  const m3 = (await r.get('/api/compiles/match?product=Vastrol&strength=20mg&form=Tab')).json.candidates; assert.equal(m3[0].matched_by, 'alias');
  assert.equal((await r.post(`/api/compiles/${cid}/aliases`, { alias: 'x' })).status, 403);
  assert.equal((await w.post('/api/compiles', { product_name: 'Vastrol', strength: '20 mg', dosage_form: 'Tablet' })).status, 409, 'produk sama tidak dobel');
});

test('Ubah status/catatan/varian + hapus dengan konfirmasi + pulihkan + jejak dengan nilai lama', async () => {
  const cid = (await r.get('/api/compiles/match?code=SKU-VAS-20')).json.candidates[0].compile_id;
  const runId = (await w.get(`/api/compiles/${cid}/data`)).json.runs.find((x) => x.batch_no === 'F100').run_id;
  assert.equal((await w.patch(`/api/runs/${runId}`, { is_valid: false })).status, 400, 'Tidak valid wajib beralasan');
  assert.equal((await r.patch(`/api/runs/${runId}`, { note: 'x' })).status, 403);
  assert.equal((await w.patch(`/api/runs/${runId}`, { harga: 1 })).status, 400, 'kolom lain tidak boleh diubah');
  const ok = await w.patch(`/api/runs/${runId}`, { is_valid: false, invalid_reason: 'Salah Wavelength', note: 'cek ulang', variant: 'Kp Tinggi' });
  assert.equal(ok.status, 200); assert.deepEqual(ok.json.changed.sort(), ['invalid_reason', 'is_valid', 'note', 'variant']);
  const back = await w.patch(`/api/runs/${runId}`, { is_valid: true }); assert.equal(back.status, 200);
  const tr = (await r.get(`/api/runs/${runId}/audit`)).json.events;
  const upd = tr.filter((e) => e.action === 'run_update'); assert.equal(upd.length, 2);
  assert.deepEqual(upd[0].changes.find((c) => c.field === 'is_valid'), { field: 'is_valid', old: 'true', new: 'false' });
  assert.equal(upd[1].changes.find((c) => c.field === 'invalid_reason').old, 'Salah Wavelength', 'nilai lama tercatat saat kembali Valid');
  assert.equal(upd[0].analyst, 'Penulis Uji');
  assert.equal((await w.post(`/api/runs/${runId}/delete`, { reason: 'salah input' })).status, 400, 'tanpa konfirmasi ditolak');
  assert.equal((await w.post(`/api/runs/${runId}/delete`, { confirm: true })).status, 400, 'tanpa alasan ditolak');
  assert.equal((await w.post(`/api/runs/${runId}/delete`, { confirm: true, reason: 'salah input' })).status, 200);
  assert.equal((await w.post(`/api/runs/${runId}/delete`, { confirm: true, reason: 'lagi' })).status, 409, 'hapus dua kali aman');
  assert.ok(!(await w.get(`/api/compiles/${cid}/data`)).json.runs.some((x) => x.run_id === runId));
  assert.equal((await w.patch(`/api/runs/${runId}`, { note: 'y' })).status, 409, 'run terhapus tidak bisa diubah');
  assert.equal((await r.get(`/api/compiles/${cid}/removed`)).json.runs.find((x) => x.run_id === runId).restorable, true);
  assert.equal((await w.post(`/api/runs/${runId}/restore`, { reason: 'ternyata benar' })).status, 200);
  assert.equal((await w.post(`/api/runs/${runId}/restore`, { reason: 'lagi' })).status, 409);
  assert.ok((await w.get(`/api/compiles/${cid}/data`)).json.runs.some((x) => x.run_id === runId));
  const acts = (await r.get(`/api/runs/${runId}/audit`)).json.events.map((e) => e.action); assert.deepEqual(acts.slice(-2), ['run_delete', 'run_restore']);
  await assert.rejects(db.app.query('DELETE FROM audit_event'), /permission denied/); await assert.rejects(db.app.query('DELETE FROM run'), /permission denied/);
});

const exp = (cid, fmt, who = r) => handle(new Request(`${BASE}/api/compiles/${cid}/export?format=${fmt}`, { headers: { cookie: who.cookie } }));
test('Ekspor satu arah: Excel (rumus hidup + nilai cache, tab per medium), CSV/TSV aman dari injeksi rumus; pembaca boleh mengekspor', async () => {
  const cid = (await r.get('/api/compiles/match?code=SKU-VAS-20')).json.candidates[0].compile_id;
  const x = await exp(cid, 'xlsx'); assert.equal(x.status, 200); assert.match(x.headers.get('content-disposition'), /\.xlsx"/);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(await x.arrayBuffer()));
  const ws = wb.getWorksheet('pH 6,8'); assert.ok(ws);
  const blocks = []; ws.eachRow((row, n) => { if (row.getCell(3).value === 'AVG') blocks.push(n); });
  assert.deepEqual(blocks, [14, 37], 'blok 23 baris mulai baris 14: pembanding dulu');
  assert.equal(ws.getCell('L14').value, 'Reference Product');
  const avg = ws.getCell('E33').value; assert.match(avg.formula, /AVERAGE\(E21:E32\)/); assert.ok(Math.abs(avg.result - 31) < 1e-9, 'nilai cache rata-rata');
  const f2 = ws.getCell('N41').value; assert.equal(f2.formula, '50*LOG10(N40*100)'); assert.equal(f2.result, 56.1, 'f2 cache = f2 tersimpan, bukan dihitung ulang');
  assert.match(ws.getCell('N38').value.formula, /^SUM\(N37:P37\)$/); assert.equal(ws.getCell('N38').value.result, 300);
  assert.match(ws.getCell('N37').value.formula, /^\(\$E\$14-E37\)\^2$/); assert.equal(ws.getCell('N39').value, 3);
  const csv = await (await exp(cid, 'csv')).text();
  assert.ok(csv.startsWith('\ufeffcompile,medium,'), 'BOM agar Excel membaca UTF-8'); assert.ok(csv.split('\r\n').length > 10);
  assert.ok((await (await exp(cid, 'tsv')).text()).includes('\t'));
  assert.equal((await exp(cid, 'pdf')).status, 400);
  assert.equal((await handle(new Request(`${BASE}/api/compiles/${cid}/export?format=csv`))).status, 401);
  const rid = (await w.get(`/api/compiles/${cid}/data`)).json.runs[0].run_id;
  await w.patch(`/api/runs/${rid}`, { note: '=HYPERLINK("http://x","klik")' });
  const csv2 = await (await exp(cid, 'csv')).text();
  assert.ok(csv2.includes("'=HYPERLINK") && !/(^|,)=HYPERLINK/m.test(csv2));
});

const XLSX = (f) => join(REPO, '..', 'data', 'sheets', f);
const SHEETS = [['Gionix', 'Development of Gionix 16 mg Tab.xlsx', 4, 48, 40], ['Vastrol', 'Development of Vastrol 20 mg Tablet.xlsx', 3, 51, 60], ['Empagliflozin 25', 'Development of Empagliflozin 25 mg Tablet.xlsx', 4, 32, 24]];
for (const [nm, file, nMed, nRuns, nCmp] of SHEETS) {
  test(`Impor .xlsx dari UI (${nm}): laporan pencocokan (dry) lalu simpan; tab non-UDT diabaikan`, { skip: existsSync(XLSX(file)) ? false : 'xlsx tidak ada' }, async () => {
    const buf = readFileSync(XLSX(file));
    const post = (q) => handle(new Request(`${BASE}/api/imports/xlsx${q}`, { method: 'POST', headers: { cookie: w.cookie, origin: BASE, 'x-file-name': encodeURIComponent(file), 'content-type': 'application/octet-stream' }, body: buf }));
    const dry = await post('?dry=1'); const d = await dry.json(); assert.equal(dry.status, 200, JSON.stringify(d));
    assert.equal(d.dry, true); assert.equal(d.mediums.length, nMed); assert.equal(d.runs, nRuns); assert.equal(d.comparisons, nCmp);
    if (nm === 'Empagliflozin 25') assert.ok(d.tab_diabaikan.length >= 1, 'Kimia/Sink Condition/Sampel F3 diabaikan: ' + d.tab_diabaikan);
    if (nm === 'Vastrol') assert.ok(!d.mediums.some((m) => m.code === 'Release'), 'Vastrol tanpa Release');
    const title = file.replace('.xlsx', '');
    assert.equal((await db.owner.query('SELECT count(*)::int AS n FROM compile WHERE title=$1', [title])).rows[0].n, 0, 'dry tidak menyimpan');
    const real = await post(''); const j = await real.json(); assert.equal(real.status, 201, JSON.stringify(j));
    const runs = (await db.owner.query('SELECT count(*)::int AS n FROM run r JOIN compile c ON c.compile_id=r.compile_id WHERE c.title=$1', [title])).rows[0].n;
    assert.equal(runs, nRuns, 'jumlah run tersimpan sama dengan hasil baca');
  });
}
test('Impor .xlsx: bukan xlsx ditolak; pembaca tidak boleh; tanpa sesi 401', async () => {
  const bad = await handle(new Request(`${BASE}/api/imports/xlsx`, { method: 'POST', headers: { cookie: w.cookie, origin: BASE, 'x-file-name': 'a.xlsx' }, body: Buffer.from('bukan zip') })); assert.equal(bad.status, 400);
  const rd = await handle(new Request(`${BASE}/api/imports/xlsx`, { method: 'POST', headers: { cookie: r.cookie, origin: BASE, 'x-file-name': 'a.xlsx' }, body: Buffer.from('PK..') })); assert.equal(rd.status, 403);
  const no = await handle(new Request(`${BASE}/api/imports/xlsx`, { method: 'POST', headers: { origin: BASE }, body: Buffer.from('PK..') })); assert.equal(no.status, 401);
});

test('Ekspor lalu baca kembali dengan pembaca sheet menghasilkan run, perbandingan, dan f2 yang sama', async () => {
  const cid = (await r.get('/api/compiles/match?code=SKU-VAS-20')).json.candidates[0].compile_id;
  const buf = Buffer.from(await (await exp(cid, 'xlsx')).arrayBuffer());
  const back = readWorkbook({ fileName: 'Development of Vastrol 20 mg Tablet.xlsx', tabs: await readXlsxTabs(buf) });
  const live = (await w.get(`/api/compiles/${cid}/data`)).json;
  assert.equal(back.runs.length, live.runs.length); assert.equal(back.comparisons.length, live.comparisons.length);
  assert.ok(Math.abs(back.comparisons[0].f2 - live.comparisons[0].f2) < 1e-9); assert.equal(back.comparisons[0].n_points, 3); assert.equal(back.comparisons[0].total_sq, 300);
});
