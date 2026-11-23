// Cadangan: pg_dump -> verifikasi -> pulihkan ke database lain -> skenario uji dijalankan pada data ASLI dan data PULIHAN dan hasilnya harus sama. [LAPTOP]
// Skenario 3 dan 8 (tampilan, 1366 px, terang/gelap, PNG) dibuktikan di peramban (evidence/f4c/); di sini bagian datanya saja. Skenario 9 = berkas catatan hasil.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createReadStream, mkdtempSync, writeFileSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import pg from 'pg';
import { createTestDb, ADMIN, APP_PW } from './helpers/db.js';
import { loggedIn } from './helpers/http.js';
import { loadWorkbook, hasFixtures, REPO } from './helpers/fixtures.js';
import { readWorkbook } from '../server/import/sheetReader.js';
import { setPool } from '../server/db.js';
import { runBackup } from '../scripts/backup_pg.mjs';

const CONTAINER = process.env.UDT_TEST_DOCKER || 'udt-f4-pg';
const dockerOk = await new Promise((ok) => { const p = spawn('docker', ['exec', CONTAINER, 'pg_dump', '--version'], { stdio: 'ignore' }); p.on('error', () => ok(false)); p.on('close', (c) => ok(c === 0)); });
const opt = { skip: !hasFixtures ? 'fixture tidak ada' : !dockerOk ? `docker/${CONTAINER} tidak tersedia` : false };

const SHEETS = [['Zemyc150', 'Development of Zemyc 150 mg Kapsul.xlsx'], ['Gionix16', 'Development of Gionix 16 mg Tab.xlsx'], ['Vastrol20', 'Development of Vastrol 20 mg Tablet.xlsx', ['pH_1_2', 'pH_4_5', 'pH_6_8']], ['Empagliflozin25', 'Development of Empagliflozin 25 mg Tablet.xlsx', ['UDT_Release', 'UDT_pH_1_2', 'UDT_pH_4_5', 'UDT_pH_6_8']]];
let db, c; const ADMIN_URL = new URL(ADMIN);
const README = { Y5G103B: [7533, 3, 15], F0048E26A: [268, 5, 57], F0048F26A: [353, 5, 54], F0020G26A: [2912, 3, 25], F0062G26A: [1459, 3, 33], F0063G26A: [4517, 3, 21], F0046H26A: [6200, 3, 17] };

before(async () => { if (opt.skip) return; db = await createTestDb('bak'); c = await loggedIn('Penguji Cadangan'); for (const s of SHEETS) { const r = await c.post('/api/imports', readWorkbook(loadWorkbook(...s))); assert.equal(r.status, 201, JSON.stringify(r.json)); } });
after(async () => { if (db) await db.drop(); });

