// F10: akun per pengguna (autentikasi) + peran (autorisasi). [LAPTOP: handler + PostgreSQL 17 biasa]
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { createTestDb, TEST_PASSWORD, APP_PW, ADMIN } from './helpers/db.js';
import { Client, loggedIn, readerLoggedIn, adminLoggedIn, loginAs, ensureUser, emailOf } from './helpers/http.js';
import { REPO } from './helpers/fixtures.js';
import { RULES, ROLES, RANK } from '../server/authz.js';
import { hashPassword, verifyPassword } from '../server/auth.js';
import { passwordProblems, tempPassword, patchUser } from '../server/accounts.js';
import { tx } from '../server/db.js';
import { migrate, listMigrations } from '../db/migrate.mjs';

const rd = (f) => readFileSync(join(REPO, f), 'utf8');
let db, ADM, W, R, A;
const logs = [];   // semua keluaran konsol server selama tes: tidak boleh memuat rahasia
const orig = { error: console.error, log: console.log, warn: console.warn };
before(async () => {
  for (const k of Object.keys(orig)) console[k] = (...a) => { logs.push(a.map(String).join(' ')); };
  db = await createTestDb('f10');
  ADM = await adminLoggedIn('10.10.0.1'); W = await loggedIn('Penulis F10', '10.10.0.2'); R = await readerLoggedIn('10.10.0.3');
  A = db.app;
});
after(async () => { Object.assign(console, orig); await db.drop(); });
const age = (minutes) => db.owner.query("UPDATE login_attempt SET at_utc = at_utc - ($1 || ' minutes')::interval", [String(minutes)]);

// ---------------- 3 + 8: matriks otorisasi (setiap endpoint x tiga peran x tanpa login) ----------------
test('Matriks otorisasi: tiap endpoint x {tanpa login, pembaca, penulis, admin}; tanpa login 401, di bawah peran minimum 403, selebihnya lolos guard', async () => {
  let cells = 0; const csv = ['metode,jalur,peran_minimum,tanpa_login,pembaca,penulis,admin'];
  const byRole = { pembaca: R, penulis: W, admin: ADM };   // satu sesi per peran; logout (mencabut sesi) memakai akun segar
  for (const [method, , min, path] of RULES) {
    const body = method === 'GET' ? undefined : {};
    const anon = await new Client('10.10.1.1').call(method, path, body); cells++;
    assert.equal(anon.status, 401, `tanpa login ${method} ${path}`);
    const row = [method, path, min, anon.status];
    for (const role of ROLES) {
      const c = path === '/api/auth/logout' ? await loginAs('Logout ' + role, role, '10.10.1.5') : byRole[role];
      const r = await c.call(method, path, body); cells++; row.push(r.status);
      const ok = min === 'any' || RANK[role] >= RANK[min];
      if (ok) assert.ok(![401, 403].includes(r.status), `${role} ${method} ${path} harus lolos guard, dapat ${r.status} ${JSON.stringify(r.json)}`);
      else assert.equal(r.status, 403, `${role} ${method} ${path} harus 403, dapat ${r.status}`);
    }
    csv.push(row.join(','));
  }
  if (process.env.UDT_EVIDENCE_DIR) writeFileSync(join(process.env.UDT_EVIDENCE_DIR, 'matriks_otorisasi_status_nyata.csv'), csv.join(String.fromCharCode(10)) + String.fromCharCode(10));
  assert.ok(cells >= RULES.length * 4);
});

test('Rute tak terdaftar: 401 tanpa login, 404 setelah masuk (bukan 500)', async () => {
  assert.equal((await new Client().get('/api/rahasia')).status, 401);
  assert.equal((await W.get('/api/rahasia')).status, 404);
  assert.equal((await W.call('DELETE', '/api/compiles/1', {})).status, 404);
});

test('Tabel peran x endpoint di KONTRAK_API_COMPILER.md = tabel kode (server/authz.js)', { skip: existsSync(join(REPO, '..', 'docs', 'KONTRAK_API_COMPILER.md')) ? false : 'dokumen proyek di luar repo tidak ada' }, () => {
  const k = readFileSync(join(REPO, '..', 'docs', 'KONTRAK_API_COMPILER.md'), 'utf8');
  const sec = k.slice(k.indexOf('### 3.0'), k.indexOf('### 3.1 ')), rows = sec.split('\n').filter((l) => /^\| `(GET|POST|PUT|PATCH)/.test(l));
  const doc = new Map(rows.map((l) => { const c = l.split('|').map((x) => x.trim()); return [c[1].replace(/`/g, ''), c.slice(2, 6)]; }));
  for (const [m, , min, path] of RULES) {
    const row = doc.get(`${m} ${path.replace(/\/\d+(?=\/|$)/g, '/{id}')}`);
    assert.ok(row, `baris dokumen untuk ${m} ${path}`);
    assert.deepEqual(row, ['401', ...ROLES.map((r) => (min === 'any' || RANK[r] >= RANK[min] ? 'ya' : '403'))], `${m} ${path}`);
  }
  assert.equal(doc.size, RULES.length, 'dokumen tidak punya baris lebih');
});

