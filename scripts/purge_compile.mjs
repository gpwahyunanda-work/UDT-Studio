#!/usr/bin/env node
// F23: hapus SATU compile beserta seluruh turunannya, dengan pengaman. Dijalankan INDRA di produksi.
//   node scripts/purge_compile.mjs --compile-id 6 --reason "..."                                   (DRY-RUN bawaan: hanya daftar baris per tabel; tidak menulis apa pun)
//   node scripts/purge_compile.mjs --compile-id 6 --reason "..." --apply --backup-dir <folder>      (cadangan JSON dulu, lalu hapus + audit dalam SATU transaksi)
//   --force   izinkan bila compile punya run hasil impor sheet (source='sheet' = data nyata, bukan data uji Studio)
//   --url     URL PostgreSQL PEMILIK (udt_app tidak punya hak DELETE); bawaan env DATABASE_URL_UNPOOLED. URL tidak pernah dicetak.
// Audit: audit_event 'compile_purge' (entity compile, alasan = --reason, jumlah baris per tabel + sha256 cadangan). Riwayat audit LAMA tidak dihapus.
import { mkdirSync, writeFileSync, readFileSync, writeSync, fsyncSync, openSync, closeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative, isAbsolute, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const REPO = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
export class PurgeError extends Error {}

// Urutan HAPUS = anak dulu (sesuai FK). Tiap entri: [tabel, SQL pemilih baris dengan $1=compile_id, $2=run_ids, $3=medium_ids, $4=comparison_ids, $5=import_ids].
export const TABLES = [
  ['comparison_point', 'comparison_id = ANY($4::bigint[])'],
  ['import_check', 'comparison_id = ANY($4::bigint[]) OR import_id = ANY($5::bigint[])'],
  ['run_source_block', 'run_id = ANY($2::bigint[])'],
  ['comparison', 'comparison_id = ANY($4::bigint[])'],
  ['run_removal', 'run_id = ANY($2::bigint[]) OR replaced_by_run_id = ANY($2::bigint[])'],
  ['run_value', 'run_id = ANY($2::bigint[])'],
  ['run_timepoint', 'run_id = ANY($2::bigint[])'],
  ['run', 'compile_id = $1'],
  ['import_note', 'import_id = ANY($5::bigint[])'],
  ['import_run', 'import_id = ANY($5::bigint[])'],
  ['studio_push', 'compile_id = $1'],
  ['batch', 'compile_id = $1'],
  ['medium', 'compile_id = $1'],
  ['compile_alias', 'compile_id = $1'],
  ['compile', 'compile_id = $1'],
];

const ids = (rows, k) => rows.map((r) => r[k]);

// Kumpulkan baris yang akan dihapus (klien sudah dalam transaksi). Mengembalikan { compile, sets, rows, nonTest }.
export async function collect(c, compileId, lock = false) {
  const comp = (await c.query(`SELECT * FROM compile WHERE compile_id=$1${lock ? ' FOR UPDATE' : ''}`, [compileId])).rows[0];
  if (!comp) throw new PurgeError(`compile ${compileId} tidak ada`);
  const runs = (await c.query('SELECT run_id, source, import_id FROM run WHERE compile_id=$1', [compileId])).rows;
  const mediums = (await c.query('SELECT medium_id FROM medium WHERE compile_id=$1', [compileId])).rows;
  const runIds = ids(runs, 'run_id'), mediumIds = ids(mediums, 'medium_id');
  const comparisonIds = ids((await c.query('SELECT comparison_id FROM comparison WHERE medium_id = ANY($1::bigint[])', [mediumIds])).rows, 'comparison_id');
  // impor hanya ikut dihapus bila TIDAK dipakai run compile lain
  const importIds = ids((await c.query(`SELECT DISTINCT r.import_id FROM run r WHERE r.compile_id=$1 AND r.import_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM run r2 WHERE r2.import_id=r.import_id AND r2.compile_id<>$1)`, [compileId])).rows, 'import_id');
  const params = [compileId, runIds, mediumIds, comparisonIds, importIds];
  const rows = {};
  for (const [t, where] of TABLES) rows[t] = (await c.query(`SELECT * FROM ${t} WHERE ${whereOf(where)} ORDER BY 1`, params)).rows;
  return { compile: comp, params, rows, nonTest: runs.filter((r) => r.source !== 'studio') };
}

// Semua $1..$5 harus dirujuk di setiap pernyataan (pg menolak parameter tak terpakai).
const USE_ALL = '$1::bigint IS NOT NULL AND $2::bigint[] IS NOT NULL AND $3::bigint[] IS NOT NULL AND $4::bigint[] IS NOT NULL AND $5::bigint[] IS NOT NULL';
const whereOf = (w) => `(${w}) AND ${USE_ALL}`;
export const counts = (rows) => Object.fromEntries(TABLES.map(([t]) => [t, rows[t].length]));

export function checkBackupDir(dir) {
  if (!dir) throw new PurgeError('--backup-dir wajib bersama --apply (cadangan JSON dibuat sebelum menghapus)');
  const rel = relative(REPO, resolve(dir));
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) throw new PurgeError('--backup-dir tidak boleh di dalam repo (cadangan berisi data)');
  return resolve(dir);
}