// Skenario hanya membaca lewat pool yang diberikan (data asli atau pulihan).
async function scenarios(client, pool) {
  const Q = async (sql, p) => (await pool.query(sql, p)).rows;
  const out = {};
  const cmp = (compile, med, test, ref) => Q(`SELECT c.total_sq::float8 AS total, c.n_points AS n, c.f2::float8 AS f2 FROM comparison c JOIN run t ON t.run_id=c.test_run_id JOIN batch bt ON bt.batch_id=t.batch_id JOIN run r ON r.run_id=c.ref_run_id JOIN batch br ON br.batch_id=r.batch_id JOIN compile k ON k.compile_id=t.compile_id JOIN medium m ON m.medium_id=t.medium_id WHERE k.product_name=$1 AND m.code=$2 AND bt.batch_no=$3 AND ($4::text IS NULL OR br.batch_no=$4) ORDER BY c.comparison_id`, [compile, med, test, ref ?? null]);
  const z = await Q("SELECT count(*)::int AS total FROM run r JOIN medium m ON m.medium_id=r.medium_id JOIN compile k ON k.compile_id=r.compile_id WHERE k.product_name='Zemyc' AND m.code='Release'");
  out.s1 = z[0].total === 8;
  out.s2 = (await Promise.all(Object.entries(README).map(async ([b, [t, n, f]]) => { const r = (await cmp('Zemyc', 'Release', b))[0]; return !!r && r.n === n && Math.round(r.total) === t && Math.round(r.f2) === f; }))).every(Boolean);
  const vid = (await Q("SELECT compile_id FROM compile WHERE product_name='Vastrol'"))[0].compile_id;
  const data = (await client.get(`/api/compiles/${vid}/data`)).json;
  out.s3 = data.runs.filter((r) => r.is_valid).length >= 3;   // overlay 3 garis: >= 3 run valid tersedia (gambar di peramban)
  const g = await Q("SELECT count(*) FILTER (WHERE NOT r.is_valid)::int AS bad FROM run r JOIN compile k ON k.compile_id=r.compile_id WHERE k.product_name='Gionix'");
  const g80 = (await cmp('Gionix', 'Release', 'F0080G26A', null))[0];
  out.s4 = g[0].bad > 0 && Math.abs(g80.total - 838.91) < 0.05 && g80.n === 5 && Math.abs(g80.f2 - 44.32) < 0.05;
  const v45 = await cmp('Vastrol', '4,5', 'F0066A26A', null);
  const crest = await cmp('Vastrol', '4,5', '6005160', 'B41968'), crest12 = await cmp('Vastrol', '1,2', '6005160', 'B41968');
  out.s5 = v45.length >= 2 && [36.89, 58.15].every((x) => v45.some((r) => Math.abs(r.f2 - x) < 0.06)) && Math.abs(crest[0].f2 - 46.73) < 0.06 && Math.abs(crest12[0].f2 - 44.08) < 0.06;
  const held = await Q("SELECT s.hold_reason FROM run_source_block s JOIN run r ON r.run_id=s.run_id JOIN batch b ON b.batch_id=r.batch_id WHERE s.import_outcome='ditahan' AND b.batch_no='F0058D26A'");
  out.s7 = held.length >= 1 && held.every((h) => /W-19/.test(h.hold_reason));
  const csv = await client.get(`/api/compiles/${vid}/export?format=csv`); out.s8 = csv.status === 200;   // CSV lengkap (PNG dan 1366 px: peramban)
  out.counts = Object.fromEntries(await Promise.all(['compile', 'medium', 'batch', 'run', 'run_timepoint', 'run_value', 'comparison', 'comparison_point', 'audit_event', 'run_source_block', 'import_note'].map(async (t) => [t, (await Q(`SELECT count(*)::int AS n FROM ${t}`))[0].n])));
  return out;
}

