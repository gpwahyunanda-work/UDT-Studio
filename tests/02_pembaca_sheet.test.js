// IQ-19, IQ-20 + skenario 1 dan 2 (bagian pembaca): pembaca sheet atas fixture nyata (data/sheets/csv). [LAPTOP]
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkbook, hasFixtures } from './helpers/fixtures.js';
import { readWorkbook, readTab, mediumCodeFromTab, parseCompileFromFileName, parseCSV } from '../server/import/sheetReader.js';

const opt = { skip: hasFixtures ? false : 'fixture data/sheets/csv tidak ada (set UDT_FIXTURE_DIR)' };
const EMPA = ['Empagliflozin10', 'Development of Empagliflozin 10 mg Tablet.xlsx'];
const ZEM = ['Zemyc150', 'Development of Zemyc 150 mg Kapsul.xlsx'];
const ZEM_COMMENTS = { Release: { E83: 'Titik sampling terlewat, dilakukan pada menit ke-8', N85: 'exclude 5 minutes' } };

test('IQ-19 Empagliflozin 10 mg: 4 medium, 16 run, 12 perbandingan, tab Kimia tidak ada di fixture, blok tanpa AVG ditahan', opt, () => {
  const w = readWorkbook(loadWorkbook(...EMPA));
  assert.deepEqual(w.compile, { product_name: 'Empagliflozin', strength: '10 mg', dosage_form: 'Tablet', title: 'Development of Empagliflozin 10 mg Tablet', api: 'Empagliflozin' });
  assert.equal(w.mediums.length, 4);
  assert.equal(w.runs.length, 16);
  assert.equal(w.runs.filter(r => r.role === 'reference').length, 4);
  assert.equal(w.comparisons.length, 12);
  const hold = w.notes.filter(n => n.kind === 'hold');
  assert.equal(hold.length, 1); assert.equal(hold[0].sheet_tab, 'pH 1,2'); assert.equal(hold[0].cell_range, 'C83:K100');
  assert.ok(w.runs.every(r => r.values.length === 3 && r.timepoints.every(m => m > 0)));      // 3 vessel terisi; titik 0 tidak disimpan
  assert.ok(w.runs.every(r => r.variant === ''));                                                // tidak ada varian pada sheet ini
});

test('Delta (1): produsen/site pindah ke Run: batch sama beda produsen antar tab', opt, () => {
  const w = readWorkbook(loadWorkbook(...EMPA));
  const sites = new Map();
  for (const r of w.runs) { const k = r.batch_no; if (!sites.has(k)) sites.set(k, new Set()); sites.get(k).add(r.manufacturer_site); }
  for (const b of ['F0073H25A', 'F0023C26A', 'F0013E26A']) assert.equal(sites.get(b).size, 2, b);
  assert.ok(sites.get('F0073H25A').has('Prima Medika Laboratories') && sites.get('F0073H25A').has('PT. Pharos Indonesia'));
});

test('IQ-20 f2: 12/12 Empagliflozin dan 25/26 Zemyc cocok +-1; selisih sheet Zemyc Release F0048F26A dilaporkan (42,84 vs 54)', opt, () => {
  const e = readWorkbook(loadWorkbook(...EMPA)); assert.equal(e.checks.filter(c => c.ok).length, 12);
  const z = readWorkbook(loadWorkbook(...ZEM, { comments: ZEM_COMMENTS }));
  assert.equal(z.checks.length, 26); assert.equal(z.checks.filter(c => c.ok).length, 25);
  const diff = z.notes.filter(n => n.kind === 'sheet_diff');
  assert.equal(diff.length, 1); assert.equal(diff[0].sheet_tab, 'Release'); assert.match(diff[0].message, /53\.62.*42\.84/);
  const bad = z.checks.find(c => !c.ok); assert.ok(Math.abs(bad.f2_recomputed - 42.84) < 0.01 && Math.abs(bad.f2_printed - 53.62) < 0.01);
  // hitung ulang dari Total dan n tercetak sama dengan F2 tercetak (12 pasang Empagliflozin; maks selisih kecil)
  assert.ok(Math.max(...e.checks.map(c => Math.abs(c.f2_from_total - c.f2_printed))) < 1e-6);
  // komentar sel dibawa sebagai catatan (delta 3)
  const cm = z.notes.filter(n => n.kind === 'cell_comment').map(n => `${n.sheet_tab}!${n.cell_range}`);
  assert.deepEqual(cm.sort(), ['Release!E83', 'Release!N85']);
});

