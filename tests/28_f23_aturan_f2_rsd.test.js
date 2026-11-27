// F23 butir 6: audit dan KUNCI aturan f2/RSD terhadap PerBPOM 11/2022, FDA, EMA (Langkah 4 = resmi, jawaban tim P-1/P-2).
//  - cut-off 85%: titik pertama tempat salah satu produk >= 85% ikut dihitung, titik sesudahnya tidak
//  - "sangat cepat": KEDUA produk >= 85% pada <= 15 menit -> kesimpulan otomatis Similar, f2 hanya informasi
//  - RSD: <= 20% titik pertama, <= 10% titik berikutnya (hanya titik yang ikut f2)
//  Bagian A tanpa DB (fungsi Langkah 4 + jembatan); bagian B lewat POST /api/ingest/commit dan dashboard (PostgreSQL uji).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import * as step4 from '../server/step4.js';
import { rsdOutOfLimit } from '../server/lib/udtBridge.js';
import { f2Tim } from '../server/f2tim.js';
import { createTestDb } from './helpers/db.js';
import { loggedIn } from './helpers/http.js';

const S = (rsds) => rsds.map((rsd) => ({ rsd }));
const ev = (times, ref, test, rr, tr) => step4.evalSimilarityF2(times, ref, test, S(rr || ref.map(() => 1)), S(tr || test.map(() => 1)));
const cls = (r) => step4.classifyF2Outcome(r);

// ---------------------------------------------------------------- A. aturan murni
test('A1 cut-off 85%: titik pertama tempat SALAH SATU produk >= 85% ikut; titik sesudahnya dibuang', () => {
  const r = ev([5, 10, 15, 20, 30, 45], [30, 60, 80, 90, 95, 98], [25, 55, 86, 92, 96, 99]);
  assert.equal(r.cutoffIdx, 2); assert.equal(r.n, 3); assert.deepEqual(r.usedTimes, [5, 10, 15]);
  const r2 = ev([5, 10, 15, 20, 30], [30, 60, 70, 90, 95], [25, 50, 60, 70, 80]);   // hanya pembanding yang lewat 85 (menit 20)
  assert.equal(r2.cutoffIdx, 3); assert.equal(r2.n, 4);
  const r3 = ev([5, 10, 15], [10, 20, 30], [12, 22, 32]);   // tak ada yang mencapai 85: semua titik ikut
  assert.equal(r3.n, 3); assert.equal(r3.cutoffIdx, 2);
});

test('A2 batas tepat 85,0 dihitung (>= 85); 84,99 tidak', () => {
  assert.equal(ev([5, 10, 15], [30, 85, 95], [20, 40, 60]).cutoffIdx, 1);
  assert.equal(ev([5, 10, 15], [30, 84.99, 95], [20, 40, 60]).cutoffIdx, 2);
});

test('A3 sangat cepat: KEDUA produk >= 85% pada <= 15 menit -> Similar otomatis walau f2 < 50; f2 hanya informasi', () => {
  const r = ev([5, 10, 15], [10, 90, 99], [60, 86, 97]);   // selisih besar di menit 5: f2 mentah rendah
  assert.equal(r.both85at15, true);
  assert.ok(r.f2 < 50, `f2 mentah ${r.f2} semestinya < 50 pada skenario ini`);
  const c = cls(r); assert.equal(c.code, 'very_rapid'); assert.equal(c.label, 'SIMILAR');
});

test('A4 BUKAN sangat cepat: hanya satu produk >= 85% pada 15 menit, atau keduanya baru >= 85% sesudah menit 15 -> ditentukan f2', () => {
  const one = ev([5, 10, 15], [50, 80, 90], [30, 50, 70]);
  assert.equal(one.both85at15, false); assert.notEqual(cls(one).code, 'very_rapid');
  const late = ev([5, 10, 15, 20, 30], [20, 40, 60, 88, 95], [18, 38, 58, 86, 94]);   // keduanya >= 85 baru di menit 20
  assert.equal(late.both85at15, false); assert.equal(cls(late).code, 'similar');
  const nots = ev([5, 10, 15], [40, 60, 70], [10, 20, 30]);
  assert.equal(cls(nots).code, 'not_similar'); assert.equal(cls(nots).label, 'NOT SIMILAR');
});

