#!/usr/bin/env node
// F10: pengelolaan akun dari terminal. Memakai DATABASE_URL (peran udt_app cukup; tidak perlu pemilik).
// Kata sandi sementara acak HANYA ditulis ke berkas --out (di LUAR repo, mode 0600, ditambah per baris "email<TAB>kata-sandi"); tidak pernah ke stdout/log.
//   node scripts/user_admin.mjs list
//   node scripts/user_admin.mjs create  --email a@b.id --name "Nama Tampilan" --role penulis --out <berkas>
//   node scripts/user_admin.mjs reset   --email a@b.id --out <berkas>        (kata sandi sementara baru; semua sesi mati; wajib ganti)
//   node scripts/user_admin.mjs role    --email a@b.id --role pembaca|penulis|admin
//   node scripts/user_admin.mjs deactivate|activate --email a@b.id
//   node scripts/user_admin.mjs seed    --file <daftar.json|.csv> --out <berkas>   (daftar dari berkas lokal INDRA, tidak ada di repo)
//   node scripts/user_admin.mjs seed-env --env-file <berkas.env>   (F12: TIGA akun bersama Formdev, Andev (penulis) dan Admin (admin), 9 variabel; kata sandi dibuat Wahyu, dibaca dari berkas env LOKAL di luar repo; tidak pernah dicetak)
import { readFileSync, appendFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { resolve, relative, isAbsolute, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tx, query, getPool } from '../server/db.js';
import { createUser, patchUser, findByEmail, listUsers, systemAnalystId, upsertSharedAccount, ROLE_LIST } from '../server/accounts.js';

const REPO = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
const die = (m) => { console.error('GALAT: ' + m); process.exit(1); };

export function parseArgs(argv) {
  const [cmd, ...rest] = argv, o = {};
  for (let i = 0; i < rest.length; i++) { if (!rest[i].startsWith('--')) die('argumen tak dikenal: ' + rest[i]); o[rest[i].slice(2)] = rest[++i]; }
  return { cmd, o };
}
export function checkOut(path) {   // berkas kata sandi harus di luar repo
  if (!path) die('--out <berkas> wajib (kata sandi sementara tidak dicetak ke layar)');
  const full = resolve(path), rel = relative(REPO, full);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) die('--out tidak boleh di dalam repo');
  if (!existsSync(full)) { writeFileSync(full, '', { mode: 0o600 }); }
  try { chmodSync(full, 0o600); } catch { /* Windows: ACL warisan */ }
  return full;
}
const emit = (out, email, temp) => appendFileSync(out, `${email}\t${temp}\n`, { mode: 0o600 });

export function readList(file) {
  const raw = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  if (/\.json$/i.test(file)) return JSON.parse(raw);
  return raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => { const [email, display_name, role] = l.split(',').map((x) => x.trim()); return { email, display_name, role }; });
}

// F12: berkas env sederhana KEY=VALUE (baris # = komentar; 'export ' dan tanda kutip pembungkus dibuang; tanpa ekspansi variabel). Tidak menyentuh process.env.
export function parseEnvFile(file) {
  const out = {};
  for (const line of readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line); if (!m || line.trim().startsWith('#')) continue;
    let v = m[2].trim(); if (v.length >= 2 && ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}
export const SHARED = [
  { display_name: 'Formdev', prefix: 'FORMULATION_PHAROS', role: 'penulis' },
  { display_name: 'Andev', prefix: 'ANDEV_PHAROS', role: 'penulis' },
  { display_name: 'Admin', prefix: 'ADMIN_PHAROS', role: 'admin' },
];
// Kembalikan daftar akun dari env; menolak bila ada variabel kosong/hilang (pesan hanya menyebut NAMA variabel, tidak pernah nilainya).
export function sharedFromEnv(env) {
  const missing = [], rows = [];
  for (const s of SHARED) {
    const r = { display_name: s.display_name, role: s.role };
    for (const [k, f] of [['EMAIL', 'email'], ['USERNAME', 'username'], ['PASSWORD', 'password']]) { const name = `${s.prefix}_${k}`; if (!env[name] || !String(env[name]).trim()) missing.push(name); else r[f] = env[name]; }
    rows.push(r);
  }
  if (missing.length) throw new Error('variabel env kosong atau tidak ada: ' + missing.join(', '));
  return rows;
}
export function checkEnvFile(path) {   // berkas kredensial harus di luar repo (tidak boleh ikut commit)
  if (!path) die('--env-file <berkas> wajib');
  const full = resolve(path), rel = relative(REPO, full);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) die('--env-file tidak boleh di dalam repo');
  if (!existsSync(full)) die('--env-file tidak ditemukan');
  return full;
}