// ---------------- kebijakan dan siklus kata sandi ----------------
test('Kebijakan kata sandi: min 12, bukan email/nama, bukan umum, bukan satu karakter; hash scrypt menyimpan parameter + salt per pengguna', async () => {
  const ctx = { email: 'budi.santoso@pharos.id', displayName: 'Budi Santoso' };
  for (const bad of ['pendek', 'abcdefghijk', 'budi.santoso@pharos.id', 'BudiSantoso', 'Budi Santoso 2026', 'password12345', 'aaaaaaaaaaaaaa', '123456789012']) assert.ok(passwordProblems(bad, ctx).length > 0, bad);
  for (const good of ['kopi-susu-hangat-77', 'Tujuh Kuda Biru!']) assert.deepEqual(passwordProblems(good, ctx), [], good);
  assert.match(tempPassword(), /^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/); assert.notEqual(tempPassword(), tempPassword());
  const h1 = await hashPassword('kopi-susu-hangat-77'), h2 = await hashPassword('kopi-susu-hangat-77');
  assert.match(h1, /^scrypt\$32768\$8\$3\$[0-9a-f]{32}\$[0-9a-f]{64}$/); assert.notEqual(h1, h2, 'salt per pengguna');
  assert.equal(await verifyPassword('kopi-susu-hangat-77', h1), true); assert.equal(await verifyPassword('kopi-susu-hangat-78', h1), false);
  assert.equal(await verifyPassword('x', 'scrypt$999999999$8$3$00$00'), false, 'parameter di luar batas ditolak tanpa kerja');
  assert.equal(await verifyPassword('x', '!'), false);
});

test('Akun baru: kata sandi sementara acak sekali, wajib ganti; semua jalur lain 403 sampai diganti; kebijakan dan kata sandi lama dicek; sesi lama mati', async () => {
  const mk = await ADM.post('/api/admin/users', { email: 'Baru.Orang@Pharos.ID', display_name: 'Baru Orang', role: 'penulis' });
  assert.equal(mk.status, 201, JSON.stringify(mk.json)); const temp = mk.json.temporary_password;
  assert.match(temp, /^[A-Za-z2-9-]{19}$/); assert.equal(mk.json.user.email, 'baru.orang@pharos.id'); assert.equal(mk.json.user.must_change_password, true);
  assert.doesNotMatch(JSON.stringify(mk.json), /password_hash|scrypt\$/);
  const c = new Client('10.10.2.1');
  const l = await c.post('/api/auth/login', { email: 'BARU.orang@pharos.id', password: temp });   // email tanpa beda huruf besar-kecil
  assert.equal(l.status, 200); assert.equal(l.json.must_change_password, true);
  assert.equal((await c.get('/api/me')).json.must_change_password, true);
  const blocked = await c.get('/api/products'); assert.equal(blocked.status, 403); assert.equal(blocked.json.must_change_password, true);
  assert.equal((await c.post('/api/compiles', { product_name: 'X', strength: '1 mg', dosage_form: 'Tablet' })).status, 403);
  const pg1 = await c.get('/', {}); assert.equal(pg1.status, 302); assert.equal(pg1.headers.get('location'), '/ganti-sandi');
  assert.equal((await c.get('/compiler/app.js')).status, 403);
  const old = c.cookie;
  const bad = async (cur, nxt) => c.post('/api/auth/password', { current_password: cur, new_password: nxt });
  assert.equal((await bad('salah-salah-salah', 'kopi-susu-hangat-77')).status, 400);
  for (const n of ['pendek', 'baru.orang@pharos.id', 'Baru Orang', 'password12345', temp]) { const r = await bad(temp, n); assert.equal(r.status, 400, n); assert.ok(r.json.error); }
  const ok = await bad(temp, 'kopi-susu-hangat-77'); assert.equal(ok.status, 200);
  assert.ok(ok.setCookie && /HttpOnly/.test(ok.setCookie));
  const me = (await c.get('/api/me')).json; assert.equal(me.must_change_password, false);
  assert.equal((await c.get('/api/products')).status, 200);
  const stale = new Client('10.10.2.1'); stale.cookie = old; assert.equal((await stale.get('/api/me')).status, 401, 'sesi sebelum ganti sandi mati');
  assert.equal((await new Client('10.10.2.2').post('/api/auth/login', { email: 'baru.orang@pharos.id', password: temp })).status, 401, 'kata sandi sementara tidak berlaku lagi');
  assert.equal((await new Client('10.10.2.3').post('/api/auth/login', { email: 'baru.orang@pharos.id', password: 'kopi-susu-hangat-77' })).status, 200);
});

