// Sprint 2: udtBridge memakai fungsi ASLI Langkah 4 (IQ-03 diperluas) + titik akhir baca /api/compiles/:id/data [LAPTOP]
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createTestDb } from './helpers/db.js';
import { loggedIn } from './helpers/http.js';
import { loadWorkbook, hasFixtures, REPO } from './helpers/fixtures.js';
import { loadPageHost } from './helpers/pageHost.js';
import { readWorkbook } from '../server/import/sheetReader.js';
import { runProfile, f2Between, profileOfRun, bridgeStatus } from '../ui/src/lib/udtBridge.js';

const opt = { skip: hasFixtures ? false : 'fixture data/sheets/csv tidak ada' };
const host = loadPageHost();

test('udtBridge gagal tertutup bila modul Langkah 4 tidak ada di halaman', () => {
  const s = bridgeStatus({});
  assert.equal(s.ok, false); assert.deepEqual(s.missing, ['calcBatchProfile', 'evalSimilarityF2', 'classifyF2Outcome']);
  assert.throws(() => runProfile({}, [5], { 1: [1] }), /Modul Langkah 4 tidak ditemukan/);
  assert.equal(bridgeStatus(host).ok, true);
});

test('IQ-03 udtBridge tidak berisi rumus (hanya memanggil fungsi halaman)', () => {
  const src = readFileSync(join(REPO, 'ui', 'src', 'lib', 'udtBridge.js'), 'utf8');
  const code = src.replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /log10|Math\.(log|pow|sqrt)|\*\*|sumSq|\bmean\b|\bsdev\b/);
  assert.match(code, /host\.calcBatchProfile/); assert.match(code, /host\.evalSimilarityF2/); assert.match(code, /host\.classifyF2Outcome/);
});

test('Fungsi yang dipanggil adalah sumber asli index.html (sha256 = modules.lock)', () => {
  const lock = JSON.parse(readFileSync(join(REPO, 'modules.lock'), 'utf8'));
  const sha = (s) => createHash('sha256').update(s.replace(/\r\n/g, '\n')).digest('hex');
  for (const n of ['calcBatchProfile', 'evalSimilarityF2', 'classifyF2Outcome']) assert.equal(sha(host[n].toString()), lock.functions[n], n);
});

test('runProfile: statistik per titik dari fungsi asli (nilai diketahui), sel kosong bukan 0', () => {
  const p = runProfile(host, [5, 10, 15], { 1: [10, 50, 90], 2: [20, 60, 100], 3: [30, null, 80] });
  assert.equal(p.error, null);
  assert.deepEqual(p.means.map((x) => Math.round(x * 1e6) / 1e6), [20, 55, 90]);   // titik 10: hanya vessel 1 dan 2
  assert.equal(p.stats[0].min, 10); assert.equal(p.stats[0].max, 30);
  assert.ok(Math.abs(p.stats[0].sd - 10) < 1e-9);          // SD sampel {10,20,30}
  assert.ok(Math.abs(p.stats[0].rsd - 50) < 1e-9);
});

test('f2Between: contoh mirip memberi f2 tinggi + penanda >= 85% dan titik masuk; titik waktu beda dipotong ke irisan', () => {
  const ref = runProfile(host, [5, 10, 15, 30], { 1: [20, 40, 60, 90], 2: [22, 42, 62, 92] });
  const tst = runProfile(host, [5, 10, 15, 30], { 1: [21, 41, 59, 88], 2: [23, 43, 61, 90] });
  const r = f2Between(host, ref, tst);
  assert.ok(r.f2 > 80 && r.f2 <= 100); assert.equal(r.n, 4); assert.equal(r.outcome.code, 'similar'); assert.equal(r.timesMismatch, false);
  const t2 = runProfile(host, [5, 10, 20], { 1: [21, 41, 59] });
  const r2 = f2Between(host, ref, t2); assert.equal(r2.timesMismatch, true); assert.deepEqual(r2.usedTimes, [5, 10]);
});

let t;
before(async () => { t = await createTestDb('bridge'); });
after(async () => { await t.drop(); });

test('GET /data: sesi wajib; bentuk data; run terlihat saja; nilai pergi-pulang cocok; f2 dihitung ulang lewat modul asli', opt, async () => {
  const anon = await (await import('./helpers/http.js')).Client; assert.equal((await new anon().get('/api/compiles/1/data')).status, 401);
  const c = await loggedIn('Hanifa', '10.9.9.31');
  const imp = await c.post('/api/imports', readWorkbook(loadWorkbook('Zemyc150', 'Development of Zemyc 150 mg Kapsul.xlsx')));
  assert.equal(imp.status, 201);
  const list = (await c.get('/api/compiles')).json.compiles; const id = list[0].compile_id;
  assert.equal((await c.get('/api/compiles/999999/data')).status, 404);
  const d = (await c.get(`/api/compiles/${id}/data`)).json;
  assert.equal(d.runs.length, 30); assert.equal(d.comparisons.length, 26); assert.equal(d.mediums.length, 4);
  const r0 = d.runs[0];
  assert.ok(Array.isArray(r0.minutes) && r0.minutes.length >= 3); assert.equal(Object.keys(r0.vessels).length, 3);
  assert.ok(Object.values(r0.vessels).every((a) => a.length === r0.minutes.length));
  // nilai persis seperti di basis data (tanpa pembulatan)
  const db = (await t.app.query('SELECT pct::float8 AS p FROM run_value WHERE run_id=$1 AND vessel_no=1 ORDER BY seq', [r0.run_id])).rows.map((x) => x.p);
  assert.deepEqual(r0.vessels[1], db);
  // f2: 26 pembanding; selisih > 1 hanya 3 (1 selisih sheet yang dicatat + 2 beda n cut-off)
  const byId = new Map(d.runs.map((r) => [r.run_id, r]));
  const bad = [];
  for (const cm of d.comparisons) {
    const r = f2Between(host, profileOfRun(host, byId.get(cm.ref_run_id)), profileOfRun(host, byId.get(cm.test_run_id)));
    assert.ok(Number.isFinite(r.f2));
    if (Math.abs(r.f2 - cm.f2) > 1) bad.push({ id: cm.comparison_id, nBridge: r.n, nPrinted: cm.n_points });
  }
  assert.equal(bad.length, 3, JSON.stringify(bad));
  assert.equal(bad.filter((b) => b.nBridge !== b.nPrinted).length, 2);      // delta v0.2 butir 6: n cetak berbeda dari cut-off Langkah 4
  // hapus (run_removal) menyembunyikan run dari /data
  const victim = d.runs[1].run_id;
  const aid = (await t.app.query('SELECT analyst_id FROM analyst LIMIT 1')).rows[0].analyst_id;
  await t.app.query("INSERT INTO run_removal(run_id,seq,kind,analyst_id,reason) VALUES ($1,1,'hapus',$2,'uji')", [victim, aid]);
  const d2 = (await c.get(`/api/compiles/${id}/data`)).json;
  assert.equal(d2.runs.some((r) => r.run_id === victim), false);
});