async function main() {
  const { cmd, o } = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) die('DATABASE_URL belum diset');
  try {
    const sys = await systemAnalystId({ query });
    if (cmd === 'list') {
      for (const u of await listUsers({ query })) console.log([u.user_id, u.email, u.display_name, u.role, u.is_active ? 'aktif' : 'nonaktif', u.must_change_password ? 'sandi-sementara' : '-', u.last_login_at ? new Date(u.last_login_at).toISOString() : '-'].join('\t'));
    } else if (cmd === 'create') {
      const out = checkOut(o.out);
      const r = await tx((db) => createUser(db, { email: o.email, displayName: o.name, role: o.role, actorAnalystId: sys }));
      emit(out, r.user.email, r.temporary_password); console.log(`dibuat: ${r.user.email} (${r.user.role}); kata sandi sementara ditulis ke ${out}` + (r.adopted_legacy_analyst ? '; CATATAN: nama sama dengan analis lama, jejak lama tertaut ke akun ini' : ''));
    } else if (cmd === 'seed-env') {
      const rows = sharedFromEnv(parseEnvFile(checkEnvFile(o['env-file'])));
      for (const r of rows) {
        const { user, created } = await tx((db) => upsertSharedAccount(db, { email: r.email, username: r.username, displayName: r.display_name, password: r.password, role: r.role, actorAnalystId: sys }));
        console.log(`${created ? 'dibuat' : 'diperbarui'}: ${user.display_name} <${user.email}> peran ${user.role}`);   // hanya email + peran; kata sandi TIDAK pernah dicetak
      }
    } else if (cmd === 'seed') {
      const out = checkOut(o.out); if (!o.file) die('--file wajib');
      let made = 0, skipped = 0;
      for (const row of readList(o.file)) {
        if (await findByEmail({ query }, row.email)) { skipped++; continue; }
        const r = await tx((db) => createUser(db, { email: row.email, displayName: row.display_name, role: row.role, actorAnalystId: sys }));
        emit(out, r.user.email, r.temporary_password); made++;
      }
      console.log(`seed selesai: ${made} dibuat, ${skipped} sudah ada; kata sandi sementara di ${out}`);
    } else if (['reset', 'role', 'deactivate', 'activate'].includes(cmd)) {
      const u = await findByEmail({ query }, o.email); if (!u || u.is_system) die('pengguna tidak ditemukan');
      const body = cmd === 'reset' ? { reset_password: true } : cmd === 'role' ? (ROLE_LIST.includes(o.role) ? { role: o.role } : die('--role: admin|penulis|pembaca')) : { is_active: cmd === 'activate' };
      const out = cmd === 'reset' ? checkOut(o.out) : null;
      const r = await tx((db) => patchUser(db, { id: Number(u.user_id), actor: { user_id: 0, analyst_id: sys }, body }));
      if (out) { emit(out, u.email, r.temporary_password); console.log(`kata sandi sementara baru untuk ${u.email} ditulis ke ${out}`); } else console.log(`ok: ${cmd} ${u.email}`);
    } else die('perintah: list | create | reset | role | deactivate | activate | seed | seed-env');
  } catch (e) { die(e.message + (e.extra?.details ? ' (' + e.extra.details.join('; ') + ')' : '')); }
  finally { await getPool().end(); }
}
if (process.argv[1]?.endsWith('user_admin.mjs')) main();
