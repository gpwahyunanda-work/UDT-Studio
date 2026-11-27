// F23 butir 7: scripts/purge_compile.mjs dan scripts/rename_analyst.mjs pada database uji lokal (peran PEMILIK; udt_app tidak punya hak DELETE).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as step4 from '../server/step4.js';
import { runProfile, f2Between } from '../server/lib/udtBridge.js';
import { createTestDb } from './helpers/db.js';
import { loggedIn } from './helpers/http.js';
import { handle } from '../server/app.js';
import { REPO } from './helpers/fixtures.js';
import { purgeCompile, PurgeError, TABLES } from '../scripts/purge_compile.mjs';
import { renameAnalyst, RenameError } from '../scripts/rename_analyst.mjs';

let db, W, A, B;
before(async () => { db = await createTestDb('f23s'); W = await loggedIn('Analis Skrip', '10.23.1.1'); });
after(async () => { if (db) await db.drop(); });

const vs = (m) => [1, 2, 3].map((no, i) => ({ no, values: m.map((x) => x + i * 0.1) }));
const run = (key, role, batch, m) => ({ key, medium_code: 'Release', brand_name: role === 'reference' ? 'Ref' : 'Uji', batch_no: batch, role, variant: '', test_date: '2026-11-20', timepoints: [5, 10, 15], values: vs(m) });
const owner = (sql, p) => db.owner.query(sql, p).then((r) => r.rows);
const count = async (t, where = 'true', p = []) => Number((await owner(`SELECT count(*) n FROM ${t} WHERE ${where}`, p))[0].n);
const snapshot = async () => Object.fromEntries(await Promise.all(TABLES.map(async ([t]) => [t, await count(t)])));
const tmp = () => mkdtempSync(join(tmpdir(), 'f23-purge-'));
const OPT = (o) => ({ url: db.ownerUrl, reason: 'Hapus data uji Studio (uji F23)', ...o });