test('Skenario 1/2 (pembaca): Zemyc Release = 1 Reference + 7 Uji; 7 angka README (Total, n, F2) cocok', opt, () => {
  const z = readWorkbook(loadWorkbook(...ZEM));
  const rel = z.runs.filter(r => r.medium_code === 'Release');
  assert.equal(rel.length, 8); assert.equal(rel.filter(r => r.role === 'reference').length, 1);
  assert.match(rel.find(r => r.role === 'reference').brand_name, /Diflucan/);
  const README = { Y5G103B: [7533, 3, 15], F0048E26A: [268, 5, 57], F0048F26A: [353, 5, 54], F0020G26A: [2912, 3, 25], F0062G26A: [1459, 3, 33], F0063G26A: [4517, 3, 21], F0046H26A: [6200, 3, 17] };
  for (const [batch, [tot, n, f2]] of Object.entries(README)) {
    const run = rel.find(r => r.batch_no === batch); assert.ok(run, batch);
    const c = z.comparisons.find(x => x.testKey === run.key);
    assert.equal(Math.round(c.total_sq), tot, batch); assert.equal(c.n_points, n, batch); assert.equal(Math.round(c.f2), f2, batch);
  }
  assert.equal(z.comparisons.find(x => x.testKey === rel.find(r => r.batch_no === 'Y5G103B').key).conclusion_printed, 'Not Similar');
});

test('Delta (7): rumus sheet lama melewatkan vessel 1 di kolom 30 menit: dilaporkan, data vessel tetap lengkap', opt, () => {
  for (const [wb, want] of [[EMPA, 12], [ZEM, 22]]) {
    const w = readWorkbook(loadWorkbook(...wb));
    const blocks = new Set(w.notes.filter(n => n.kind === 'stat_mismatch' && /^I\d+$/.test(n.cell_range)).map(n => `${n.sheet_tab}|${/baris (\d+)/.exec(n.message)[1]}`));
    assert.equal(blocks.size, want, wb[0]);
    assert.ok(w.runs.every(r => r.values.length === 3));
  }
});

test('Delta (4)(5)(6): kesimpulan tercetak apa adanya atau kosong; n tercetak disimpan (bukan n Langkah 4)', opt, () => {
  const e = readWorkbook(loadWorkbook(...EMPA));
  assert.ok(e.comparisons.every(c => c.conclusion_printed === null && c.conclusion_code === null && [3, 7].includes(c.n_points)));
  const z = readWorkbook(loadWorkbook(...ZEM));
  assert.ok(z.comparisons.every(c => ['Similar', 'Not Similar'].includes(c.conclusion_printed)));
});

test('R-01 toleransi nama tab: "UDT Release" dikenali; tab tanpa AVG (Kimia, Sink Condition, Sampel F3) diabaikan; nama tak dikenal ditahan', opt, () => {
  const rel = loadWorkbook(...EMPA).tabs[0];
  assert.equal(readTab({ ...rel, name: 'UDT Release' }).medium.code, 'Release');
  assert.equal(readTab({ ...rel, name: 'UDT pH 1.2' }).medium.code, '1,2');
  for (const n of ['Kimia', 'Sink Condition', 'Sampel F3']) {
    const t = readTab({ name: n, values: [['judul'], ['', 'Parameter', 'Nilai']] });
    assert.equal(t.isUdt, false); assert.equal(t.notes[0].kind, 'ignored');
  }
  const held = readTab({ ...rel, name: 'Hasil Aneh' });
  assert.equal(held.held, true); assert.equal(held.notes[0].kind, 'hold');
  assert.equal(mediumCodeFromTab('pH 6,8'), '6,8'); assert.equal(mediumCodeFromTab('pH 9,9'), null);
});

test('R-14 blok identik bertanggal beda = satu run (tanggal terawal), dua SumberBlok', opt, () => {
  const rel = loadWorkbook(...EMPA).tabs[0];
  const g = rel.values.map(r => [...r]), f = rel.formulas.map(r => [...r]);
  const start = 106;   // setelah blok terakhir (r=83..105)
  while (g.length < start - 1) { g.push([]); f.push([]); }
  for (let k = 0; k < 23; k++) { g[start - 1 + k] = [...rel.values[37 - 1 + k]]; f[start - 1 + k] = [...rel.formulas[37 - 1 + k]]; }
  g[start - 1][0] = '2030-01-01 00:00:00';
  const t = readTab({ name: 'Release', values: g, formulas: f });
  const runs = readWorkbook({ fileName: 'Development of Empagliflozin 10 mg Tablet.xlsx', tabs: [{ name: 'Release', values: g, formulas: f }] }).runs;
  assert.equal(t.blocks.length, 5); assert.equal(runs.length, 4);
  const merged = runs.find(r => r.sourceBlocks.length === 2);
  assert.deepEqual(merged.sourceBlocks.map(b => b.avg_row), [37, 106]);
  assert.ok(merged.test_date < '2030-01-01');
});

test('Nama berkas -> compile (Q-13): pola Development of ...; selain itu tidak ditebak', () => {
  assert.deepEqual(parseCompileFromFileName('Development of Gionix 16 mg Tab.xlsx'), { product_name: 'Gionix', strength: '16 mg', dosage_form: 'Tab', title: 'Development of Gionix 16 mg Tab' });
  assert.equal(parseCompileFromFileName('data.xlsx'), null);
});

test('CSV: sel bertanda kutip, koma dan baris baru di dalam sel, BOM', () => {
  assert.deepEqual(parseCSV('\ufeffa,"b,c","d\ne"\r\n1,2,3\r\n'), [['a', 'b,c', 'd\ne'], ['1', '2', '3']]);
});
