// F6: f2 aturan tim (satu fungsi server) dan dashboard Compiler: angka IDENTIK dengan HTML tim untuk batch yang sama. [LAPTOP: PostgreSQL 17 biasa]
// Oracle di berkas ini = fungsi f2/judge dari HTML tim (Mockup_Langkah6_Compile_UDT_Vastrol_v3.html) disalin HANYA untuk pembanding uji.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestDb } from './helpers/db.js';
import { loggedIn } from './helpers/http.js';
import { loadWorkbook, hasFixtures, REPO } from './helpers/fixtures.js';
import { readWorkbook } from '../server/import/sheetReader.js';
import { f2Tim } from '../server/f2tim.js';

const D = JSON.parse(readFileSync(join(REPO, 'tests/fixtures/mockup_tim_D.json'), 'utf8'));   // data mockup tim (17 run, 3 medium)
// --- oracle: salinan harfiah dari HTML tim ---
function oracleF2(R, T) { let s = 0; for (let i = 1; i <= 3; i++) { const d = R[i] - T[i]; s += d * d; } return 50 * Math.log(100 / Math.sqrt(1 + s / 3)) / Math.LN10; }
function oracleJudge(R, T) { const f = oracleF2(R, T), rap = R[3] >= 85 && T[3] >= 85; return { f, kind: rap ? 'rap' : (f >= 50 ? 'sim' : 'not') }; }
const opt = { skip: hasFixtures ? false : 'fixture data/sheets/csv tidak ada' };
const r1 = (x) => Math.round(x * 10) / 10;

test('f2Tim: tiga titik pertama setelah 0, n = 3; sama dengan oracle HTML tim pada data mockup (semua pasangan)', () => {
  let n = 0;
  for (const ck of ['B41968', '6005160']) {
    const cr = D.runs.find((r) => r.key === ck);
    for (const r of D.runs) { if (r.key === ck) continue; for (const m of Object.keys(r.prof)) {
      const o = oracleJudge(cr.prof[m].avg, r.prof[m].avg), t = f2Tim(cr.prof[m].avg.slice(1), r.prof[m].avg.slice(1));
      assert.ok(Math.abs(o.f - t.f2) < 1e-9, `${ck} ${r.key} ${m}`); assert.equal(t.kind, o.kind, `${ck} ${r.key} ${m}`); assert.equal(t.n, 3); n++;
    } }
  }
  assert.ok(n >= 60);
});

test('f2Tim mereproduksi angka README: Crestor vs Ezero 44,1 / 46,7 / 66,5 dan F0066A26A vs Ezero 63,3 / 36,9 / 81,9', () => {
  const avg = (key, m) => D.runs.find((r) => r.key === key).prof[m].avg.slice(1);
  const got = (key) => ['1,2', '4,5', '6,8'].map((m) => r1(f2Tim(avg('B41968', m), avg(key, m)).f2));
  assert.deepEqual(got('6005160'), [44.1, 46.7, 66.5]);
  assert.deepEqual(got('F0066A26A'), [63.3, 36.9, 81.9]);
  assert.equal(f2Tim(avg('B41968', '4,5'), avg('F0066A26A', '4,5')).kind, 'not');
  assert.equal(f2Tim(avg('B41968', '6,8'), avg('F0066A26A', '6,8')).kind, 'rap');   // keduanya >= 85% di 15 menit: f2 hanya informasi
});

test('f2Tim: kurang dari 3 titik terisi = belum dapat dihitung (bukan 0 atau 100)', () => {
  const t = f2Tim([50, 60, null, 80], [40, null, null, 70]);
  assert.ok(Number.isNaN(t.f2)); assert.equal(t.kind, 'na'); assert.equal(t.n, 2);
});

let db, c, dash;
before(async () => {
  if (!hasFixtures) return;
  db = await createTestDb('f6d'); c = await loggedIn('Analis F6');
  const pkg = readWorkbook(loadWorkbook('Vastrol20', 'Development of Vastrol 20 mg Tablet.xlsx', ['pH_1_2', 'pH_4_5', 'pH_6_8']));
  const imp = await c.post('/api/imports', pkg); assert.equal(imp.status, 201, JSON.stringify(imp.json));
  const list = await c.get('/api/products'); const id = list.json.products[0].id;
  const r = await c.get(`/api/products/${id}/dashboard`); assert.equal(r.status, 200); dash = r.json;
});
after(async () => { if (db) await db.drop(); });