export function writeBackup(dir, compileId, payload) {
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const file = join(dir, `purge_compile_${compileId}_${stamp}.json`);
  const body = JSON.stringify(payload);
  const fd = openSync(file, 'w', 0o600); try { writeSync(fd, body); fsyncSync(fd); } finally { closeSync(fd); }   // paksa ke disk sebelum hapus
  const sha = createHash('sha256').update(readFileSync(file)).digest('hex');   // verifikasi: baca ulang dari disk
  if (sha !== createHash('sha256').update(body).digest('hex')) throw new PurgeError('verifikasi cadangan gagal (sha256 berbeda)');
  writeFileSync(file + '.sha256', `${sha}  ${file.split(/[\\/]/).pop()}\n`);
  return { file, sha256: sha, bytes: Buffer.byteLength(body) };
}

export async function systemAnalyst(c) {
  const r = await c.query('SELECT analyst_id FROM app_user WHERE is_system LIMIT 1');
  if (r.rows[0]) return Number(r.rows[0].analyst_id);
  const a = await c.query("INSERT INTO analyst(name) VALUES ('Skrip pemeliharaan') ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING analyst_id");
  return Number(a.rows[0].analyst_id);
}

// opts: { url, compileId, reason, apply, backupDir, force }. Mengembalikan ringkasan; melempar PurgeError bila ditolak.
export async function purgeCompile(opts) {
  const compileId = Number(opts.compileId);
  if (!Number.isSafeInteger(compileId) || compileId < 1) throw new PurgeError('--compile-id wajib (bilangan bulat positif)');
  const reason = typeof opts.reason === 'string' ? opts.reason.replace(/\s+/g, ' ').trim() : '';
  if ([...reason].length < 5) throw new PurgeError('--reason wajib (minimal 5 karakter): alasan dicatat di audit');
  if (opts.apply) checkBackupDir(opts.backupDir);
  const c = new pg.Client({ connectionString: opts.url }); await c.connect();
  try {
    await c.query(opts.apply ? 'BEGIN' : 'BEGIN READ ONLY');
    const col = await collect(c, compileId, !!opts.apply);
    const out = { compile_id: compileId, produk: [col.compile.product_name, col.compile.strength, col.compile.dosage_form].filter(Boolean).join(' '), mode: opts.apply ? 'APPLY' : 'DRY-RUN', baris: counts(col.rows), run_bukan_uji: col.nonTest.length };
    if (col.nonTest.length && !opts.force) throw new PurgeError(`ditolak: compile ${compileId} punya ${col.nonTest.length} run hasil impor sheet (bukan data uji Studio). Pakai --force bila memang yang dimaksud.`);
    if (!opts.apply) { await c.query('ROLLBACK'); return out; }
    const backup = writeBackup(checkBackupDir(opts.backupDir), compileId, { dibuat: new Date().toISOString(), compile_id: compileId, alasan: reason, tabel: col.rows });
    const deleted = {};
    for (const [t] of TABLES) {
      const r = await c.query(`DELETE FROM ${t} WHERE ${whereOf(TABLES.find(([n]) => n === t)[1])}`, col.params); deleted[t] = r.rowCount;   // pemilih yang sama dengan SELECT
    }
    for (const [t] of TABLES) if (deleted[t] !== col.rows[t].length) throw new PurgeError(`jumlah hapus ${t} (${deleted[t]}) berbeda dari rencana (${col.rows[t].length}); transaksi dibatalkan`);
    const ev = await c.query("INSERT INTO audit_event(analyst_id,action,entity_type,entity_id,reason) VALUES ($1,'compile_purge','compile',$2,$3) RETURNING event_id", [await systemAnalyst(c), compileId, reason]);
    const changes = [['produk', out.produk, null], ['cadangan_sha256', null, backup.sha256], ...TABLES.map(([t]) => [`baris_${t}`, String(deleted[t]), '0'])];
    for (const [f, o, n] of changes) await c.query('INSERT INTO audit_change(event_id,field_name,old_value,new_value) VALUES ($1,$2,$3,$4)', [ev.rows[0].event_id, f, o, n]);
    await c.query('COMMIT');
    return { ...out, dihapus: deleted, audit_event_id: Number(ev.rows[0].event_id), cadangan: backup };
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { await c.end(); }
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply' || a === '--force') o[a.slice(2)] = true;
    else if (['--compile-id', '--reason', '--backup-dir', '--url'].includes(a)) o[a.slice(2).replace(/-(\w)/g, (_, x) => x.toUpperCase())] = argv[++i];
    else throw new PurgeError(`argumen tak dikenal: ${a}`);
  }
  return o;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const o = parseArgs(process.argv.slice(2));
    o.url ||= process.env.DATABASE_URL_UNPOOLED;
    if (!o.url) throw new PurgeError('--url atau env DATABASE_URL_UNPOOLED (URL pemilik) wajib');
    const r = await purgeCompile(o);
    console.log(JSON.stringify(r, null, 1));
    if (r.mode === 'DRY-RUN') console.log('DRY-RUN: tidak ada yang diubah. Tambahkan --apply --backup-dir <folder> untuk menghapus.');
  } catch (e) { console.error('GALAT: ' + (e instanceof PurgeError ? e.message : `${e.message}`.replace(/postgres(ql)?:\/\/\S+/g, '[url]'))); process.exit(1); }
}