test('Setel ulang oleh admin: kata sandi sementara baru, sesi lama mati, wajib ganti lagi; ganti peran dibaca ulang tiap permintaan; nonaktif = sesi mati seketika', async () => {
  const u = (await ADM.post('/api/admin/users', { email: 'ubah@pharos.id', display_name: 'Ubah Peran', role: 'penulis' })).json;
  const uc = new Client('10.10.3.1'); uc.analyst = 'Ubah Peran'; assert.equal((await uc.post('/api/auth/login', { email: 'ubah@pharos.id', password: u.temporary_password })).status, 200);
  assert.equal((await uc.post('/api/auth/password', { current_password: u.temporary_password, new_password: 'sandi-pertama-ubah-1' })).status, 200);
  const mkc = () => ({ product_name: 'Peran ' + Math.random(), strength: '1 mg', dosage_form: 'Tablet' });
  assert.equal((await uc.post('/api/compiles', mkc())).status, 201);
  // peran diturunkan: cookie SAMA, hak langsung berubah (tidak ada klaim peran di cookie)
  assert.equal((await ADM.patch(`/api/admin/users/${u.user.user_id}`, { role: 'pembaca' })).status, 200);
  assert.equal((await uc.post('/api/compiles', mkc())).status, 403); assert.equal((await uc.get('/api/products')).status, 200); assert.equal((await uc.get('/api/me')).json.role, 'pembaca');
  const payload = JSON.parse(Buffer.from(uc.cookie.split('=')[1].split('.')[0], 'base64url').toString()); assert.deepEqual(Object.keys(payload).sort(), ['exp', 'tv', 'uid']);
  assert.equal((await ADM.patch(`/api/admin/users/${u.user.user_id}`, { role: 'admin' })).status, 200);
  assert.equal((await uc.get('/api/admin/users')).status, 200, 'dinaikkan ke admin: langsung berlaku');
  assert.equal((await ADM.patch(`/api/admin/users/${u.user.user_id}`, { role: 'penulis' })).status, 200);
  // nonaktif: sesi mati seketika
  assert.equal((await ADM.patch(`/api/admin/users/${u.user.user_id}`, { is_active: false })).status, 200);
  assert.equal((await uc.get('/api/me')).status, 401);
  assert.equal((await new Client('10.10.3.2').post('/api/auth/login', { email: 'ubah@pharos.id', password: 'sandi-pertama-ubah-1' })).status, 401, 'akun nonaktif tidak bisa masuk');
  assert.equal((await ADM.patch(`/api/admin/users/${u.user.user_id}`, { is_active: true })).status, 200);
  assert.equal((await uc.get('/api/me')).status, 401, 'mengaktifkan lagi tidak menghidupkan sesi lama');
  // setel ulang
  const uc2 = new Client('10.10.3.3'); assert.equal((await uc2.post('/api/auth/login', { email: 'ubah@pharos.id', password: 'sandi-pertama-ubah-1' })).status, 200);
  const rs = await ADM.patch(`/api/admin/users/${u.user.user_id}`, { reset_password: true }); assert.equal(rs.status, 200); assert.match(rs.json.temporary_password, /^[A-Za-z2-9-]{19}$/);
  assert.equal((await uc2.get('/api/me')).status, 401);
  assert.equal((await new Client('10.10.3.4').post('/api/auth/login', { email: 'ubah@pharos.id', password: 'sandi-pertama-ubah-1' })).status, 401);
  const l = await new Client('10.10.3.5').post('/api/auth/login', { email: 'ubah@pharos.id', password: rs.json.temporary_password }); assert.equal(l.status, 200); assert.equal(l.json.must_change_password, true);
});

test('Pengaman admin: tidak mengubah/menonaktifkan diri sendiri; admin aktif terakhir dilindungi; email/nama ganda 409; isian aneh 400; pengguna sistem tak tersentuh', async () => {
  const me = (await ADM.get('/api/me')).json.user_id;
  assert.equal((await ADM.patch(`/api/admin/users/${me}`, { role: 'pembaca' })).status, 409);
  assert.equal((await ADM.patch(`/api/admin/users/${me}`, { is_active: false })).status, 409);
  await db.owner.query("UPDATE app_user SET is_active=false WHERE role='admin' AND NOT is_system AND user_id<>$1", [me]);   // sisakan satu admin aktif
  const sys = Number((await db.owner.query('SELECT user_id FROM app_user WHERE is_system')).rows[0].user_id);
  const sysAnalyst = Number((await db.owner.query('SELECT analyst_id FROM app_user WHERE is_system')).rows[0].analyst_id);
  for (const body of [{ is_active: false }, { role: 'penulis' }]) {   // pelaku non-admin (skrip): admin aktif terakhir tetap dilindungi
    await assert.rejects(() => tx((d) => patchUser(d, { id: me, actor: { user_id: 0, analyst_id: sysAnalyst }, body })), (e) => e.status === 409 && /minimal satu admin/.test(e.message), JSON.stringify(body));
  }
  const dua = (await ADM.post('/api/admin/users', { email: 'dua@pharos.id', display_name: 'Orang Dua', role: 'penulis' })).json.user.user_id;
  assert.equal((await ADM.post('/api/admin/users', { email: 'DUA@pharos.id', display_name: 'Lain Lagi', role: 'penulis' })).status, 409, 'email tanpa beda besar-kecil unik');
  assert.equal((await ADM.post('/api/admin/users', { email: 'lain@pharos.id', display_name: 'orang dua', role: 'penulis' })).status, 409, 'nama tampilan unik');
  for (const b of [{ email: 'bukan-email', display_name: 'X', role: 'penulis' }, { email: 'x@y.id', display_name: '', role: 'penulis' }, { email: 'x@y.id', display_name: 'X', role: 'raja' }, { email: 'x@y.id', display_name: '<b>X</b>', role: 'penulis' }]) assert.equal((await ADM.post('/api/admin/users', b)).status, 400, JSON.stringify(b));
  assert.equal((await ADM.patch(`/api/admin/users/${dua}`, { email: 'baru@x.id' })).status, 400);
  assert.equal((await ADM.patch(`/api/admin/users/${dua}`, { role: 'raja' })).status, 400);
  assert.equal((await ADM.patch(`/api/admin/users/${dua}`, {})).status, 400);
  assert.equal((await ADM.patch(`/api/admin/users/${sys}`, { is_active: true })).status, 404);
  assert.equal((await ADM.patch('/api/admin/users/999999', { is_active: true })).status, 404);
  const list = (await ADM.get('/api/admin/users')).json.users; assert.ok(list.length >= 3 && !list.some((u) => u.is_system || 'password_hash' in u || 'analyst_id' in u));
});

// ---------------- brute force dan penguncian ----------------
test('Brute force: kunci per (email, IP) ketat; IP lain dan email lain tidak ikut terkunci; jendela bergeser membuka lagi', async () => {
  const em = await ensureUser('Korban Satu', 'penulis'), em2 = await ensureUser('Korban Dua', 'penulis');
  const atk = new Client('10.20.0.1');
  for (let i = 0; i < 5; i++) assert.equal((await atk.post('/api/auth/login', { email: em, password: 'tebakan-ke-' + i })).status, 401);
  assert.equal((await atk.post('/api/auth/login', { email: em, password: TEST_PASSWORD })).status, 401, '(email, IP) terkunci walau kata sandi benar');
  assert.equal((await new Client('10.20.0.1').post('/api/auth/login', { email: em2, password: TEST_PASSWORD })).status, 200, 'orang lain di IP kantor yang sama tetap bisa masuk');
  assert.equal((await new Client('10.20.0.2').post('/api/auth/login', { email: em, password: TEST_PASSWORD })).status, 200, 'pemilik dari IP lain tetap bisa masuk');
  await age(16);   // jendela bergeser: percobaan lama gugur
  assert.equal((await new Client('10.20.0.1').post('/api/auth/login', { email: em, password: TEST_PASSWORD })).status, 200);
});

