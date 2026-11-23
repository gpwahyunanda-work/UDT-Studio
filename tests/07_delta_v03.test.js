// Delta v0.3 (F1b-3): lima-sheet reader cases. Fixture CSV berasal dari snapshot terbukti; tidak ada akses Drive di tes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkbook, hasFixtures } from './helpers/fixtures.js';
import { readWorkbook } from '../server/import/sheetReader.js';

const opt = { skip: hasFixtures ? false : 'fixture data/sheets/csv tidak ada (set UDT_FIXTURE_DIR)' };
const GIONIX = ['Gionix16', 'Development of Gionix 16 mg Tab.xlsx'];
const VASTROL = ['Vastrol20', 'Development of Vastrol 20 mg Tablet.xlsx', ['pH_1_2', 'pH_4_5', 'pH_6_8']];
const E25 = ['Empagliflozin25', 'Development of Empagliflozin 25 mg Tablet.xlsx', ['UDT_Release', 'UDT_pH_1_2', 'UDT_pH_4_5', 'UDT_pH_6_8']];

test('B3-5/B3-10 Gionix: header berulang dilewati; ulang batch berdata beda tetap Run berbeda', opt, () => {
  const w = readWorkbook(loadWorkbook(...GIONIX));
  assert.equal(w.mediums.length, 4); assert.equal(w.runs.length, 48); assert.equal(w.comparisons.length, 40);
  const r = w.runs.filter(x => x.medium_code === '6,8' && x.batch_no === 'F0059C26A');
  assert.equal(r.length, 2); assert.equal(new Set(r.map(x => x.data_hash)).size, 2); // dua blok identik digabung, satu run ulang berbeda
  assert.ok(r.some(x => x.sourceBlocks.length === 2), 'B3-2: blok identik menjadi satu run, dua sumber');
  const bad = w.runs.filter(x => !x.is_valid);   // R-09: catatan baris ke-2 B(r+1) memuat Salah Wavelength = Tidak valid, alasan = catatan, blok tetap diimpor
  assert.equal(bad.length, 16); assert.equal(bad.reduce((n, x) => n + x.sourceBlocks.length, 0), 17); assert.ok(bad.every(x => /wavelength/i.test(x.invalid_reason) && x.manufacturer_site && !/wavelength/i.test(x.manufacturer_site)));
});

test('B3-3/B3-4/B3-6 Vastrol: Crestor berperan ganda dan kesimpulan LF disimpan apa adanya', opt, () => {
  const w = readWorkbook(loadWorkbook(...VASTROL));
  assert.equal(w.mediums.length, 3); assert.equal(w.comparisons.length, 60);
  const crestor = w.runs.filter(x => x.batch_no === '6005160');
  assert.equal(crestor.length, 3);
  assert.ok(crestor.every(x => x.sourceBlocks.some(b => b.role_raw === 'Reference Product') && x.sourceBlocks.some(b => b.role_raw === '')));
  const c = w.comparisons.find(x => x.conclusion_printed?.includes('\nF2 calculation for information only'));
  assert.ok(c); assert.equal(c.conclusion_is_printed, true);
  assert.ok(w.notes.some(n => n.kind === 'api_mismatch'));
});

test('B3-1/B3-5/B3-7 Empagliflozin 25: awalan UDT, varian luar kurung, teks produk per blok, satu blok ditahan', opt, () => {
  const w = readWorkbook(loadWorkbook(...E25));
  assert.equal(w.mediums.length, 4); assert.equal(w.comparisons.length, 24);
  const f25 = w.runs.filter(x => x.batch_no === 'F0025A26A');
  assert.equal(f25.length, 4);
  assert.equal(new Set(f25.flatMap(x => x.sourceBlocks.map(b => b.product_printed))).size, 2);
  assert.ok(w.runs.some(x => x.variant === '500mL'));
  const held = w.runs.flatMap(x => x.sourceBlocks).find(b => b.import_outcome === 'ditahan');
  assert.equal(held.avg_row, 175); assert.match(held.hold_reason, /W-19/);
  assert.equal(w.checks.filter(x => x.ok).length, 23); assert.equal(w.checks.filter(x => !x.ok).length, 1);
});
