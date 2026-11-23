// Sprint 3 / Compiler: logika tampilan mengikuti mockup (kuadran, pembanding, penanda, KPI, temuan). Rumus tetap dari fungsi asli Langkah 4. [LAPTOP]
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './helpers/fixtures.js';
import { loadPageHost } from './helpers/pageHost.js';
import { buildProfiles, deriveRoles } from '../ui/src/lib/model.js';
import { layoutMediums, refCandidates, batchRows, computeCells, buildFindings, kpis, printedCategory, shortBrand, MARK } from '../ui/src/lib/layout.js';

const host = loadPageHost();
const med = (id, code) => ({ medium_id: id, code, label: code === 'Release' ? 'Release' : code === 'Air' ? 'Air' : `pH ${code}`, full_name: 'M' + code });
const mins = [5, 10, 15, 20, 30, 45, 60];
const prof = (arr) => ({ 1: arr.map((x) => x + 1), 2: arr, 3: arr.map((x) => x - 1) });
let rid = 0;
const run = (medium_id, brand, batch, arr, o = {}) => ({ run_id: ++rid, medium_id, brand_name: brand, batch_no: batch, role: 'uji', variant: '', test_date: '2026-03-01', is_valid: true, minutes: mins, vessels: prof(arr), source_blocks: [], manufacturer_site: null, ...o });
const SLOW = [10, 20, 30, 40, 55, 70, 80], FAST = [90, 95, 97, 98, 99, 99, 99], REFP = [30, 45, 58, 68, 80, 90, 95];

test('layoutMediums: 4 kuadran; tanpa Release -> Air kosong sebagai kuadran ke-4; Release ada -> Release', () => {
  const vas = layoutMediums([med(1, '1,2'), med(2, '4,5'), med(3, '6,8')], [{ medium_id: 1 }, { medium_id: 2 }, { medium_id: 3 }]);
  assert.deepEqual(vas.map((s) => s.code), ['1,2', '4,5', '6,8', 'Air']); assert.equal(vas[3].empty, true); assert.equal(vas[0].empty, false);
  const zem = layoutMediums([med(1, 'Release'), med(2, '1,2'), med(3, '4,5'), med(4, '6,8')], [{ medium_id: 1 }]);
  assert.deepEqual(zem.map((s) => s.code), ['1,2', '4,5', '6,8', 'Release']); assert.equal(zem[1].empty, true);
  const ex = layoutMediums([med(1, '1,2'), med(2, '7,2')], [{ medium_id: 2 }]);
  assert.ok(ex.some((s) => s.code === '7,2'), 'medium lain tidak disembunyikan');
});

function fixture() {
  rid = 0;
  const mediums = [med(1, '1,2'), med(2, '4,5')];
  const runs = [
    run(1, 'Ezero 20 mg Tablet', 'B41968', REFP, { role: 'reference', manufacturer_site: 'PT Meiji' }), run(2, 'Ezero 20 mg Tablet', 'B41968', REFP, { role: 'reference' }),
    run(1, 'Crestor 20 mg Tablet', '6005160', FAST, { role: 'reference' }), run(2, 'Crestor 20 mg Tablet', '6005160', FAST, { role: 'reference' }),
    run(1, 'Vastrol 20 mg Tablet', 'F001', SLOW, { test_date: '2026-04-01' }), run(2, 'Vastrol 20 mg Tablet', 'F001', FAST, { test_date: '2026-04-01' }),
    run(1, 'Vastrol 20 mg Tablet', 'F002', FAST, { test_date: '2026-05-01' }), run(1, 'Vastrol 20 mg Tablet', 'F003', REFP, { test_date: '2026-02-01', is_valid: false, invalid_reason: 'Salah Wavelength' }),
    run(1, 'Vastrol 20 mg Tablet', 'F005', [31, 46, 57, 67, 79, 89, 94], { test_date: '2026-06-01' }), run(1, 'Vastrol 20 mg Tablet', 'F004', SLOW, { variant: 'Kp Rendah' }), run(1, 'Vastrol 20 mg Tablet', 'F004', FAST, { variant: 'Kp Tinggi' }),
  ];
  const comparisons = [{ comparison_id: 1, medium_id: 1, test_run_id: 5, ref_run_id: 1, f2: 20, n_points: 3, conclusion_code: null, conclusion_printed: 'Similar, both products rapidly dissolved (>=85% in 15 minutes)' }];
  return { compile: { compile_id: 1, title: 'Development of Vastrol 20 mg Tablet', product_name: 'Vastrol' }, mediums, runs, comparisons, api_notes: [] };
}