test('A5 RSD: batas 20% titik pertama, 10% titik berikutnya; tepat di batas lolos', () => {
  assert.equal(ev([5, 10, 15], [10, 20, 30], [10, 20, 30], [20, 10, 10], [20, 10, 10]).rsdExceeded, false);
  const a = ev([5, 10, 15], [10, 20, 30], [10, 20, 30], [20.01, 10, 10], [1, 1, 1]);
  assert.equal(a.rsdExceeded, true); assert.match(a.rsdDetails[0], /^menit 5' \(Limit 20%/);
  const b = ev([5, 10, 15], [10, 20, 30], [10, 20, 30], [1, 10.01, 1], [1, 1, 1]);
  assert.equal(b.rsdExceeded, true); assert.match(b.rsdDetails[0], /^menit 10' \(Limit 10%/);
  const c = ev([5, 10, 15], [10, 20, 30], [10, 20, 30], [1, 1, 15], [1, 1, 1]);   // 15% pada titik ke-3: batas 10 -> terlampaui
  assert.equal(c.rsdExceeded, true);
});

test('A6 RSD hanya dinilai pada titik yang ikut f2 (sampai pemotongan 85%)', () => {
  const r = ev([5, 10, 15, 20], [50, 90, 95, 99], [40, 88, 94, 98], [5, 5, 60, 60], [5, 5, 60, 60]);   // cut-off di menit 10
  assert.equal(r.n, 2); assert.equal(r.rsdExceeded, false);
});

test('A7 rsdOutOfLimit (jembatan) membaca batas dari Langkah 4: titik pertama 20, sisanya 10; tanpa angka di server', () => {
  const prof = { times: [5, 10, 15], means: [30, 50, 70], stats: S([19, 11, 9]), error: null };
  const bad = rsdOutOfLimit(step4, prof);
  assert.deepEqual(bad.map((b) => [b.t, b.lim, b.first]), [[10, 10, false]]);
  assert.deepEqual(rsdOutOfLimit(step4, { times: [5, 10, 15], means: [30, 50, 70], stats: S([20, 10, 10]), error: null }), []);
  assert.deepEqual(rsdOutOfLimit(step4, { error: 'x', times: [], stats: [], means: [] }), []);
});

test('A8 pembanding tim (f2Tim): n = 3 titik pertama; sangat cepat bila KEDUA >= 85% pada titik ke-3 (jadwal baku 5/10/15); pembanding saja, bukan angka resmi', () => {
  assert.equal(f2Tim([30, 60, 90], [20, 50, 88]).kind, 'rap');
  assert.equal(f2Tim([30, 60, 90], [20, 50, 80]).kind, 'not');
  assert.equal(f2Tim([30, 60], [20, 50]).kind, 'na');
});

// ---------------------------------------------------------------- B. server: commit dan dashboard
let db, w;
before(async () => { db = await createTestDb('f28'); w = await loggedIn('Penulis F28', '10.28.0.1'); });
after(async () => { if (db) await db.drop(); });

const vessels = (means, spread = 0) => [1, 2, 3].map((no, i) => ({ no, values: means.map((m) => Math.round((m + (i - 1) * spread) * 1000) / 1000) }));
const run = (key, role, batch, means, spread) => ({ key, medium_code: 'Release', brand_name: role === 'reference' ? 'Ref' : 'Uji', batch_no: batch, role, variant: '', test_date: '2026-11-20', timepoints: [5, 10, 15], values: vessels(means, spread) });
async function pushPair(name, refMeans, testMeans, spread = 0) {
  const c = await w.post('/api/compiles', { product_name: name, strength: '10 mg', dosage_form: 'Tablet' });
  assert.equal(c.status, 201, JSON.stringify(c.json));
  const l4 = (await import('../server/lib/udtBridge.js'));
  const pk = { compile_id: c.json.compile_id, mediums: [{ code: 'Release', full_name: 'Release' }], runs: [run('ref', 'reference', 'R1', refMeans, spread), run('u1', 'uji', 'U1', testMeans, spread)],
    comparisons: [{ testKey: 'u1', refKey: 'ref', n_points: 3, f2: 50, total_sq: 0, conclusion_code: 'not_similar', points: [] }] };
  const prof = (r) => l4.runProfile(step4, r.timepoints, Object.fromEntries(r.values.map((v) => [v.no, v.values])));
  pk.comparisons[0].f2 = l4.f2Between(step4, prof(pk.runs[0]), prof(pk.runs[1])).f2;   // koheren (server menolak selisih > 1)
  const r = await w.post('/api/ingest/commit', { push_id: randomUUID(), package: pk });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const d = await w.get(`/api/products/${c.json.compile_id}/dashboard`); assert.equal(d.status, 200);
  const cell = Object.values(d.json.cells).flatMap((byKey) => Object.entries(byKey)).find(([k]) => k === 'U1')?.[1]?.Release;
  return { d: d.json, cell, conclusion: (await db.owner.query('SELECT conclusion_code, f2 FROM comparison c JOIN medium m USING (medium_id) WHERE m.compile_id=$1', [c.json.compile_id])).rows[0] };
}

test('B1 commit Studio: sangat cepat -> kesimpulan disimpan very_rapid (Similar) walau Studio mengirim not_similar dan f2 mentah < 50; dashboard = rap', async () => {
  const x = await pushPair('RapidA', [10, 90, 99], [60, 86, 97]);
  assert.equal(x.conclusion.conclusion_code, 'very_rapid');
  assert.ok(Number(x.conclusion.f2) < 50);
  assert.equal(x.cell.k, 'rap');
});

test('B2 commit Studio: hanya satu produk >= 85% pada 15 menit -> bukan sangat cepat; kesimpulan menurut f2 (not_similar)', async () => {
  const x = await pushPair('RapidB', [40, 70, 90], [10, 20, 30]);
  assert.equal(x.conclusion.conclusion_code, 'not_similar'); assert.equal(x.cell.k, 'not');
});

test('B3 dashboard: RSD di atas batas (sebaran besar) muncul sebagai temuan; sebaran kecil tidak', async () => {
  const hi = await pushPair('RsdHi', [20, 40, 60], [22, 42, 62], 20);   // sebaran besar: RSD tinggi di titik pertama (>20%)
  assert.ok(hi.d.findings.some((f) => f.kind === 'rsd'), 'temuan RSD ada');
  const lo = await pushPair('RsdLo', [20, 40, 60], [22, 42, 62], 0.1);
  assert.ok(!lo.d.findings.some((f) => f.kind === 'rsd'), 'tanpa temuan RSD');
});