test('S0 siapkan: compile A (push Studio, data uji), compile B (impor sheet = data nyata)', async () => {
  const c = await W.post('/api/compiles', { product_name: 'Test Hapus', strength: '25 mg', dosage_form: 'Tablet' }); A = c.json.compile_id;
  const runs = [run('ref', 'reference', 'R1', [30, 50, 70]), run('u1', 'uji', 'U1', [28, 48, 68])];
  const prof = (r) => runProfile(step4, r.timepoints, Object.fromEntries(r.values.map((v) => [v.no, v.values])));
  const f2 = f2Between(step4, prof(runs[0]), prof(runs[1])).f2;
  const r = await W.post('/api/ingest/commit', { push_id: randomUUID(), package: { compile_id: A, mediums: [{ code: 'Release', full_name: 'Release' }], runs, comparisons: [{ testKey: 'u1', refKey: 'ref', n_points: 3, total_sq: 1, f2, conclusion_code: 'similar', points: [] }] } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  // satu run dihapus lembut (run_removal) supaya tabel itu ikut tercakup
  const rid = (await owner('SELECT run_id FROM run WHERE compile_id=$1 ORDER BY run_id LIMIT 1', [A]))[0].run_id;
  const del = await W.post(`/api/runs/${rid}/delete`, { confirm: true, reason: 'uji penghapusan lembut' }); assert.equal(del.status, 200, JSON.stringify(del.json));
  const buf = readFileSync(join(REPO, 'tests', 'fixtures', 'Development of Minia 10 mg Tablet.xlsx'));
  const im = await handle(new Request('https://udt.test/api/imports/xlsx', { method: 'POST', headers: { cookie: W.cookie, origin: 'https://udt.test', 'x-file-name': encodeURIComponent('Development of Minia 10 mg Tablet.xlsx'), 'x-analyst-name': encodeURIComponent('Analis Skrip'), 'content-type': 'application/octet-stream' }, body: buf }));
  assert.equal(im.status, 201, await im.text());
  B = (await owner("SELECT compile_id FROM compile WHERE product_name='Minia'"))[0].compile_id;
  assert.ok(await count('run', 'compile_id=$1', [B]) > 0); assert.ok(await count('import_run') >= 1);
});

test('S1 DRY-RUN bawaan: daftar baris per tabel, tidak menulis apa pun', async () => {
  const before = await snapshot(), audits = await count('audit_event');
  const r = await purgeCompile(OPT({ compileId: A }));
  assert.equal(r.mode, 'DRY-RUN'); assert.equal(r.baris.compile, 1); assert.equal(r.baris.studio_push, 1); assert.equal(r.baris.run, 2); assert.ok(r.baris.run_value >= 6); assert.equal(r.baris.comparison, 1); assert.ok(r.baris.run_removal >= 1);
  assert.deepEqual(Object.keys(r.baris), TABLES.map(([t]) => t));   // urutan hapus = anak dulu
  assert.deepEqual(await snapshot(), before); assert.equal(await count('audit_event'), audits);
});

test('S2 pengaman: --reason wajib, --apply wajib --backup-dir di luar repo, compile tak ada, run hasil impor ditolak tanpa --force', async () => {
  const before = await snapshot();
  await assert.rejects(purgeCompile(OPT({ compileId: A, reason: '' })), /--reason wajib/);
  await assert.rejects(purgeCompile(OPT({ compileId: A, apply: true })), /--backup-dir wajib/);
  await assert.rejects(purgeCompile(OPT({ compileId: A, apply: true, backupDir: join(REPO, 'cadangan') })), /di dalam repo/);
  await assert.rejects(purgeCompile(OPT({ compileId: 999999 })), /tidak ada/);
  await assert.rejects(purgeCompile(OPT({ compileId: 'abc' })), /--compile-id wajib/);
  await assert.rejects(purgeCompile(OPT({ compileId: B, apply: true, backupDir: tmp() })), (e) => e instanceof PurgeError && /hasil impor sheet/.test(e.message) && /--force/.test(e.message));
  await assert.rejects(purgeCompile(OPT({ compileId: B })), /hasil impor sheet/);   // dry-run pun menolak
  assert.deepEqual(await snapshot(), before);
});

test('S3 atomik: kegagalan di tengah (audit ditolak) membatalkan SEMUA penghapusan', async () => {
  await owner(`CREATE FUNCTION f23_blok() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='compile_purge' THEN RAISE EXCEPTION 'blok uji'; END IF; RETURN NEW; END $$`);
  await owner('CREATE TRIGGER f23_blok BEFORE INSERT ON audit_event FOR EACH ROW EXECUTE FUNCTION f23_blok()');
  const before = await snapshot();
  await assert.rejects(purgeCompile(OPT({ compileId: A, apply: true, backupDir: tmp() })), /blok uji/);
  assert.deepEqual(await snapshot(), before, 'tidak ada baris yang hilang');
  await owner('DROP TRIGGER f23_blok ON audit_event'); await owner('DROP FUNCTION f23_blok()');
});

test('S4 --apply: cadangan JSON dulu (sha256 cocok), hapus berurutan dalam satu transaksi, audit compile_purge dengan alasan; compile lain utuh', async () => {
  const dir = tmp(), planned = (await purgeCompile(OPT({ compileId: A }))).baris, beforeB = {
    run: await count('run', 'compile_id=$1', [B]), batch: await count('batch', 'compile_id=$1', [B]), medium: await count('medium', 'compile_id=$1', [B]) };
  const auditsBefore = await count('audit_event');
  const r = await purgeCompile(OPT({ compileId: A, apply: true, backupDir: dir, reason: 'Hapus Test Empagliflozin (uji F23)' }));
  assert.equal(r.mode, 'APPLY'); assert.deepEqual(r.dihapus, planned);
  // cadangan
  const files = readdirSync(dir); assert.ok(files.some((f) => f.endsWith('.json')) && files.some((f) => f.endsWith('.sha256')));
  const body = readFileSync(r.cadangan.file); assert.equal(createHash('sha256').update(body).digest('hex'), r.cadangan.sha256);
  assert.match(readFileSync(r.cadangan.file + '.sha256', 'utf8'), new RegExp(r.cadangan.sha256));
  const bk = JSON.parse(body); assert.equal(bk.compile_id, A); assert.equal(bk.tabel.compile.length, 1); assert.equal(bk.tabel.run.length, planned.run); assert.equal(bk.tabel.run_value.length, planned.run_value); assert.equal(bk.alasan, 'Hapus Test Empagliflozin (uji F23)');
  // hasil
  assert.equal(await count('compile', 'compile_id=$1', [A]), 0);
  for (const t of ['run', 'batch', 'medium', 'studio_push']) assert.equal(await count(t, 'compile_id=$1', [A]), 0, t);
  assert.equal(await count('run_value', 'run_id = ANY($1::bigint[])', [bk.tabel.run.map((x) => x.run_id)]), 0);
  assert.equal(await count('comparison', 'comparison_id = ANY($1::bigint[])', [bk.tabel.comparison.map((x) => x.comparison_id)]), 0);
  assert.deepEqual({ run: await count('run', 'compile_id=$1', [B]), batch: await count('batch', 'compile_id=$1', [B]), medium: await count('medium', 'compile_id=$1', [B]) }, beforeB, 'compile lain utuh');
  // audit
  const ev = (await owner("SELECT * FROM audit_event WHERE action='compile_purge'"))[0];
  assert.equal(ev.entity_type, 'compile'); assert.equal(Number(ev.entity_id), A); assert.equal(ev.reason, 'Hapus Test Empagliflozin (uji F23)');
  assert.equal(await count('audit_event'), auditsBefore + 1, 'riwayat audit lama tidak dihapus');
  const ch = Object.fromEntries((await owner('SELECT * FROM audit_change WHERE event_id=$1', [ev.event_id])).map((x) => [x.field_name, x]));
  assert.equal(ch.cadangan_sha256.new_value, r.cadangan.sha256); assert.equal(ch.baris_run.old_value, String(planned.run));
  // aplikasi tetap sehat (peran udt_app, data produk lain terbaca)
  assert.equal((await W.get('/api/products')).status, 200);
  assert.equal((await W.get(`/api/products/${B}/dashboard`)).status, 200);
  await assert.rejects(purgeCompile(OPT({ compileId: A })), /tidak ada/, 'idempoten: kedua kali ditolak jelas');
});

test('S5 --force mengizinkan compile berisi run impor sheet (urutan FK tetap benar, import_run ikut bila tak dipakai compile lain)', async () => {
  const dir = tmp(), planned = (await purgeCompile(OPT({ compileId: B, force: true }))).baris;
  assert.ok(planned.import_run >= 1 && planned.run_source_block >= 1);
  const r = await purgeCompile(OPT({ compileId: B, force: true, apply: true, backupDir: dir }));
  assert.deepEqual(r.dihapus, planned); assert.equal(await count('compile'), 0);
  assert.equal(await count('import_run'), 0); assert.equal(await count('run'), 0);
});

test('S6 CLI: dry-run bawaan lewat proses terpisah; tanpa --url galat jelas tanpa membocorkan URL', async () => {
  const sh = (args, env = {}) => spawnSync(process.execPath, [join(REPO, 'scripts', 'purge_compile.mjs'), ...args], { encoding: 'utf8', env: { ...process.env, DATABASE_URL_UNPOOLED: '', ...env } });
  const a = sh(['--compile-id', '1', '--reason', 'uji cli']); assert.equal(a.status, 1); assert.match(a.stderr, /--url atau env DATABASE_URL_UNPOOLED/);
  const b = sh(['--compile-id', '1', '--reason', 'uji cli', '--url', 'postgres://x:rahasia@127.0.0.1:1/none']); assert.equal(b.status, 1); assert.doesNotMatch(b.stderr + b.stdout, /rahasia/);
  const c = sh(['--bukan-opsi']); assert.equal(c.status, 1); assert.match(c.stderr, /argumen tak dikenal/);
});

// ---------------------------------------------------------------- rename_analyst
test('R1 rename: dry-run bawaan tidak mengubah; --apply mengubah nama + audit analyst_rename (alasan, lama, baru); jejak lama tetap menunjuk analis yang sama', async () => {
  const aid = (await owner("SELECT analyst_id FROM analyst WHERE name='Analis Skrip'"))[0].analyst_id;
  const NEW = 'INDRA (atas jawaban tim, Agent Log A-24)';
  const d = await renameAnalyst({ url: db.ownerUrl, id: aid, name: NEW, reason: 'Agent Log A-24' });
  assert.equal(d.mode, 'DRY-RUN'); assert.equal(d.nama_lama, 'Analis Skrip'); assert.equal(d.nama_baru, NEW);
  assert.equal((await owner('SELECT name FROM analyst WHERE analyst_id=$1', [aid]))[0].name, 'Analis Skrip');
  const evBefore = await count('audit_event', 'analyst_id=$1', [aid]);
  const r = await renameAnalyst({ url: db.ownerUrl, id: aid, name: NEW, reason: 'Agent Log A-24', apply: true });
  assert.equal(r.mode, 'APPLY'); assert.equal((await owner('SELECT name FROM analyst WHERE analyst_id=$1', [aid]))[0].name, NEW);
  const ev = (await owner("SELECT * FROM audit_event WHERE action='analyst_rename'"))[0];
  assert.equal(ev.entity_type, 'analyst'); assert.equal(Number(ev.entity_id), Number(aid)); assert.equal(ev.reason, 'Agent Log A-24');
  const ch = (await owner('SELECT * FROM audit_change WHERE event_id=$1', [ev.event_id]))[0]; assert.deepEqual([ch.field_name, ch.old_value, ch.new_value], ['name', 'Analis Skrip', NEW]);
  assert.ok(await count('audit_event', 'analyst_id=$1', [aid]) >= evBefore, 'jejak lama tetap');
  assert.ok(Number(ev.analyst_id) !== Number(aid), 'pelaku audit = analis sistem, bukan yang diganti');
});

test('R2 rename: penolakan (alasan, nama kosong/tak terlihat/terlalu pendek, nama dipakai analis lain, analis sistem, tidak ada, nama sama)', async () => {
  const other = (await owner("INSERT INTO analyst(name) VALUES ('Analis Lain') RETURNING analyst_id"))[0].analyst_id;
  const sys = (await owner('SELECT analyst_id FROM app_user WHERE is_system'))[0].analyst_id;
  const base = { url: db.ownerUrl, id: other, reason: 'uji penolakan' };
  await assert.rejects(renameAnalyst({ ...base, reason: '' }), /--reason wajib/);
  await assert.rejects(renameAnalyst({ ...base, name: '' }), /--name tidak valid/);
  await assert.rejects(renameAnalyst({ ...base, name: 'A' }), /--name tidak valid/);
  await assert.rejects(renameAnalyst({ ...base, name: 'Nama\u3164Aneh' }), /--name tidak valid/);
  await assert.rejects(renameAnalyst({ ...base, name: 'Nama\u0007Kendali' }), RenameError);
  await assert.rejects(renameAnalyst({ ...base, name: 'INDRA (atas jawaban tim, Agent Log A-24)' }), /sudah dipakai analis/);
  await assert.rejects(renameAnalyst({ ...base, id: sys, name: 'Nama Baru Sistem' }), /analis sistem/);
  await assert.rejects(renameAnalyst({ ...base, id: 999999, name: 'Nama Baru' }), /tidak ada/);
  await assert.rejects(renameAnalyst({ ...base, name: 'Analis Lain' }), /sama dengan nama sekarang/);
  assert.equal((await owner('SELECT name FROM analyst WHERE analyst_id=$1', [other]))[0].name, 'Analis Lain');
});