test('Pembanding, baris, penanda: refCandidates, batch terbaru di atas, varian = baris terpisah, tidak valid tersembunyi bawaan', () => {
  const data = fixture(), roles = deriveRoles(data), slots = layoutMediums(data.mediums, data.runs);
  const cands = refCandidates(data, roles);
  assert.equal(cands.length, 2); assert.equal(cands[0].batch, 'B41968', 'yang paling sering dirujuk menjadi bawaan');
  assert.equal(shortBrand('Ezero 20 mg Tablet'), 'Ezero 20 mg');
  const rows = batchRows(data, slots, cands, { status: 'valid' });
  assert.deepEqual(rows.map((r) => `${r.batch}|${r.variant}`), ['F002|', 'F001|', 'F004|Kp Rendah', 'F004|Kp Tinggi'].sort((a, b) => 0) && rows.map((r) => `${r.batch}|${r.variant}`));
  assert.equal(rows[0].batch, 'F005'); assert.ok(!rows.some((r) => r.batch === 'F003'), 'Tidak valid tidak tampil pada Valid saja');
  assert.equal(batchRows(data, slots, cands, { status: 'semua' }).some((r) => r.batch === 'F003'), true);
  assert.equal(batchRows(data, slots, cands, { status: 'tidak_valid' }).length, 1);
  assert.equal(batchRows(data, slots, cands, { q: 'rendah' }).length, 1);
  assert.equal(rows.filter((r) => r.batch === 'F004').length, 2);
  assert.ok(!rows.some((r) => r.batch === '6005160' || r.batch === 'B41968'), 'pembanding bukan baris batch');
});

test('Sel f2 lewat modul Langkah 4: penanda ✓ » ×; ganti pembanding aktif menghitung ulang; KPI konsisten', () => {
  const data = fixture(), roles = deriveRoles(data), slots = layoutMediums(data.mediums, data.runs), cands = refCandidates(data, roles), profiles = buildProfiles(host, data);
  const rows = batchRows(data, slots, cands, { status: 'valid' });
  const a = computeCells(host, profiles, data, rows, slots, cands, cands[0].key);
  const f001 = rows.find((r) => r.batch === 'F001'), f002 = rows.find((r) => r.batch === 'F002');
  assert.equal(a.cells.get(`${f001.key}|1,2`).code, 'not_similar'); assert.equal(MARK[a.cells.get(`${f001.key}|1,2`).code], '×');
  const f005 = rows.find((r) => r.batch === 'F005'); assert.equal(a.cells.get(`${f005.key}|1,2`).mark, '✓');
  assert.equal(a.others.length, 1, 'pembanding lain tampil sebagai baris terpisah');
  const b = computeCells(host, profiles, data, rows, slots, cands, cands[1].key);
  assert.notEqual(a.cells.get(`${f001.key}|1,2`).f2, b.cells.get(`${f001.key}|1,2`).f2);
  assert.equal(b.cells.get(`${f002.key}|1,2`).code, 'very_rapid'); assert.equal(b.cells.get(`${f002.key}|1,2`).mark, '»');   // pembanding Crestor cepat
  const k = kpis({ rows, slots, computed: a, findings: [], data, status: 'valid' });
  assert.equal(k.batches, rows.length); assert.equal(k.mediumOf, 4); assert.equal(k.mediumWith, 2); assert.deepEqual(k.emptyNames, ['pH 6,8', 'Air']);
  assert.equal(k.notSimilar, [...a.cells.values()].filter((c) => c && c.code === 'not_similar').length);
});

test('Temuan: kategori kesimpulan sheet vs Langkah 4, tidak valid dan blok ganda sebagai Catatan impor, zat aktif belum pasti', () => {
  assert.equal(printedCategory('Not Similar'), 'not_similar'); assert.equal(printedCategory('Similar'), 'similar');
  assert.equal(printedCategory('Similar, both products rapidly dissolved (>=85% in 15 minutes)\nF2 calculation for information only'), 'very_rapid'); assert.equal(printedCategory(''), null);
  const data = fixture(); data.api_notes = [{ sheet_tab: 'pH 1,2', message: 'x' }]; data.runs[5].source_blocks = [{}, {}];
  const roles = deriveRoles(data), slots = layoutMediums(data.mediums, data.runs), cands = refCandidates(data, roles), profiles = buildProfiles(host, data);
  const rows = batchRows(data, slots, cands, { status: 'semua' }), computed = computeCells(host, profiles, data, rows, slots, cands, cands[0].key);
  const f = buildFindings({ host, profiles, data, roles, slots, rows, computed, candidates: cands });
  const types = new Set(f.map((x) => x.type));
  assert.ok(types.has('Beda dengan sheet lama'), 'sheet menulis very rapid, hitung ulang Not Similar');
  assert.ok(f.some((x) => x.type === 'Catatan impor' && /Tidak valid/.test(x.text)));
  assert.ok(f.some((x) => x.type === 'Catatan impor' && /belum pasti/.test(x.text)));
  assert.ok(f.some((x) => x.type === 'Catatan impor' && /blok sheet/.test(x.text)));
});

test('Sumber Compiler: spesifikasi UI ada (matriks centang maks 4, kisi 2x2, Perlu dicek, ekspor, zoom, penanda)', () => {
  const src = readFileSync(join(REPO, 'ui/src/components/CompilerPage.jsx'), 'utf8') + readFileSync(join(REPO, 'ui/src/components/MiniChart.jsx'), 'utf8');
  for (const s of ['UDT COMPILER', 'Pembanding aktif', 'Cari batch', 'Status run', 'Rentang tanggal uji', 'Matriks f2 terhadap', 'Centang sampai', 'Terbaru di atas', 'Perlu dicek', 'Data dan kesimpulan tidak diubah', 'Zoom 0–20 mnt', 'Tambah data', 'Ekspor ke sheet', 'Pembanding lain', 'Waktu (menit)', '% terlarut rerata', 'Belum ada data']) assert.ok(src.includes(s), s);
  assert.doesNotMatch(src.replace(/\/\/.*$/gm, ''), /log10|Math\.pow|Math\.log/);
});
