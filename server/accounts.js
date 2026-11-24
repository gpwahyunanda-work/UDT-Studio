// F10: logika akun bersama oleh API admin dan skrip scripts/user_admin.mjs. db = { query } (pg Pool/Client atau klien transaksi).
// Tidak pernah mencatat atau mengembalikan password_hash. Kata sandi sementara hanya dikembalikan ke pemanggil sekali (dibuat atau disetel ulang).
import { randomInt } from 'node:crypto';
import { hashPassword, verifyPassword, emailKey } from './auth.js';
import { HttpError } from './ingest.js';

export const ROLE_LIST = ['admin', 'penulis', 'pembaca'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PW = 12, MAX_PW = 128;

// Daftar kecil kata sandi umum (huruf kecil; dicek juga tanpa spasi/tanda). Sengaja kecil: kebijakan utama = panjang >= 12.
const COMMON = new Set(['password1234', 'password12345', 'passw0rd1234', '123456789012', '1234567890123', 'qwertyuiop12', 'qwerty123456', 'qwertyuiopasdf', 'iloveyou1234', 'welcome12345', 'admin1234567', 'administrator', 'letmein12345', 'changeme1234', 'katasandi123', 'katasandi1234', 'passwordpassword', 'abcdefghijkl', 'abcd12345678', '111111111111', '000000000000', 'aaaaaaaaaaaa', 'indonesia123', 'indonesia2026', 'pharos123456', 'pharos2026', 'pharos2026!', 'udtstudio123', 'udtcompiler123', 'welcome2026!', 'password2026', 'sandi1234567', 'rahasia12345', 'monkey123456', 'dragon123456', 'football1234', 'baseball1234', 'sunshine1234', 'master123456', 'superman1234', 'trustno1trustno1']);
const squash = (s) => String(s).toLowerCase().replace(/[\s._\-!@#$%^&*]+/g, '');

export function normEmail(e) { return typeof e === 'string' ? e.trim().toLowerCase() : ''; }
export function validateEmail(e) {
  const x = normEmail(e);
  if (!EMAIL_RE.test(x) || x.length < 3 || x.length > 254) throw new HttpError(400, 'Email tidak valid');
  return x;
}
// F12: nama analis/pemeriksa DIKETIK pengguna pada tiap tulis (bukan dari akun). 2-80 karakter, bukan hanya spasi, tanpa karakter kendali.
export const ANALYST_MSG = 'Nama analis wajib diisi (2 sampai 80 karakter, bukan hanya spasi, tanpa karakter kendali)';
export function validateAnalystName(n) {
  if (typeof n !== 'string' || !n.trim()) throw new HttpError(400, 'Nama analis wajib diisi', { details: ['analyst_name: ' + ANALYST_MSG] });
  if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(n)) throw new HttpError(400, 'Nama analis tidak valid', { details: ['analyst_name: tanpa karakter kendali'] });
  const x = n.trim().replace(/ {2,}/g, ' '), len = [...x].length;
  if (len < 2 || len > 80) throw new HttpError(400, 'Nama analis tidak valid', { details: ['analyst_name: ' + ANALYST_MSG] });
  return x;
}
export function validateUsername(u) {
  const x = typeof u === 'string' ? u.trim() : '';
  if (!/^[A-Za-z0-9._-]{3,64}$/.test(x)) throw new HttpError(400, 'Username tidak valid (3 sampai 64 karakter: huruf, angka, titik, garis bawah, strip; tanpa @ dan spasi)');
  return x;
}
export function validateDisplayName(n) {
  const x = typeof n === 'string' ? n.trim().replace(/\s+/g, ' ') : '';
  if (!x || x.length > 80 || /[\u0000-\u001f<>]/.test(x)) throw new HttpError(400, 'Nama tampilan wajib (1 sampai 80 karakter, tanpa < >)');
  return x;
}
// Kembalikan daftar alasan penolakan (kosong = lolos).
export function passwordProblems(pw, { email = '', displayName = '' } = {}) {
  const out = [];
  if (typeof pw !== 'string') return ['kata sandi wajib berupa teks'];
  if ([...pw].length < MIN_PW) out.push(`minimal ${MIN_PW} karakter`);
  if (pw.length > MAX_PW) out.push(`maksimal ${MAX_PW} karakter`);
  const s = squash(pw), local = squash(String(email).split('@')[0]);
  if (email && (s === squash(email) || (local.length >= 3 && s === local))) out.push('tidak boleh sama dengan email');
  else if (local.length >= 6 && s.includes(local)) out.push('tidak boleh memuat bagian depan email');   // F11 K-3: tanpa memandang kapital (squash huruf kecil)
  if (displayName && (s === squash(displayName) || (squash(displayName).length >= 4 && s.includes(squash(displayName))))) out.push('tidak boleh memuat nama Anda');
  if (COMMON.has(s) || COMMON.has(pw.toLowerCase())) out.push('terlalu umum');
  if (/^(.)\1+$/.test(pw)) out.push('tidak boleh karakter yang sama berulang');
  return out;
}
export function assertPassword(pw, ctx) {
  const p = passwordProblems(pw, ctx);
  if (p.length) throw new HttpError(400, 'Kata sandi tidak memenuhi kebijakan', { details: p });
}

const ALPHA = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function tempPassword() {   // 16 karakter acak (~93 bit), format 4-4-4-4 agar mudah disalin
  const c = Array.from({ length: 16 }, () => ALPHA[randomInt(ALPHA.length)]);
  return [0, 4, 8, 12].map((i) => c.slice(i, i + 4).join('')).join('-');
}

export const PUBLIC_COLS = 'user_id, email, display_name, role, must_change_password, is_active, last_login_at, created_at';
const shape = (r) => ({ ...r, user_id: Number(r.user_id) });

async function audit(db, { actorAnalystId, action, userId, requestId, ipHash, changes = [] }) {
  const e = await db.query('INSERT INTO audit_event(analyst_id,action,entity_type,entity_id,request_id,ip_hash) VALUES ($1,$2,$3,$4,$5,$6) RETURNING event_id', [actorAnalystId, action, 'user', userId, requestId ?? null, ipHash ?? null]);
  for (const [f, o, n] of changes) await db.query('INSERT INTO audit_change(event_id,field_name,old_value,new_value) VALUES ($1,$2,$3,$4)', [e.rows[0].event_id, f, o ?? null, n ?? null]);   // tidak pernah berisi hash/kata sandi
}
export async function systemAnalystId(db) {
  const r = await db.query('SELECT analyst_id FROM app_user WHERE is_system'); return Number(r.rows[0].analyst_id);
}

export async function listUsers(db) {
  return (await db.query(`SELECT ${PUBLIC_COLS} FROM app_user WHERE NOT is_system ORDER BY lower(display_name)`)).rows.map(shape);
}

// Buat akun. Kata sandi: password (bila diberikan, diperiksa kebijakan) atau acak sementara. Selalu wajib ganti saat masuk pertama.
export async function createUser(db, { email, displayName, role, password, actorAnalystId, requestId, ipHash }) {
  const em = validateEmail(email), name = validateDisplayName(displayName);
  if (!ROLE_LIST.includes(role)) throw new HttpError(400, 'Peran: admin, penulis, atau pembaca');
  const pw = password ?? tempPassword();
  if (password !== undefined) assertPassword(pw, { email: em, displayName: name });
  const hash = await hashPassword(pw);
  const adopted = (await db.query('SELECT 1 FROM analyst WHERE name=$1', [name])).rowCount > 0;   // nama persis sama dengan analyst lama: tertaut (analyst.name unik)
  await db.query('INSERT INTO analyst(name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
  const aid = Number((await db.query('SELECT analyst_id FROM analyst WHERE name=$1', [name])).rows[0].analyst_id);
  if ((await db.query('SELECT 1 FROM app_user WHERE analyst_id=$1', [aid])).rowCount) throw new HttpError(409, 'Nama tampilan sudah dipakai akun lain');
  let u;
  try {
    u = (await db.query(`INSERT INTO app_user(email, display_name, role, password_hash, must_change_password, analyst_id) VALUES ($1,$2,$3,$4,true,$5) RETURNING ${PUBLIC_COLS}`, [em, name, role, hash, aid])).rows[0];
  } catch (e) { if (e.code === '23505') throw new HttpError(409, 'Email atau nama tampilan sudah dipakai'); throw e; }
  await audit(db, { actorAnalystId: actorAnalystId ?? aid, action: 'user_create', userId: u.user_id, requestId, ipHash, changes: [['role', null, role], ['email', null, em]] });
  return { user: shape(u), temporary_password: password === undefined ? pw : undefined, adopted_legacy_analyst: adopted };
}

export async function getUser(db, id) {
  const r = (await db.query(`SELECT ${PUBLIC_COLS}, token_version, analyst_id FROM app_user WHERE user_id=$1 AND NOT is_system`, [id])).rows[0];
  return r ? { ...r, user_id: Number(r.user_id), analyst_id: Number(r.analyst_id) } : null;
}
export async function findByEmail(db, email) {
  const r = await db.query(`SELECT ${PUBLIC_COLS}, token_version, password_hash, analyst_id, is_system FROM app_user WHERE lower(email)=$1`, [normEmail(email)]);
  return r.rows[0] || null;
}

// F12: masuk dengan email ATAU username (tanpa beda huruf besar-kecil). Tidak ada baris atau lebih dari satu = null (tak pernah menebak).
export async function findByIdentity(db, identity) {
  const k = normEmail(identity); if (!k) return null;
  const r = await db.query(`SELECT ${PUBLIC_COLS}, username, token_version, password_hash, analyst_id, is_system FROM app_user WHERE lower(email)=$1 OR lower(username)=$1`, [k]);
  return r.rows.length === 1 ? r.rows[0] : null;
}

// F12: tiga akun bersama (Formdev, Andev = penulis; Admin = admin) dari berkas env lokal (scripts/user_admin.mjs seed-env). Kata sandi dibuat Wahyu: TIDAK diperiksa kebijakan (hanya tidak kosong dan <= 256 agar bisa dipakai masuk).
// Idempoten: kunci = nama tampilan; ada = perbarui email, username, kata sandi, peran sesuai kartu, aktif, sesi lama dicabut. must_change_password selalu false.
export async function upsertSharedAccount(db, { email, username, displayName, password, role = 'penulis', actorAnalystId }) {
  if (!ROLE_LIST.includes(role)) throw new HttpError(400, 'Peran tidak valid');
  const em = validateEmail(email), un = validateUsername(username), name = validateDisplayName(displayName);
  if (typeof password !== 'string' || !password.trim() || password.length > 256) throw new HttpError(400, 'Kata sandi kosong atau lebih dari 256 karakter');
  const hash = await hashPassword(password);
  const cur = (await db.query('SELECT user_id FROM app_user WHERE lower(display_name)=lower($1) AND NOT is_system', [name])).rows[0];
  let u, created = !cur;
  try {
    if (cur) {
      u = (await db.query(`UPDATE app_user SET email=$1, username=$2, password_hash=$3, role=$5, must_change_password=false, is_active=true, token_version=token_version+1 WHERE user_id=$4 RETURNING ${PUBLIC_COLS}`, [em, un, hash, cur.user_id, role])).rows[0];
    } else {
      await db.query('INSERT INTO analyst(name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
      const aid = Number((await db.query('SELECT analyst_id FROM analyst WHERE name=$1', [name])).rows[0].analyst_id);
      if ((await db.query('SELECT 1 FROM app_user WHERE analyst_id=$1', [aid])).rowCount) throw new HttpError(409, 'Nama tampilan sudah dipakai akun lain');
      u = (await db.query(`INSERT INTO app_user(email, username, display_name, role, password_hash, must_change_password, analyst_id) VALUES ($1,$2,$3,$6,$4,false,$5) RETURNING ${PUBLIC_COLS}`, [em, un, name, hash, aid, role])).rows[0];
    }
  } catch (e) { if (e.code === '23505') throw new HttpError(409, 'Email atau username sudah dipakai akun lain'); throw e; }
  await audit(db, { actorAnalystId: actorAnalystId ?? (await systemAnalystId(db)), action: created ? 'user_create' : 'user_update', userId: u.user_id, changes: [['role', null, role], ['password', null, 'disetel (seed-env)']] });
  return { user: shape(u), created };
}

// PATCH admin: peran, aktif/nonaktif, setel ulang kata sandi sementara. Pengaman: admin tidak menurunkan/menonaktifkan dirinya; admin aktif terakhir dilindungi.
export async function patchUser(db, { id, actor, body, requestId, ipHash }) {
  const cur = await getUser(db, id);
  if (!cur) throw new HttpError(404, 'Pengguna tidak ditemukan');
  const keys = Object.keys(body || {});
  if (!keys.length || keys.some((k) => !['role', 'is_active', 'reset_password'].includes(k))) throw new HttpError(400, 'Isian: role, is_active, atau reset_password');
  const sets = [], p = [], changes = []; let temp;
  const add = (col, val) => { p.push(val); sets.push(`${col}=$${p.length}`); };
  if (body.role !== undefined) {
    if (!ROLE_LIST.includes(body.role)) throw new HttpError(400, 'Peran: admin, penulis, atau pembaca');
    if (body.role !== cur.role) {
      if (cur.user_id === actor.user_id) throw new HttpError(409, 'Admin tidak dapat mengubah peran akunnya sendiri');
      add('role', body.role); changes.push(['role', cur.role, body.role]);
    }
  }
  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') throw new HttpError(400, 'is_active harus true atau false');
    if (body.is_active !== cur.is_active) {
      if (!body.is_active && cur.user_id === actor.user_id) throw new HttpError(409, 'Admin tidak dapat menonaktifkan akunnya sendiri');
      add('is_active', body.is_active); changes.push(['is_active', String(cur.is_active), String(body.is_active)]);
      if (!body.is_active) { sets.push('token_version=token_version+1'); }   // sesi mati seketika
    }
  }
  if (body.reset_password === true) {
    temp = tempPassword(); add('password_hash', await hashPassword(temp)); sets.push('must_change_password=true', 'token_version=token_version+1'); changes.push(['password', null, 'disetel ulang']);
  } else if (body.reset_password !== undefined) throw new HttpError(400, 'reset_password harus true');
  if (cur.role === 'admin' && cur.is_active && ((body.role && body.role !== 'admin') || body.is_active === false)) {
    const n = Number((await db.query("SELECT count(*) AS n FROM app_user WHERE role='admin' AND is_active AND NOT is_system AND user_id<>$1", [id])).rows[0].n);
    if (n < 1) throw new HttpError(409, 'Harus tersisa minimal satu admin aktif');
  }
  if (sets.length) {
    p.push(id);
    await db.query(`UPDATE app_user SET ${sets.join(', ')} WHERE user_id=$${p.length}`, p);
    await audit(db, { actorAnalystId: actor.analyst_id, action: temp ? 'user_reset_password' : 'user_update', userId: id, requestId, ipHash, changes });
  }
  const { token_version, analyst_id, ...pub } = await getUser(db, id);   // analyst_id/token_version tidak dikeluarkan
  return { user: pub, temporary_password: temp };
}

// Ganti kata sandi sendiri: kata sandi lama wajib benar; semua sesi lama mati (token_version naik); sesi baru diterbitkan pemanggil.
export async function changeOwnPassword(db, { user, current, next, requestId, ipHash }) {
  const row = (await db.query('SELECT password_hash FROM app_user WHERE user_id=$1', [user.user_id])).rows[0];
  if (typeof current !== 'string' || !(await verifyPassword(current, row.password_hash))) { const e = new HttpError(400, 'Kata sandi saat ini salah'); e.wrongCurrent = true; throw e; }
  assertPassword(next, { email: user.email, displayName: user.display_name });
  if (next === current) throw new HttpError(400, 'Kata sandi baru harus berbeda dari yang lama', { details: ['harus berbeda dari yang lama'] });
  const hash = await hashPassword(next);
  const r = await db.query('UPDATE app_user SET password_hash=$1, must_change_password=false, token_version=token_version+1 WHERE user_id=$2 RETURNING token_version', [hash, user.user_id]);
  await audit(db, { actorAnalystId: user.analyst_id, action: 'password_change', userId: user.user_id, requestId, ipHash, changes: [] });
  return Number(r.rows[0].token_version);
}

// ---- Pembatasan laju masuk (jendela bergeser 15 menit, dihitung dari login_attempt) ----
export const RATE = { windowMin: 15, perPairFails: 5, perIpFails: 30 };
// Kunci per (identitas, IP) paling ketat; per IP longgar (kantor satu IP): hanya semprotan massal yang kena.
// F12: TIDAK ADA kunci per identitas saja (lintas IP): pada akun bersama, satu penyerang bisa mengunci seluruh tim. Kunci identitas = akun hasil pencarian (email atau username menghasilkan kunci yang sama).
export async function loginBlocked(db, { emailK, ipH }) {
  const w = String(RATE.windowMin);
  const q = async (sql, p) => Number((await db.query(sql, p)).rows[0].n);
  const base = "FROM login_attempt WHERE ok=false AND at_utc > now() - ($1 || ' minutes')::interval";
  if (await q(`SELECT count(*) AS n ${base} AND ip_hash=$2 AND email_key=$3`, [w, ipH, emailK]) >= RATE.perPairFails) return 'pair';
  if (await q(`SELECT count(*) AS n ${base} AND ip_hash=$2`, [w, ipH]) >= RATE.perIpFails) return 'ip';
  return null;
}
export const recordAttempt = (db, { emailK, ipH, ok }) => db.query('INSERT INTO login_attempt(ip_hash,email_key,ok) VALUES ($1,$2,$3)', [ipH, emailK, ok]);
export { emailKey };