test('Penyerang tidak bisa mengunci pemilik akun (F12: TIDAK ada kunci per identitas saja lintas IP); per IP longgar tapi menahan semprotan massal', async () => {
  const em = await ensureUser('Korban Tiga', 'penulis');
  assert.equal((await new Client('10.20.1.1').post('/api/auth/login', { email: em, password: TEST_PASSWORD })).status, 200);   // IP biasa pemilik tercatat
  for (let ip = 2; ip <= 5; ip++) for (let i = 0; i < 5; i++) await new Client('10.20.1.' + ip).post('/api/auth/login', { email: em, password: 'serang-' + ip + '-' + i });   // 20 gagal dari 4 IP
  assert.equal((await new Client('10.20.1.1').post('/api/auth/login', { email: em, password: TEST_PASSWORD })).status, 200, 'dari IP biasa tetap masuk');
  assert.equal((await new Client('10.20.1.9').post('/api/auth/login', { email: em, password: TEST_PASSWORD })).status, 200, 'F12: dari IP baru tetap masuk; akun bersama tidak bisa dikunci seluruh tim oleh satu penyerang');
  // semprotan kata sandi dari satu IP ke banyak email
  const spray = new Client('10.20.2.1');
  for (let i = 0; i < 30; i++) await spray.post('/api/auth/login', { email: `orang${i}@pharos.id`, password: 'semprot-sandi-' + i });
  const e2 = await ensureUser('Korban Empat', 'penulis');
  assert.equal((await spray.post('/api/auth/login', { email: e2, password: TEST_PASSWORD })).status, 401, 'IP penyemprot tertahan');
  assert.equal((await new Client('10.20.2.2').post('/api/auth/login', { email: e2, password: TEST_PASSWORD })).status, 200);
  // satu IP kantor dengan beberapa salah ketik (di bawah ambang) tidak mengunci siapa pun
  const office = '10.20.3.1';
  for (const n of ['Kantor A', 'Kantor B', 'Kantor C']) { const e = await ensureUser(n, 'penulis'); for (let i = 0; i < 3; i++) await new Client(office).post('/api/auth/login', { email: e, password: 'salah-ketik-' + i }); }
  for (const n of ['Kantor A', 'Kantor B', 'Kantor C']) assert.equal((await new Client(office).post('/api/auth/login', { email: emailOf(n), password: TEST_PASSWORD })).status, 200, n);
});

test('Galat generik dan tanpa pembeda: email tidak dikenal, salah kata sandi, akun nonaktif, isian kosong/aneh = respons sama; timing seragam', async () => {
  const em = await ensureUser('Waktu Uji', 'penulis'), off = await ensureUser('Akun Mati', 'penulis');
  await db.owner.query('UPDATE app_user SET is_active=false WHERE lower(email)=$1', [off]);
  const msgs = new Set(), codes = new Set(); let n = 0;
  const attempt = async (b) => { const r = await new Client('10.30.0.' + (++n)).post('/api/auth/login', b); msgs.add(r.json.error); codes.add(r.status); assert.equal(r.setCookie, null); assert.doesNotMatch(JSON.stringify(r.json), /tidak dikenal|nonaktif|tidak ada/i); return r; };
  await attempt({ email: 'tidak.ada@pharos.id', password: 'kata-sandi-apa-saja' }); await attempt({ email: em, password: 'kata-sandi-salah-1' }); await attempt({ email: off, password: TEST_PASSWORD });
  await attempt({}); await attempt({ email: em }); await attempt({ email: 12, password: ['x'] }); await attempt({ email: 'x'.repeat(400), password: 'y'.repeat(400) });
  assert.equal(msgs.size, 1); assert.deepEqual([...codes], [401]);
  // Sampel berselang-seling (beban mesin memengaruhi kedua kelompok sama rata); pemanasan dulu.
  const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const one = async (b) => { const c = new Client('10.31.' + Math.floor(n / 200) + '.' + (++n % 200)); const s0 = process.hrtime.bigint(); await c.post('/api/auth/login', b); return Number(process.hrtime.bigint() - s0) / 1e6; };
  await one({ email: 'pemanasan@pharos.id', password: 'x-pemanasan-1' }); await one({ email: em, password: 'x-pemanasan-2' });
  const tu = [], tw = [];
  for (let i = 0; i < 12; i++) { tu.push(await one({ email: `hantu${i}@pharos.id`, password: 'kata-sandi-hantu-' + i })); tw.push(await one({ email: em, password: 'kata-sandi-salah-' + i })); }
  const tUnknown = Math.min(...tu), tWrong = Math.min(...tw), ratio = tUnknown / tWrong;   // minimum paling kebal terhadap beban mesin; median dicatat sebagai bukti
  const medians = { unknown: med(tu), wrong: med(tw) };
  assert.ok(ratio > 0.8 && ratio < 1.25, `rasio timing email tak dikenal / salah sandi = ${ratio.toFixed(2)} (${tUnknown.toFixed(0)} ms vs ${tWrong.toFixed(0)} ms)`);
  if (process.env.UDT_EVIDENCE_DIR) writeFileSync(join(process.env.UDT_EVIDENCE_DIR, 'timing_login.json'), JSON.stringify({ min_ms_email_tak_dikenal: +tUnknown.toFixed(1), min_ms_salah_kata_sandi: +tWrong.toFixed(1), rasio_min: +ratio.toFixed(3), median_ms_email_tak_dikenal: +medians.unknown.toFixed(1), median_ms_salah_kata_sandi: +medians.wrong.toFixed(1), rasio_median: +(medians.unknown / medians.wrong).toFixed(3), sampel_per_kelompok: 12 }, null, 1));
});

