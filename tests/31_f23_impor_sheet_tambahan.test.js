// F23 butir 8 (A-4, 10 sheet tambahan): galat impor jelas, isian manual X-Product-Name/X-Strength/X-Dosage-Form, penguraian nama berkas
// ("20-10 mg" = "20/10 mg"), tata letak bergeser (Microlax), peringatan salinan (Vastrol COPY). [LAPTOP: PostgreSQL 17 biasa]
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { createTestDb } from './helpers/db.js';
import { loggedIn } from './helpers/http.js';
import { REPO } from './helpers/fixtures.js';
import { handle } from '../server/app.js';
import { parseCompileFromFileName, readWorkbook } from '../server/import/sheetReader.js';
import { readXlsxTabs } from '../server/import/xlsxReader.js';

let db, W;
before(async () => { db = await createTestDb('f23i'); W = await loggedIn('Analis Impor', '10.23.2.1'); });
after(async () => { if (db) await db.drop(); });

const MINI = readFileSync(join(REPO, 'tests', 'fixtures', 'Development of Minia 10 mg Tablet.xlsx'));
const post = (file, buf, { dry = true, headers = {} } = {}) => handle(new Request(`https://udt.test/api/imports/xlsx${dry ? '?dry=1' : ''}`, { method: 'POST', headers: { cookie: W.cookie, origin: 'https://udt.test', 'x-file-name': encodeURIComponent(file), 'x-analyst-name': encodeURIComponent('Analis Impor'), 'content-type': 'application/octet-stream', ...headers }, body: buf })).then(async (r) => ({ status: r.status, json: await r.json() }));

test('N1 nama berkas: kekuatan kombinasi dan nama dengan strip/kata tambahan', () => {
  const t = (f) => parseCompileFromFileName(`Development of ${f}.xlsx`);
  assert.deepEqual(t('Rosu-Eze 20-10 mg Tablet'), { product_name: 'Rosu-Eze', strength: '20/10 mg', dosage_form: 'Tablet', title: 'Development of Rosu-Eze 20/10 mg Tablet' });
  assert.deepEqual(t('Narfoz 4 mg FC Tablet UDT'), { product_name: 'Narfoz', strength: '4 mg', dosage_form: 'FC Tablet UDT', title: 'Development of Narfoz 4 mg FC Tablet UDT' });
  assert.equal(t('Amlo 5 mg-10 mg Tablet').strength, '5 mg/10 mg');
  assert.equal(t('Amlo 5 mg 10 mg Tablet').strength, '5 mg');   // tanpa pemisah: tidak digabung (tidak ditebak)
  assert.equal(t('Tes 0,5 mg Tablet').strength, '0,5 mg');
  assert.equal(t('Vastrol 20 mg Tablet COPY').dosage_form, 'Tablet COPY');
  assert.equal(t('Candesartan-Amlodipine'), null);   // tanpa kekuatan: harus diisi analis
  assert.equal(t('Aprion 150 mg Kapsul').strength, '150 mg');
});

test('N2 berkas ditolak: pesan jelas (bukan "Masukan tidak valid" kosong) dengan nama berkas, penyebab, dan jalan keluar', async () => {
  const r = await post('Development of Minia.xlsx', MINI);
  assert.equal(r.status, 400); assert.match(r.json.error, /Development of Minia\.xlsx.*ditolak/);
  assert.equal(r.json.details.length, 1); assert.match(r.json.details[0], /tidak berpola/); assert.match(r.json.details[0], /X-Product-Name/); assert.match(r.json.details[0], /X-Strength/); assert.match(r.json.details[0], /X-Dosage-Form/);
});

test('N3 isian manual lewat header: dry-run dan simpan memakai nama yang diketik analis; bagian yang terbaca dari nama berkas tidak perlu diisi lagi', async () => {
  const h = { 'x-product-name': encodeURIComponent('Minia'), 'x-strength': encodeURIComponent('10 mg'), 'x-dosage-form': encodeURIComponent('Tablet') };
  const d = await post('Development of Minia.xlsx', MINI, { headers: h });
  assert.equal(d.status, 200, JSON.stringify(d.json)); assert.deepEqual([d.json.compile.product_name, d.json.compile.strength, d.json.compile.dosage_form, d.json.compile.title], ['Minia', '10 mg', 'Tablet', 'Development of Minia 10 mg Tablet']);
  const part = await post('Development of Minia.xlsx', MINI, { headers: { 'x-product-name': encodeURIComponent('Minia') } });
  assert.equal(part.status, 400); assert.match(part.json.details[0], /kekuatan \(X-Strength\), bentuk sediaan \(X-Dosage-Form\)/); assert.doesNotMatch(part.json.details[0], /nama produk \(X-Product-Name\)/);
  const bad = await post('Development of Minia.xlsx', MINI, { headers: { ...h, 'x-strength': encodeURIComponent('10\u3164mg') } });
  assert.equal(bad.status, 400); assert.match(JSON.stringify(bad.json), /x-strength/);
  const save = await post('Development of Minia.xlsx', MINI, { dry: false, headers: h });
  assert.equal(save.status, 201, JSON.stringify(save.json));
  const row = (await db.owner.query("SELECT product_name, strength, dosage_form FROM compile WHERE product_name='Minia'")).rows[0]; assert.deepEqual(row, { product_name: 'Minia', strength: '10 mg', dosage_form: 'Tablet' });
});

