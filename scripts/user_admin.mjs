#!/usr/bin/env node
// F10: pengelolaan akun dari terminal. Memakai DATABASE_URL (peran udt_app cukup; tidak perlu pemilik).
// Kata sandi sementara acak HANYA ditulis ke berkas --out (di LUAR repo, mode 0600, ditambah per baris "email<TAB>kata-sandi"); tidak pernah ke stdout/log.
//   node scripts/user_admin.mjs list
//   node scripts/user_admin.mjs create  --email a@b.id --name "Nama Tampilan" --role penulis --out <berkas>
//   node scripts/user_admin.mjs reset   --email a@b.id --out <berkas>        (kata sandi sementara baru; semua sesi mati; wajib ganti)
//   node scripts/user_admin.mjs role    --email a@b.id --role pembaca|penulis|admin
//   node scripts/user_admin.mjs deactivate|activate --email a@b.id
//   node scripts/user_admin.mjs seed    --file <daftar.json|.csv> --out <berkas>   (daftar dari berkas lokal INDRA, tidak ada di repo)
import { readFileSync, appendFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { resolve, relative, isAbsolute, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tx, query, getPool } from '../server/db.js';
import { createUser, patchUser, findByEmail, listUsers, systemAnalystId, ROLE_LIST } from '../server/accounts.js';

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
    } else die('perintah: list | create | reset | role | deactivate | activate | seed');
  } catch (e) { die(e.message + (e.extra?.details ? ' (' + e.extra.details.join('; ') + ')' : '')); }
  finally { await getPool().end(); }
}
if (process.argv[1]?.endsWith('user_admin.mjs')) main();
