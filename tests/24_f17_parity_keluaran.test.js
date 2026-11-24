// F17 (F16-02, F16-03): satu fungsi sumber nilai untuk semua keluaran. Blok ditahan tidak menampilkan angka; ekspor memuat SEMUA sel matriks (termasuk yang dihitung Langkah 4 dan tidak tersimpan) dengan penanda "dihitung".
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { createTestDb } from './helpers/db.js';
import { loginAs } from './helpers/http.js';
import { REPO, loadWorkbook, hasFixtures } from './helpers/fixtures.js';
import { readWorkbook } from '../server/import/sheetReader.js';
import { handle } from '../server/app.js';
import { loadCompileData } from '../server/compileData.js';
import { buildDashboard } from '../server/dashboard.js';
import { withOfficialF2, heldReason } from '../server/f2resmi.js';
import { query } from '../server/db.js';

const skip = !hasFixtures ? 'fixture sheet tidak ada' : false;
const rd = (f) => readFileSync(join(REPO, f), 'utf8');
let db, A, prods;
const SHEETS = [['Empagliflozin10', 'Development of Empagliflozin 10 mg Tablet.xlsx'], ['Empagliflozin25', 'Development of Empagliflozin 25 mg Tablet.xlsx', ['UDT_Release', 'UDT_pH_1_2', 'UDT_pH_4_5', 'UDT_pH_6_8']], ['Zemyc150', 'Development of Zemyc 150 mg Kapsul.xlsx'], ['Gionix16', 'Development of Gionix 16 mg Tab.xlsx'], ['Vastrol20', 'Development of Vastrol 20 mg Tablet.xlsx', ['pH_1_2', 'pH_4_5', 'pH_6_8']]];
before(async () => {
  if (!hasFixtures) return;
  db = await createTestDb('f17p'); A = await loginAs('Admin F17p', 'admin', '10.17.6.1');
  for (const x of SHEETS) { const r = await A.post('/api/imports', readWorkbook(loadWorkbook(...x))); assert.equal(r.status, 201, JSON.stringify(r.json)); }
  prods = (await A.get('/api/products')).json.products;
});
after(async () => { if (db) await db.drop(); });

const exp = async (id, fmt) => handle(new Request(`https://udt.test/api/compiles/${id}/export?format=${fmt}`, { headers: { cookie: A.cookie, 'x-forwarded-for': A.ip } }));
async function xlsxF2(id) {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(await (await exp(id, 'xlsx')).arrayBuffer()));
  const f2 = [], notes = []; let nums = 0;
  wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => { const v = c.value; if (v && typeof v === 'object' && /LOG10/.test(v.formula || '') && typeof v.result === 'number') f2.push(v.result.toFixed(6)); if (typeof v === 'string' && /dihitung Langkah 4|DITAHAN/.test(v)) notes.push(v); })));
  return { f2, notes, wb };
}

test('P1 himpunan sel matriks = himpunan perbandingan ekspor xlsx (semua produk): nilai sama persis; sel dihitung bertanda; sel ditahan tanpa angka', { skip, timeout: 240000 }, async () => {
  let total = 0, computed = 0, held = 0;
  for (const p of prods) {
    const d = await buildDashboard(query, p.id);
    const cells = []; for (const ck of d.comp_order) for (const byMed of Object.values(d.cells[ck])) for (const c of Object.values(byMed)) cells.push(c);
    const mx = cells.filter((c) => !c.held).map((c) => c.f2.toFixed(6)).sort(), hd = cells.filter((c) => c.held);
    const x = await xlsxF2(p.id);
    assert.deepEqual(x.f2.slice().sort(), mx, `${p.name}: himpunan f2 matriks = ekspor`);
    assert.equal(x.notes.filter((n) => /DITAHAN/.test(n) && /tanpa angka f2/.test(n)).length, hd.length, `${p.name}: sel ditahan di ekspor`);
    const raw = await loadCompileData(query, p.id, { withPoints: true }), ex = withOfficialF2(raw, d);
    const stored = new Set(raw.comparisons.map((c) => `${c.test_run_id}|${c.ref_run_id}`));
    const notStored = ex.comparisons.filter((c) => !c.held && !stored.has(`${c.test_run_id}|${c.ref_run_id}`)).length;
    assert.equal(x.notes.filter((n) => /dihitung Langkah 4/.test(n)).length, notStored, `${p.name}: penanda dihitung`);
    total += mx.length; computed += notStored; held += hd.length;
  }
  assert.ok(total > 50, 'banyak sel diperiksa ' + total); assert.ok(computed > 0, 'ada sel dihitung yang tidak tersimpan'); assert.ok(held >= 1, 'ada sel ditahan (Empagliflozin 25 mg F0058D26A 500mL)');
});