test('Cadangan harian: dump, verifikasi daftar isi, sha256, pemangkasan retensi, gagal bila sumber salah', opt, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'udtbak-'));
  try {
    const old = join(dir, 'udt-20200101T000000Z.dump'); writeFileSync(old, 'x'); writeFileSync(old + '.sha256', 'x');
    const r = await runBackup({ out: dir, docker: CONTAINER, user: ADMIN_URL.username, db: db.name, keep: 14 });
    assert.equal(r.ok, true); assert.ok(r.bytes > 10000); assert.match(r.sha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(r.removed.sort(), ['udt-20200101T000000Z.dump', 'udt-20200101T000000Z.dump.sha256']);
    assert.ok(readFileSync(r.file + '.sha256', 'utf8').startsWith(r.sha256));
    assert.ok(!readdirSync(dir).some((f) => f.endsWith('.part')), 'tidak ada sisa berkas sementara');
    await assert.rejects(runBackup({ out: dir, docker: CONTAINER, user: ADMIN_URL.username, db: 'tidak_ada_db' }), /pg_dump|keluar/);
    assert.equal(readdirSync(dir).filter((f) => f.endsWith('.dump')).length, 1, 'gagal tidak meninggalkan berkas');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Dump-restore + skenario uji: hasil pada data PULIHAN sama dengan data ASLI, jumlah baris tiap tabel sama, peran aplikasi tetap terbatas', opt, async () => {
  const cid = Number((await db.owner.query("SELECT compile_id FROM compile WHERE product_name='Vastrol'")).rows[0].compile_id);
  const mk = (key, nv, vals) => ({ key, medium_code: '6,8', brand_name: 'Vastrol 20 mg Tablet', batch_no: key, role: 'uji', variant: '', test_date: '2026-11-01', timepoints: [5, 10, 15], values: Array.from({ length: nv }, (_, i) => ({ no: i + 1, values: vals.map((v) => v + i * 0.1) })) });
  const p = { compile_id: cid, mediums: [{ code: '6,8', full_name: 'Buffer fosfat' }], runs: [mk('S6A', 3, [40, 60, 80]), mk('S6B', 12, [45, 65, 85])], comparisons: [] };
  const a = await c.post('/api/ingest/commit', { push_id: crypto.randomUUID(), decisions: {}, package: p }); assert.equal(a.status, 201, JSON.stringify(a.json)); assert.equal(a.json.counts.baru, 2);
  const b = await c.post('/api/ingest/commit', { push_id: crypto.randomUUID(), decisions: {}, package: p }); assert.equal(b.json.counts.sama_persis, 2, 'duplikat tidak digandakan');
  const wr = await c.post('/api/ingest/commit', { push_id: crypto.randomUUID(), decisions: {}, package: { ...p, runs: [mk('S6C', 13, [50, 70, 90])] } });
  assert.ok(wr.json.warnings.some((x) => x.code === 'W-vessel>12'), '13 vessel = peringatan, bukan penolakan');
  const before = await scenarios(c, db.app);
  for (const k of ['s1', 's2', 's3', 's4', 's5', 's7', 's8']) assert.equal(before[k], true, `skenario ${k} pada data asli`);

  const dir = mkdtempSync(join(tmpdir(), 'udtbak-')); const dst = `udt_restored_${Date.now().toString(36)}`;
  const admin = new pg.Client({ connectionString: ADMIN }); await admin.connect();
  let pool2;
  try {
    const r = await runBackup({ out: dir, docker: CONTAINER, user: ADMIN_URL.username, db: db.name });
    await admin.query(`CREATE DATABASE ${dst}`);
    await new Promise((ok, fail) => {
      const pr = spawn('docker', ['exec', '-i', CONTAINER, 'pg_restore', '-U', ADMIN_URL.username, '-d', dst, '--no-owner'], { stdio: ['pipe', 'ignore', 'pipe'] });
      let e = ''; pr.stderr.on('data', (d) => { e += d; }); pipeline(createReadStream(r.file), pr.stdin).catch(() => {});
      pr.on('close', (code) => (code === 0 ? ok() : fail(new Error('pg_restore ' + code + ' ' + e.slice(-300)))));
    });
    pool2 = new pg.Pool({ connectionString: `${ADMIN_URL.protocol}//udt_app:${APP_PW}@${ADMIN_URL.host}/${dst}`, max: 3 });
    setPool(pool2);
    const after = await scenarios(c, pool2);
    assert.deepEqual(after, before, 'skenario dan jumlah baris data pulihan = data asli');
    await assert.rejects(pool2.query('DELETE FROM audit_event'), /permission denied/);
    const fp = async (pool) => (await pool.query("SELECT md5(string_agg(run_id::text||content_hash, ',' ORDER BY run_id)) AS h FROM run")).rows[0].h;
    const ownerRestored = new pg.Pool({ connectionString: `${ADMIN_URL.protocol}//${ADMIN_URL.username}:${decodeURIComponent(ADMIN_URL.password)}@${ADMIN_URL.host}/${dst}`, max: 1 });
    assert.equal(await fp(ownerRestored), await fp(db.owner), 'sidik jari seluruh run identik');
    await ownerRestored.end();
    const log = { tanggal: new Date().toISOString(), penguji: 'BRAHMA (otomatis, laptop)', lingkungan: '[LAPTOP] PostgreSQL 17 Docker', data: 'asli dan pulihan sama', hasil: { s1: 'lulus', s2: 'lulus', s3: 'data siap (gambar di peramban)', s4: 'lulus', s5: 'lulus', s6: 'lulus (3 dan 12 vessel disimpan, duplikat tidak digandakan, 13 vessel = peringatan)', s7: 'lulus', s8: 'CSV lulus (PNG, 1366 px, gelap: peramban)', s9: 'berkas ini' }, baris: after.counts };
    const evid = join(REPO, '..', 'evidence', 'f4c'); mkdirSync(evid, { recursive: true }); writeFileSync(join(evid, 'sembilan_skenario_dump_restore.json'), JSON.stringify(log, null, 2));
  } finally { setPool(db.app); if (pool2) await pool2.end(); await admin.query(`DROP DATABASE IF EXISTS ${dst} WITH (FORCE)`); await admin.end(); rmSync(dir, { recursive: true, force: true }); }
});