test('N4 nama berkas Rosu-Eze (strip menggantikan garis miring): kekuatan 20/10 mg lewat API', async () => {
  const d = await post('Development of Rosu-Eze 20-10 mg Tablet.xlsx', MINI);
  assert.equal(d.status, 200); assert.equal(d.json.compile.product_name, 'Rosu-Eze'); assert.equal(d.json.compile.strength, '20/10 mg'); assert.equal(d.json.compile.dosage_form, 'Tablet');
});

test('N5 tab per zat aktif (Candesartan-Amlodipine): ditolak dengan DUA penyebab yang jelas; tidak ada data ditebak', async () => {
  const wb = new ExcelJS.Workbook();
  for (const n of ['Candesartan pH 1,2', 'Amlodipine pH 1,2']) { const ws = wb.addWorksheet(n); ws.getCell('C14').value = 'AVG'; }
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const r = await post('Development of Candesartan-Amlodipine.xlsx', buf);
  assert.equal(r.status, 400); assert.equal(r.json.details.length, 2);
  assert.match(r.json.details[0], /tidak berpola/);
  assert.match(r.json.details[1], /Candesartan pH 1,2/); assert.match(r.json.details[1], /Amlodipine pH 1,2/); assert.match(r.json.details[1], /belum didukung dan perlu keputusan tim/);
  const hm = await post('Development of Candesartan-Amlodipine.xlsx', buf, { headers: { 'x-product-name': 'Candesartan-Amlodipine', 'x-strength': '8 mg', 'x-dosage-form': 'Tablet' } });
  assert.equal(hm.status, 400); assert.equal(hm.json.details.length, 1); assert.match(hm.json.details[0], /Tidak ada tab dengan data run/);
});

const DIR = join(REPO, '..', 'data', 'sheets_tambahan');
const real = { skip: existsSync(DIR) ? false : 'data/sheets_tambahan tidak ada' };
const readReal = async (f) => readWorkbook({ fileName: f, tabs: await readXlsxTabs(readFileSync(join(DIR, f))) });

test('N6 Microlax: kolom tambahan menggeser peran dan area f2 satu kolom; Reference terbaca (bukan "uji"), perbandingan terbaca', real, async () => {
  const w = await readReal('Development of Microlax 5 mg tab.xlsx');
  assert.equal(w.runs.length, 11); assert.equal(w.runs.filter((r) => r.role === 'reference').length, 2); assert.equal(w.comparisons.length, 7);
  const holds = w.notes.filter((n) => n.kind === 'hold');
  assert.equal(holds.filter((n) => /W-19/.test(n.message)).length, 10, 'W-19 (statistik atas kosong) tetap ditahan: keputusan tim');
  assert.equal(holds.filter((n) => /R-11/.test(n.message)).length, 1);
  assert.ok(w.comparisons.every((c) => c.f2 !== null && c.n_points === 6));
});

test('N7 Aprion 75 mg: 16 perbandingan ditahan karena area f2 berisi NILAI tanpa rumus (rujukan pembanding tak terbaca); run tetap diimpor; tidak ditebak', real, async () => {
  const w = await readReal('Development of Aprion 75 mg Kapsul.xlsx');
  assert.equal(w.runs.length, 16); assert.equal(w.comparisons.length, 0);
  const r11 = w.notes.filter((n) => n.kind === 'hold' && /R-11/.test(n.message)); assert.equal(r11.length, 16);
});

test('N8 Vastrol COPY: produk terpisah (tidak digabung otomatis) dan diberi peringatan salinan', real, async () => {
  const buf = readFileSync(join(DIR, 'Development of Vastrol 20 mg Tablet COPY.xlsx'));
  const d = await post('Development of Vastrol 20 mg Tablet COPY.xlsx', buf);
  assert.equal(d.status, 200); assert.equal(d.json.compile.dosage_form, 'Tablet COPY');
  assert.ok(d.json.warnings.some((x) => x.code === 'W-nama' && /salinan/.test(x.message)));
});