test('Dashboard Vastrol: rata-rata per titik IDENTIK dengan mockup tim; RSD sama kecuali titik 30 menit (catatan F6)', opt, () => {
  assert.deepEqual(dash.times, [0, 5, 10, 15, 20, 30, 45, 60]);
  assert.equal(dash.runs.length, D.runs.length);
  let nAvg = 0, rsdDiff = 0;
  for (const tr of D.runs) {
    const r = dash.runs.find((x) => x.key === tr.key); assert.ok(r, `run ${tr.key}`);
    assert.equal(r.date, tr.date, `tanggal ${tr.key}`);
    for (const [m, p] of Object.entries(tr.prof)) {
      const q = r.prof[m]; assert.ok(q, `${tr.key} ${m}`);
      p.avg.forEach((x, i) => { assert.ok(Math.abs(x - q.avg[i]) < 1e-6, `avg ${tr.key} ${m} #${i}`); nAvg++; });
      p.rsd.forEach((x, i) => { if (i === 5) { if (Math.abs(x - q.rsd[i]) > 0.01) rsdDiff++; } else assert.ok(Math.abs(x - q.rsd[i]) < 0.01, `rsd ${tr.key} ${m} #${i}`); });
    }
  }
  assert.ok(nAvg > 400);
  assert.ok(rsdDiff > 0 && rsdDiff <= 42, 'RSD 30 menit mockup tim berbeda dari hitung ulang Langkah 4 (dicatat di NOTES_F6; server memakai hitung ulang)');
});

test('Dashboard Vastrol: f2_sheet dan kesimpulan tiap sel IDENTIK dengan HTML tim untuk kedua pembanding', opt, () => {
  assert.deepEqual(dash.comp_order.slice().sort(), ['6005160', 'B41968']);
  assert.equal(dash.comps.B41968.name, 'Ezero 20 mg'); assert.equal(dash.comps['6005160'].name, 'Crestor 20 mg');
  let n = 0, nNotE = 0, nNotEoracle = 0;
  for (const ck of ['B41968', '6005160']) {
    const cr = D.runs.find((r) => r.key === ck);
    for (const tr of D.runs) {
      if (tr.key === ck) continue;
      for (const m of Object.keys(tr.prof)) {
        const o = oracleJudge(cr.prof[m].avg, tr.prof[m].avg), cell = dash.cells[ck][tr.key][m];
        assert.ok(cell, `${ck} ${tr.key} ${m}`);
        assert.ok(Math.abs(o.f - cell.f2s) < 1e-4, `f2 ${ck} ${tr.key} ${m}: ${o.f} vs ${cell.f2s}`); assert.equal(cell.ks, o.kind, `kind ${ck} ${tr.key} ${m}`); n++;
        if (ck === 'B41968' && !['B41968', '6005160'].includes(tr.key)) { if (o.kind === 'not') nNotEoracle++; if (cell.ks === 'not') nNotE++; }
      }
    }
  }
  assert.equal(n, 2 * 16 * 3, 'jumlah pasangan: 2 pembanding x 16 run lain x 3 medium');
  assert.equal(nNotE, nNotEoracle);
  // F17: nilai resmi = Langkah 4 (f2, n); hitung ulang tim (f2s) hanya pembanding
  const c1 = dash.cells.B41968.F0066A26A['6,8']; assert.equal(r1(c1.f2s), 81.9); assert.ok(Math.abs(c1.f2 - 97.55) < 0.01, 'resmi = Langkah 4');
  const c2 = dash.cells.B41968.F0066A26A['4,5']; assert.equal(r1(c2.f2s), 36.9); assert.equal(c2.n, 2);
});