test('P2 Empagliflozin 25 mg F0058D26A 500mL (pH 6,8): ditahan di matriks, ekspor xlsx/csv/tsv, dan payload chip: tidak ada angka (f2, Total, n, nilai vessel)', { skip, timeout: 120000 }, async () => {
  const p = prods.find((x) => /Empagliflozin 25/.test(x.name)), d = await buildDashboard(query, p.id);
  const row = d.runs.find((r) => r.key === 'F0058D26A 500mL'); assert.ok(row && row.held['6,8'], 'run ditahan ada');
  for (const ck of d.comp_order) { const c = d.cells[ck]['F0058D26A 500mL']?.['6,8']; assert.ok(c, 'sel ada'); assert.ok(c.held); for (const k of ['f2', 'k', 'n', 'total', 'f2s', 'ks', 'sheet']) assert.equal(c[k], null, k); }
  const raw = await loadCompileData(query, p.id, { withPoints: true }), ex = withOfficialF2(raw, d), run = raw.runs.find((r) => heldReason(r));
  assert.ok(run); const exr = ex.runs.find((r) => r.run_id === run.run_id); assert.ok(exr.held);
  assert.ok(Object.values(exr.vessels).every((v) => v.every((x) => x === null)), 'nilai vessel dikosongkan di ekspor');
  assert.ok(ex.comparisons.filter((c) => c.test_run_id === run.run_id || c.ref_run_id === run.run_id).every((c) => c.held && c.f2 === null && c.points.length === 0));
  for (const f of ['csv', 'tsv']) {
    const t = (await (await exp(p.id, f)).text()), lines = t.split(/\r\n/).filter((l) => l.includes('F0058D26A') && l.includes('500mL') && l.includes('pH 6,8'));
    assert.equal(lines.length, 1, 'satu baris penanda ditahan'); assert.match(lines[0], /Ditahan/);
    const sep = f === 'csv' ? ',' : '\t'; for (const l of lines) assert.equal(l.split(sep).pop(), '', 'persen terlepas kosong pada blok ditahan');
  }
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(await (await exp(p.id, 'xlsx')).arrayBuffer()));
  const ws = wb.getWorksheet('pH 6,8'); let r0 = null; ws.eachRow((row, i) => { const v = row.getCell(2).value; if (typeof v === 'string' && /F0058D26A.*500mL/.test(v) && r0 === null) r0 = i; });
  assert.ok(r0, 'blok ada di tab pH 6,8'); assert.match(String(ws.getCell(`B${r0 + 1}`).value), /DITAHAN saat impor/);
  for (let k = 7; k <= 18; k++) for (let c = 5; c <= 12; c++) assert.ok([null, undefined, ''].includes(ws.getCell(r0 + k, c).value) , `sel vessel kosong ${r0 + k},${c}`);
});

test('P3 chip, cetak, PNG: sumber kode memakai SATU nilai sel (c.f2 / c.held); chip ditahan tanpa angka; cetak dan PNG membaca chip dari DOM', () => {
  const a = rd('compiler/app.js');
  assert.match(a, /if \(c\.held\) \{ chips \+= /); assert.match(a, /\u00b7 ditahan<\/span>/); assert.match(a, /fmt\(c\.f2\) \+ '<\/span>'/);
  assert.match(a, /querySelectorAll\('\.chip'\)[\s\S]{0,80}textContent/, 'PNG membaca teks chip dari DOM yang sama');
  const d = rd('server/dashboard.js'); assert.match(d, /officialPair/); assert.doesNotMatch(d, /f2Between/); assert.match(rd('server/f2resmi.js'), /export function officialPair/);
  assert.match(rd('server/app.js'), /withOfficialF2\(raw, await buildDashboard/);
});