// ---------------- tanpa rahasia di respons, log, jejak ----------------
test('Tidak ada kata sandi/hash di respons, log server, jejak audit, atau tabel percobaan masuk (kecuali kata sandi sementara SEKALI saat dibuat/disetel ulang)', async () => {
  const secrets = [TEST_PASSWORD];
  const mk = (await ADM.post('/api/admin/users', { email: 'rahasia@pharos.id', display_name: 'Rahasia Uji', role: 'pembaca' })).json; secrets.push(mk.temporary_password);
  const c = new Client('10.40.0.1'); const l = await c.post('/api/auth/login', { email: 'rahasia@pharos.id', password: mk.temporary_password });
  const outs = [l, await c.get('/api/me'), await ADM.get('/api/admin/users'), await ADM.patch(`/api/admin/users/${mk.user.user_id}`, { role: 'penulis' }), await c.post('/api/auth/password', { current_password: 'salah-salah-salah', new_password: 'x' }), await c.post('/api/auth/password', { current_password: mk.temporary_password, new_password: 'kata-sandi-rahasia-9' })];
  secrets.push('kata-sandi-rahasia-9');
  for (const o of outs) { const t = JSON.stringify(o.json) + (o.setCookie || ''); assert.doesNotMatch(t, /password_hash|scrypt\$|"password"/); for (const s of secrets) assert.ok(!t.includes(s), 'respons memuat kata sandi'); }
  const rs = await ADM.patch(`/api/admin/users/${mk.user.user_id}`, { reset_password: true }); secrets.push(rs.json.temporary_password);
  assert.ok(rs.json.temporary_password); assert.doesNotMatch(JSON.stringify(rs.json), /password_hash|scrypt\$/);
  const db1 = JSON.stringify((await db.owner.query('SELECT * FROM audit_change')).rows) + JSON.stringify((await db.owner.query('SELECT * FROM audit_event')).rows) + JSON.stringify((await db.owner.query('SELECT * FROM login_attempt')).rows);
  for (const s of secrets) assert.ok(!db1.includes(s), 'jejak/percobaan memuat kata sandi'); assert.doesNotMatch(db1, /scrypt\$/);
  assert.ok(!/[\w.]+@[\w.]+/.test(JSON.stringify((await db.owner.query('SELECT * FROM login_attempt')).rows)), 'login_attempt tanpa email mentah');
  const all = logs.join('\n'); for (const s of secrets) assert.ok(!all.includes(s), 'log server memuat kata sandi'); assert.doesNotMatch(all, /scrypt\$/);
  const ev = (await db.owner.query("SELECT action, entity_type, user_id FROM audit_event WHERE entity_type='user' ORDER BY event_id DESC")).rows; assert.ok(ev.some((x) => x.action === 'user_create') && ev.some((x) => x.action === 'user_reset_password') && ev.some((x) => x.action === 'password_change'));
});

// ---------------- hak peran DB, migrasi, data lama ----------------
test('Hak peran udt_app: SELECT/INSERT app_user + UPDATE hanya delapan kolom; tanpa DELETE; tabel lain tetap tanpa UPDATE/DELETE', async () => {
  const cols = (await db.owner.query("SELECT column_name FROM information_schema.column_privileges WHERE grantee='udt_app' AND table_name='app_user' AND privilege_type='UPDATE' ORDER BY 1")).rows.map((r) => r.column_name);
  assert.deepEqual(cols, ['email', 'is_active', 'last_login_at', 'must_change_password', 'password_hash', 'role', 'token_version', 'username']);   // F12: + email, username (seed-env)
  const denied = async (sql) => { await assert.rejects(() => A.query(sql), (e) => e.code === '42501', sql); };
  await denied("UPDATE app_user SET display_name='x'"); await denied('UPDATE app_user SET analyst_id=1'); await denied('DELETE FROM app_user'); await denied('TRUNCATE app_user');
  await denied("UPDATE compile SET title='x'"); await denied('DELETE FROM audit_event'); await denied("UPDATE audit_event SET action='x'"); await denied("UPDATE analyst SET name='x'");
  const tabs = (await db.owner.query("SELECT table_name, privilege_type FROM information_schema.table_privileges WHERE grantee='udt_app' AND privilege_type IN ('DELETE','TRUNCATE','UPDATE')")).rows;
  assert.deepEqual(tabs, [], 'tidak ada UPDATE/DELETE/TRUNCATE tingkat tabel');
  assert.equal((await db.owner.query("SELECT rolsuper FROM pg_roles WHERE rolname='udt_app'")).rows[0].rolsuper, false);
});