test('Dashboard Vastrol: temuan "Perlu dicek" memuat kedelapan temuan tim (jenis, batch, medium)', opt, () => {
  const have = new Set(dash.findings.filter((f) => f.kind !== 'beda_sheet' || f.type === 'Beda dengan sheet lama').map((f) => `${f.type}|${f.batch}|${f.medium}`));
  const want = [
    'Beda dengan sheet lama|F0014E26A Kp Rendah|pH 6,8', 'Data identik|F0006H26A|pH 1,2', 'Data identik|F0047F26A|pH 4,5', 'Data identik|F0041B26A dan F0048B26A|pH 6,8',
    'RSD di atas batas|F0062C26A|pH 6,8', 'RSD di atas batas|F0030D26A|pH 6,8', 'RSD di atas batas|Crestor 20 mg (6005160)|pH 1,2', 'Catatan impor|F0048J26A dan F0049J26A|Semua',
  ];
  for (const w of want) assert.ok(have.has(w), `temuan tim hilang: ${w}`);
  const t = (b, k) => dash.findings.find((f) => f.batch === b && f.type === k).text;
  assert.match(t('F0014E26A Kp Rendah', 'Beda dengan sheet lama'), /pH 6,8: resmi \(Langkah 4\) 34,3 \(Not Similar, n 1\), sheet lama 34,4 \(Similar \(sangat cepat, f2 hanya informasi\), n 3\)\. Penyebab: n berbeda/);   // F17: angka resmi Langkah 4, sheet hanya pembanding
  assert.match(t('F0030D26A', 'RSD di atas batas'), /^RSD 20,4% pada 5 menit \(batas 20% untuk titik pertama\)\./);   // F15: aturan Langkah 4 (jawaban tim P-2)
  assert.match(t('F0062C26A', 'RSD di atas batas'), /^RSD 31,1% pada 10 menit, 17,7% pada 15 menit dan 11,9% pada 20 menit \(batas 10%\)\./);
  assert.match(t('Crestor 20 mg (6005160)', 'RSD di atas batas'), /^RSD 14,7% pada 10 menit dan 10,7% pada 15 menit \(batas 10%\)\./);
  assert.match(t('F0048J26A dan F0049J26A', 'Catatan impor'), /dua blok sheet \(tanggal 19 Okt dan 6 Okt\).*6 Okt 2026/);
  assert.match(t('F0041B26A dan F0048B26A', 'Data identik'), /f2 43,3 terhadap Ezero/);
  assert.equal(dash.warn['F0014E26A Kp Rendah'], 'Selisih dengan sheet lama (pH 6,8)');
});

test('Dashboard Vastrol: zat aktif belum pasti; "Beda dengan sheet lama" (F17) menampilkan resmi, sheet/tim, dan penyebab; sel ditandai hanya bila selisih > 1 atau status beda', opt, () => {
  assert.ok(dash.product.api_uncertain);
  assert.ok(dash.findings.some((f) => f.type === 'Catatan impor' && /Zat aktif belum pasti/.test(f.text)));
  assert.ok(!dash.findings.some((f) => f.kind === 'beda_l4'), 'jenis lama Beda dengan Langkah 4 sudah diganti');
  const fl = dash.findings.filter((f) => f.type === 'Beda dengan sheet lama');
  assert.ok(fl.length > 0 && fl.every((f) => /resmi \(Langkah 4\)/.test(f.text) && /sheet lama|hitung ulang tim/.test(f.text)));
  let marked = 0;
  for (const ck of dash.comp_order) for (const [key, byMed] of Object.entries(dash.cells[ck])) for (const [m, cell] of Object.entries(byMed)) {
    assert.equal(cell.src, 'langkah4', `${ck} ${key} ${m}`);
    if (cell.beda_sheet) { marked++; assert.ok(cell.sheet.k !== cell.k || Math.abs(cell.f2 - cell.sheet.f2) > 1, `${ck} ${key} ${m}`); assert.ok(cell.cause, 'penyebab diisi'); }
    else if (cell.sheet && cell.k === cell.sheet.k) assert.ok(cell.k === 'rap' || Math.abs(cell.f2 - cell.sheet.f2) <= 1, `${ck} ${key} ${m}: tidak ditandai padahal selisih > 1`);
    if (cell.beda_tim) assert.ok(!cell.sheet && (cell.k !== cell.ks || (cell.ks !== 'rap' && Math.abs(cell.f2 - cell.f2s) > 1)), `${ck} ${key} ${m}`);
  }
  assert.ok(marked >= 3, 'sel Vastrol yang beda dengan sheet: ' + marked);
});