test('Data lama: analyst bernama bebas dipetakan ke akun import/sistem (tidak aktif, tak bisa masuk); analyst yang punya akun ke akunnya; jejak lama tetap utuh', async () => {
  await db.owner.query("INSERT INTO analyst(name) VALUES ('Analis Lama Bebas') ON CONFLICT DO NOTHING");
  const v = (await db.owner.query("SELECT i.analyst_name, i.legacy, u.display_name AS owner_name, u.is_system FROM analyst_identity i JOIN app_user u ON u.user_id=i.user_id WHERE i.analyst_name IN ('Analis Lama Bebas','Penulis F10')")).rows;
  const lama = v.find((x) => x.analyst_name === 'Analis Lama Bebas'), baru = v.find((x) => x.analyst_name === 'Penulis F10');
  assert.equal(lama.legacy, true); assert.equal(lama.owner_name, 'import/sistem'); assert.equal(lama.is_system, true); assert.equal(baru.legacy, false); assert.equal(baru.owner_name, 'Penulis F10');
  const sys = (await db.owner.query('SELECT * FROM app_user WHERE is_system')).rows[0]; assert.equal(sys.is_active, false); assert.equal(sys.password_hash, '!');
  assert.equal((await new Client('10.50.0.1').post('/api/auth/login', { email: sys.email, password: '!' })).status, 401);
  await assert.rejects(() => db.owner.query("UPDATE app_user SET is_active=true WHERE is_system"), (e) => e.code === '23514');
});

test('Jejak audit: user_id + nama untuk tulis oleh akun; endpoint jejak run memuat user_id', async () => {
  const c = await loggedIn('Jejak Uji', '10.50.1.1'); const uid = (await c.get('/api/me')).json.user_id;
  const p = (await c.post('/api/compiles', { product_name: 'Jejak', strength: '2 mg', dosage_form: 'Tablet' })).json.compile_id;
  const ev = (await db.owner.query("SELECT e.user_id, a.name FROM audit_event e JOIN analyst a USING (analyst_id) WHERE e.action='compile_create' AND e.entity_id=$1", [p])).rows[0];
  assert.equal(Number(ev.user_id), uid); assert.equal(ev.name, 'Jejak Uji');
});

test('Migrasi 0005: dari DB 0004 berisi data lama -> maju (data utuh) -> mundur -> maju lagi pada salinan', async () => {
  const mig = listMigrations(); assert.equal(mig.at(-1).version >= 5, true); const m5 = mig.find((m) => m.version === 5);
  const dir = mkdtempSync(join(tmpdir(), 'udt-mig-')); for (const m of mig.filter((x) => x.version <= 4)) writeFileSync(join(dir, m.name), m.sql);
  const dir5 = mkdtempSync(join(tmpdir(), 'udt-mig5-')); for (const m of mig.filter((x) => x.version <= 5)) writeFileSync(join(dir5, m.name), m.sql);   // F12: 0006 diuji di tests/19
  const admin = new pg.Client({ connectionString: ADMIN }); await admin.connect();
  const name = 'udt_mig5_' + Math.random().toString(16).slice(2, 8); await admin.query(`CREATE DATABASE ${name}`);
  const u = new URL(ADMIN); u.pathname = '/' + name; const url = u.toString(); const o = new pg.Client({ connectionString: url });
  try {
    await migrate(url, dir); await o.connect();
    await o.query("INSERT INTO analyst(name) VALUES ('Orang Lama'),('Orang Lama 2')");
    await o.query("INSERT INTO compile(product_name,strength,dosage_form,title,created_by) VALUES ('P','1 mg','Tablet','Development of P',(SELECT analyst_id FROM analyst WHERE name='Orang Lama'))");
    await o.query("INSERT INTO audit_event(analyst_id,action,entity_type) SELECT analyst_id,'compile_create','compile' FROM analyst WHERE name='Orang Lama'");
    const snap = async () => JSON.stringify([(await o.query('SELECT * FROM analyst ORDER BY analyst_id')).rows.filter((r) => r.name !== 'import/sistem'), (await o.query('SELECT product_name,created_by FROM compile')).rows, (await o.query('SELECT analyst_id,action FROM audit_event')).rows]);
    const before5 = await snap();
    const up = await migrate(url, dir5); assert.deepEqual(up.applied, ['0005_akun_pengguna.sql']);
    assert.equal(await snap(), before5, 'expand tidak mengubah/menghapus data lama');
    assert.equal(Number((await o.query('SELECT count(*) n FROM app_user')).rows[0].n), 1);
    assert.equal((await o.query("SELECT i.legacy, u.display_name FROM analyst_identity i JOIN app_user u USING (user_id) WHERE i.analyst_name='Orang Lama'")).rows[0].display_name, 'import/sistem');
    await o.query(readFileSync(join(REPO, 'db', 'down', '0005_down.sql'), 'utf8'));
    assert.equal((await o.query("SELECT to_regclass('public.app_user') t, (SELECT count(*) FROM information_schema.columns WHERE table_name='audit_event' AND column_name='user_id') c1, (SELECT count(*) FROM information_schema.columns WHERE table_name='login_attempt' AND column_name='email_key') c2")).rows[0].t, null);
    assert.equal(await snap(), before5, 'mundur mengembalikan keadaan 0004; data lama utuh');
    assert.equal(Number((await o.query('SELECT max(version) v FROM schema_migration')).rows[0].v), 4);
    const again = await migrate(url, dir5); assert.deepEqual(again.applied, ['0005_akun_pengguna.sql']);   // maju lagi (hash sama)
    assert.equal(await snap(), before5);
    assert.equal(m5.sha256, (await o.query('SELECT sha256 FROM schema_migration WHERE version=5')).rows[0].sha256);
  } finally { await o.end().catch(() => {}); await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); await admin.end(); }
});

// ---------------- gerbang halaman (S-1 lanjutan) ----------------
test('Gerbang halaman: tanpa sesi, / dan /compiler hanya halaman masuk; berkas aplikasi 401; setelah masuk tersaji; kata sandi sementara diarahkan ke Ganti kata sandi', async () => {
  const anon = new Client('10.60.0.1'); const studio = rd('index.html'), app = rd('compiler/app.js');
  for (const p of ['/', '/index.html', '/compiler', '/compiler/', '/compiler/index.html', '/masuk']) {
    const r = await anon.get(p); assert.equal(r.status, 200, p); assert.match(r.text, /Masuk/); assert.match(r.text, /id="em"/);
    assert.doesNotMatch(r.text, /calcBatchWithStdMapping|udtBridge|UDT Compiler · /, 'isi aplikasi tidak bocor: ' + p); assert.ok(r.text.length < 8000);
    assert.match(r.headers.get('content-security-policy'), /default-src 'self'/); assert.equal(r.headers.get('cache-control'), 'private, no-store');
  }
  for (const p of ['/compiler/app.js', '/compiler/compiler.css', '/compiler/index.html?x=1'.replace('?x=1', '') + '/../app.js', '/studio-ext/kirim.js', '/studio-ext/akun.js']) { const r = await anon.get(p); assert.ok([401, 404].includes(r.status), p + ' ' + r.status); assert.ok(!(r.text || '').includes('function')); }
  assert.equal((await anon.get('/compiler/..%2f..%2fserver%2fapp.js')).status, 404); assert.equal((await anon.get('/server/app.js')).status, 404);
  assert.equal((await anon.get('/ganti-sandi')).status, 200); assert.match((await anon.get('/ganti-sandi')).text, /id="em"/, 'tanpa sesi: halaman masuk');
  const cookieOnlyBad = new Client('10.60.0.1'); cookieOnlyBad.cookie = 'udt_session=palsu.palsu'; assert.match((await cookieOnlyBad.get('/')).text, /id="em"/);
  const c = await loggedIn('Halaman Uji', '10.60.0.2');
  const s = await c.get('/studio-app'); assert.equal(s.status, 200); assert.equal(s.text.length, studio.length); assert.match(s.text, /studio-ext\/akun\.js/);   // F14: isi Studio pindah dari / ke /studio-app; / = Beranda
  const hm = await c.get('/'); assert.equal(hm.status, 200); assert.doesNotMatch(hm.text, /studio-ext\/akun\.js|calcBatchWithStdMapping/);
  const cp = await c.get('/compiler'); assert.equal(cp.status, 200); assert.match(cp.text, /UDT Compiler/);
  assert.equal((await c.get('/compiler/app.js')).text.length, app.length); assert.equal((await c.get('/studio-ext/kirim.js')).status, 200);
  assert.equal((await c.get('/masuk')).status, 302); assert.match((await c.get('/ganti-sandi')).text, /Ganti kata sandi/); assert.match((await c.get('/ganti-sandi')).text, /Halaman Uji/);
  assert.equal((await c.call('POST', '/', {})).status, 405);
  await c.post('/api/auth/logout', {}); assert.match((await c.get('/')).text, /id="em"/, 'setelah logout kembali ke halaman masuk');
  const r = await readerLoggedIn('10.60.0.3'); assert.equal((await r.get('/')).status, 200); assert.equal((await r.get('/compiler')).status, 200);
});

test('Server Node nyata: tanpa sesi / dan /compiler = halaman masuk, berkas aplikasi 401; theme/ikon publik; berkas non-publik 404 (0 paparan)', async () => {
  const port = 19100 + Math.floor(Math.random() * 90);
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, ['server/node-server.mjs', String(port)], { cwd: REPO, stdio: 'ignore' });
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 150; i++) { try { await fetch(base + '/theme/pharos-theme.css'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
    for (const p of ['/', '/compiler']) { const r = await fetch(base + p); const t = await r.text(); assert.equal(r.status, 200); assert.match(t, /id="em"/); assert.ok(!t.includes('calcBatchWithStdMapping')); }
    for (const p of ['/compiler/app.js', '/studio-ext/kirim.js', '/compiler/compiler.css']) assert.equal((await fetch(base + p)).status, 401, p);
    for (const p of ['/theme/pharos-theme.css', '/theme/pharos-logo.png', '/icons/favicon.ico']) assert.equal((await fetch(base + p)).status, 200, p);
    for (const p of ['/server/auth.js', '/db/migrations/0005_akun_pengguna.sql', '/scripts/user_admin.mjs', '/tests/helpers/db.js', '/UDT%20Studio.html']) assert.equal((await fetch(base + p)).status, 404, p);
  } finally { child.kill(); }
});

// ---------------- skrip pengelolaan ----------------
test('scripts/user_admin.mjs: buat, daftar, setel ulang, ubah peran, nonaktifkan, seed; kata sandi sementara hanya ke berkas di luar repo, tidak ke layar', () => {
  const u = new URL(ADMIN); const env = { ...process.env, DATABASE_URL: `${u.protocol}//udt_app:${APP_PW}@${u.host}/${db.name}` };
  const dir = mkdtempSync(join(tmpdir(), 'udt-adm-')), out = join(dir, 'sandi.txt');
  const run = (...a) => spawnSync(process.execPath, ['scripts/user_admin.mjs', ...a], { cwd: REPO, env, encoding: 'utf8' });
  const noLeak = (r) => { const t = r.stdout + r.stderr; return !/[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}/.test(t) && !/scrypt\$/.test(t); };
  let r = run('create', '--email', 'skrip@pharos.id', '--name', 'Orang Skrip', '--role', 'penulis', '--out', out); assert.equal(r.status, 0, r.stderr); assert.ok(noLeak(r));
  const line = readFileSync(out, 'utf8').trim().split('\n').at(-1).split('\t'); assert.equal(line[0], 'skrip@pharos.id'); assert.match(line[1], /^[A-Za-z2-9-]{19}$/);
  r = run('create', '--email', 'skrip2@pharos.id', '--name', 'Orang Dua', '--role', 'penulis'); assert.notEqual(r.status, 0); assert.match(r.stderr, /--out/);
  r = run('create', '--email', 'skrip3@pharos.id', '--name', 'Orang Tiga', '--role', 'penulis', '--out', join(REPO, 'sandi.txt')); assert.notEqual(r.status, 0); assert.match(r.stderr, /dalam repo/); assert.ok(!existsSync(join(REPO, 'sandi.txt')));
  r = run('create', '--email', 'skrip@pharos.id', '--name', 'Orang Skrip', '--role', 'penulis', '--out', out); assert.notEqual(r.status, 0);
  r = run('list'); assert.equal(r.status, 0); assert.match(r.stdout, /skrip@pharos\.id\tOrang Skrip\tpenulis\taktif\tsandi-sementara/); assert.ok(noLeak(r));
  r = run('role', '--email', 'skrip@pharos.id', '--role', 'pembaca'); assert.equal(r.status, 0); assert.match(run('list').stdout, /Orang Skrip\tpembaca/);
  r = run('reset', '--email', 'skrip@pharos.id', '--out', out); assert.equal(r.status, 0); assert.ok(noLeak(r)); assert.equal(readFileSync(out, 'utf8').trim().split('\n').length, 2);
  r = run('deactivate', '--email', 'skrip@pharos.id'); assert.equal(r.status, 0); assert.match(run('list').stdout, /Orang Skrip\tpembaca\tnonaktif/);
  r = run('activate', '--email', 'skrip@pharos.id'); assert.equal(r.status, 0);
  const lst = join(dir, 'daftar.csv'); writeFileSync(lst, '# daftar INDRA\nseed.a@pharos.id, Seed Satu, penulis\nseed.b@pharos.id, Seed Dua, admin\nskrip@pharos.id, Orang Skrip, penulis\n');
  const out2 = join(dir, 'sandi2.txt'); r = run('seed', '--file', lst, '--out', out2); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /2 dibuat, 1 sudah ada/); assert.ok(noLeak(r));
  assert.equal(readFileSync(out2, 'utf8').trim().split('\n').length, 2);
  r = run('seed', '--file', lst, '--out', out2); assert.match(r.stdout, /0 dibuat, 3 sudah ada/);
  r = run('role', '--email', 'tidak@ada.id', '--role', 'admin'); assert.notEqual(r.status, 0);
  assert.equal(spawnSync(process.execPath, ['scripts/user_admin.mjs', 'list'], { cwd: REPO, env: { ...process.env, DATABASE_URL: '' }, encoding: 'utf8' }).status, 1);
});

test('Skrip seed memuat daftar dari berkas lokal: tidak ada nama/email pengguna nyata atau kata sandi di repo', () => {
  const files = spawnSync('git', ['-C', REPO, 'ls-files', '-z'], { encoding: 'utf8' }).stdout.split('\0').filter((f) => /\.(js|mjs|html|json|sql|md)$/.test(f) && !f.startsWith('tests/') && !f.startsWith('node_modules/') && !/^(ui-lama|sample-data|google-apps-script|cloudflare-worker)\//.test(f));
  for (const f of files.filter((x) => /^(server|scripts|db|compiler|studio-ext)\//.test(x) || ['index.html', 'vercel.json', 'package.json'].includes(x))) { const t = readFileSync(join(REPO, f), 'utf8'); assert.doesNotMatch(t, /Yonathan Christyanto|Ammarisa|@pharos\.id/i, f); }
});

// ---------------- UI ----------------
test('UI: Compiler tanpa kata sandi bersama; panel Pengguna hanya admin; Ganti kata sandi tersedia; nama analis dari akun; Studio: tombol Kirim hanya penulis ke atas', () => {
  const app = rd('compiler/app.js'), html = rd('compiler/index.html'), k = rd('studio-ext/kirim.js'), akun = rd('studio-ext/akun.js'), studio = rd('index.html');
  assert.doesNotMatch(html, /Kata sandi tim|l-pw|loginForm/); assert.doesNotMatch(app, /loginForm|l-pw|\/api\/auth\/login/);
  assert.match(html, /id="users"/); assert.match(html, /id="navU"[^>]*display:none/); assert.match(app, /isAdmin\(\)/); assert.match(app, /navU'\)\.style\.display = isAdmin\(\)/);
  assert.match(rd('server/shell.js'), /href="\/ganti-sandi"/); assert.doesNotMatch(html, /id="f-ana"[^>]*readonly/);   // F12: nama analis diketik
  assert.match(app, /ME\.role === 'penulis' \|\| ME\.role === 'admin'/); assert.match(app, /temporary_password/); assert.match(app, /hanya tampil sekali/);
  assert.doesNotMatch(app, /\/api\/me\/analyst/);
  assert.match(k, /card\.hidden = true/); assert.match(k, /role === 'penulis' \|\| r\.body\.role === 'admin'/); assert.doesNotMatch(k, /udtx-pw|\/api\/auth\/login|me\/analyst/);
  assert.match(studio, /studio-ext\/akun\.js/); assert.match(akun, /\/api\/auth\/logout/); assert.doesNotMatch(akun, /innerHTML/);
  assert.equal(rd('UDT Studio.html'), studio);
});

test('Penyimpanan kata sandi lama dihapus: server tidak lagi membaca UDT_*_PASSWORD_HASH; tidak ada hash/kata sandi di repo', () => {
  for (const f of ['server/app.js', 'server/auth.js', 'server/accounts.js', 'server/pages.js']) assert.doesNotMatch(rd(f), /UDT_(WRITER|READER|SHARED)_PASSWORD_HASH/);
  assert.doesNotMatch(rd('server/app.js'), /pwHash|rdHash/);
});
