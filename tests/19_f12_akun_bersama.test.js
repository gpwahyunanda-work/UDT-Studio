// F12: tiga akun bersama (Formdev, Andev = penulis; Admin = admin) lewat seed-env, masuk email ATAU username, nama analis DIKETIK, tanpa kunci per identitas saja.
// Tidak ada kata sandi tertanam: semua dibuat acak saat uji dan ditulis ke berkas sementara di luar repo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { createTestDb, APP_PW, ADMIN } from './helpers/db.js';
import { randomUUID } from 'node:crypto';
import { Client } from './helpers/http.js';
import { REPO, loadWorkbook, hasFixtures } from './helpers/fixtures.js';
import { readWorkbook } from '../server/import/sheetReader.js';
import { migrate, listMigrations } from '../db/migrate.mjs';
import { validateAnalystName } from '../server/accounts.js';
import { parseEnvFile, sharedFromEnv } from '../scripts/user_admin.mjs';

const rd = (f) => readFileSync(join(REPO, f), 'utf8');
const rnd = () => 'Pw-' + randomBytes(9).toString('hex');
const PW = { FORMULATION: rnd(), ANDEV: rnd(), ADMIN: rnd() };
const ENVTXT = (over = {}) => {
  const v = { FORMULATION_PHAROS_EMAIL: 'formdev@pharos.test', FORMULATION_PHAROS_USERNAME: 'Form.Dev', FORMULATION_PHAROS_PASSWORD: PW.FORMULATION,
    ANDEV_PHAROS_EMAIL: 'andev@pharos.test', ANDEV_PHAROS_USERNAME: 'An.Dev', ANDEV_PHAROS_PASSWORD: PW.ANDEV,
    ADMIN_PHAROS_EMAIL: 'admin@pharos.test', ADMIN_PHAROS_USERNAME: 'Adm.In', ADMIN_PHAROS_PASSWORD: PW.ADMIN, ...over };
  return '# berkas uji\n' + Object.entries(v).map(([k, x]) => `${k}=${x}`).join('\n') + '\n';
};
let db, dir, envFile, logs = [], seedOut;
const orig = { error: console.error, log: console.log, warn: console.warn };
const run = (...a) => { const u = new URL(ADMIN); return spawnSync(process.execPath, ['scripts/user_admin.mjs', ...a], { cwd: REPO, env: { ...process.env, DATABASE_URL: `${u.protocol}//udt_app:${APP_PW}@${u.host}/${db.name}` }, encoding: 'utf8' }); };
const login = (c, identity, password) => c.post('/api/auth/login', { identity, password });

before(async () => {
  for (const k of Object.keys(orig)) console[k] = (...a) => { logs.push(a.map(String).join(' ')); };
  db = await createTestDb('f12');
  dir = mkdtempSync(join(tmpdir(), 'udt-f12-')); envFile = join(dir, 'akun.env'); writeFileSync(envFile, ENVTXT());
  seedOut = run('seed-env', '--env-file', envFile);
});
after(async () => { Object.assign(console, orig); await db.drop(); });

test('seed-env: tiga akun dibuat (Formdev, Andev = penulis; Admin = admin), tanpa sandi sementara, hanya email dan peran dicetak, kata sandi tidak pernah tampil', async () => {
  assert.equal(seedOut.status, 0, seedOut.stderr);
  const t = seedOut.stdout + seedOut.stderr;
  for (const p of Object.values(PW)) assert.ok(!t.includes(p), 'kata sandi tidak boleh tercetak');
  assert.match(seedOut.stdout, /dibuat: Formdev <formdev@pharos\.test> peran penulis/); assert.match(seedOut.stdout, /dibuat: Andev <andev@pharos\.test> peran penulis/); assert.match(seedOut.stdout, /dibuat: Admin <admin@pharos\.test> peran admin/);
  const r = (await db.owner.query("SELECT display_name, role, must_change_password, is_active, username, password_hash FROM app_user WHERE NOT is_system ORDER BY display_name")).rows;
  assert.deepEqual(r.map((x) => [x.display_name, x.role, x.must_change_password, x.is_active]), [['Admin', 'admin', false, true], ['Andev', 'penulis', false, true], ['Formdev', 'penulis', false, true]]);
  for (const x of r) assert.match(x.password_hash, /^scrypt\$32768\$8\$3\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
});

test('seed-env menolak variabel kosong/hilang (pesan hanya menyebut NAMA variabel), berkas di dalam repo, dan berkas tak ada; tak ada perubahan data', async () => {
  const before = JSON.stringify((await db.owner.query('SELECT user_id, password_hash FROM app_user ORDER BY 1')).rows);
  for (const name of ['FORMULATION_PHAROS_PASSWORD', 'ANDEV_PHAROS_EMAIL', 'ADMIN_PHAROS_USERNAME', 'ADMIN_PHAROS_PASSWORD']) {
    const f = join(dir, 'kosong.env'); writeFileSync(f, ENVTXT({ [name]: '' }));
    const r = run('seed-env', '--env-file', f); assert.notEqual(r.status, 0, name); assert.ok(r.stderr.includes(name), name); for (const p of Object.values(PW)) assert.ok(!r.stderr.includes(p));
  }
  const f2 = join(dir, 'hilang.env'); writeFileSync(f2, ENVTXT().split('\n').filter((l) => !l.startsWith('ADMIN_PHAROS_EMAIL')).join('\n'));
  let r = run('seed-env', '--env-file', f2); assert.notEqual(r.status, 0); assert.match(r.stderr, /ADMIN_PHAROS_EMAIL/);
  r = run('seed-env', '--env-file', join(REPO, 'package.json')); assert.notEqual(r.status, 0); assert.match(r.stderr, /dalam repo/);
  r = run('seed-env', '--env-file', join(dir, 'tidak-ada.env')); assert.notEqual(r.status, 0);
  r = run('seed-env'); assert.notEqual(r.status, 0);
  assert.equal(JSON.stringify((await db.owner.query('SELECT user_id, password_hash FROM app_user ORDER BY 1')).rows), before);
  // 9 variabel dibaca dari satu berkas (parser)
  assert.equal(sharedFromEnv(parseEnvFile(envFile)).length, 3);
  assert.throws(() => sharedFromEnv({}), /FORMULATION_PHAROS_EMAIL.*ADMIN_PHAROS_PASSWORD/s);
});

test('seed-env idempoten: jalan ulang memperbarui kata sandi (hash baru, sesi lama mati), tidak menggandakan akun, analyst, atau mengubah nama tampilan', async () => {
  const c = new Client('10.30.0.1'); assert.equal((await login(c, 'formdev@pharos.test', PW.FORMULATION)).status, 200); assert.equal((await c.get('/api/me')).status, 200);
  const h1 = (await db.owner.query("SELECT password_hash h FROM app_user WHERE display_name='Formdev'")).rows[0].h;
  const PW2 = rnd(); const f = join(dir, 'ganti.env'); writeFileSync(f, ENVTXT({ FORMULATION_PHAROS_PASSWORD: PW2, ANDEV_PHAROS_EMAIL: 'andev2@pharos.test' }));
  const r = run('seed-env', '--env-file', f); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /diperbarui: Formdev/); assert.ok(!r.stdout.includes(PW2));
  assert.equal((await db.owner.query("SELECT count(*)::int n FROM app_user WHERE NOT is_system")).rows[0].n, 3);
  assert.equal((await db.owner.query("SELECT count(*)::int n FROM analyst WHERE name IN ('Formdev','Andev','Admin')")).rows[0].n, 3);
  assert.notEqual((await db.owner.query("SELECT password_hash h FROM app_user WHERE display_name='Formdev'")).rows[0].h, h1);
  assert.equal((await c.get('/api/me')).status, 401, 'sesi lama mati');
  assert.equal((await login(new Client('10.30.0.2'), 'formdev@pharos.test', PW.FORMULATION)).status, 401);
  assert.equal((await login(new Client('10.30.0.3'), 'formdev@pharos.test', PW2)).status, 200);
  assert.equal((await login(new Client('10.30.0.4'), 'andev2@pharos.test', PW.ANDEV)).status, 200, 'email diperbarui');
  // kembalikan berkas awal (dipakai tes berikutnya)
  assert.equal(run('seed-env', '--env-file', envFile).status, 0);
});

test('Masuk: email ATAU username, tanpa beda huruf besar-kecil; peran benar; galat generik sama untuk salah/tak dikenal', async () => {
  for (const [id, role, name] of [['FORMDEV@pharos.test', 'penulis', 'Formdev'], ['form.dev', 'penulis', 'Formdev'], ['FORM.DEV', 'penulis', 'Formdev'], ['Andev@Pharos.Test', 'penulis', 'Andev'], ['an.dev', 'penulis', 'Andev'], ['adm.in', 'admin', 'Admin'], ['ADMIN@pharos.test', 'admin', 'Admin']]) {
    const c = new Client('10.30.1.1'); const pw = PW[name === 'Formdev' ? 'FORMULATION' : name === 'Andev' ? 'ANDEV' : 'ADMIN'];
    const l = await login(c, id, pw); assert.equal(l.status, 200, id); assert.equal(l.json.role, role); assert.equal(l.json.must_change_password, false);
    assert.equal((await c.get('/api/me')).json.display_name, name);
  }
  const bad = [await login(new Client('10.30.1.2'), 'form.dev', 'salah-sekali-1'), await login(new Client('10.30.1.3'), 'tidak.ada', 'salah-sekali-1'), await login(new Client('10.30.1.4'), '', 'x'), await login(new Client('10.30.1.5'), 'form.dev', '')];
  for (const b of bad) assert.equal(b.status, 401);
  assert.equal(new Set(bad.map((b) => b.json.error)).size, 1, 'pesan sama');
  // kompatibel: kunci lama "email" tetap diterima
  assert.equal((await new Client('10.30.1.6').post('/api/auth/login', { email: 'form.dev', password: PW.FORMULATION })).status, 200);
});

test('Kebijakan kata sandi TIDAK memblokir sandi yang diset Wahyu (pendek/umum boleh masuk lewat seed-env); tetap berlaku saat ganti kata sandi', async () => {
  const f = join(dir, 'pendek.env'); writeFileSync(f, ENVTXT({ ADMIN_PHAROS_PASSWORD: 'abc' }));
  assert.equal(run('seed-env', '--env-file', f).status, 0);
  const c = new Client('10.30.2.1'); assert.equal((await login(c, 'adm.in', 'abc')).status, 200);
  assert.equal((await c.post('/api/auth/password', { current_password: 'abc', new_password: 'pendek' })).status, 400);
  assert.equal((await c.post('/api/auth/password', { current_password: 'abc', new_password: 'kata-sandi-baru-panjang-9' })).status, 200);
  assert.equal(run('seed-env', '--env-file', envFile).status, 0);   // kembali ke berkas awal
});

test('Rate limit: per (identitas, IP) dan per IP tetap; TIDAK ada kunci per identitas saja: email dan username akun sama berbagi hitungan; penyerang lain IP tidak mengunci tim', async () => {
  const a = new Client('10.30.3.1');
  for (let i = 0; i < 5; i++) assert.equal((await login(a, i % 2 ? 'form.dev' : 'formdev@pharos.test', 'salah-' + i)).status, 401);
  assert.equal((await login(a, 'form.dev', PW.FORMULATION)).status, 401, 'IP ini terkunci untuk akun ini walau lewat username (hitungan sama)');
  assert.equal((await login(a, 'formdev@pharos.test', PW.FORMULATION)).status, 401);
  assert.equal((await login(new Client('10.30.3.2'), 'form.dev', PW.FORMULATION)).status, 200, 'IP lain tidak ikut terkunci');
  // serangan terdistribusi: 30 gagal dari 30 IP berbeda ke akun yang sama tidak mengunci akun itu
  for (let i = 0; i < 30; i++) await login(new Client('10.31.0.' + (i + 1)), 'andev@pharos.test', 'tebak-' + i);
  assert.equal((await login(new Client('10.30.3.9'), 'andev@pharos.test', PW.ANDEV)).status, 200, 'akun bersama tidak terkunci oleh satu penyerang');
  assert.ok(!/perEmailFails/.test(rd('server/accounts.js')), 'kunci per identitas saja dihapus dari kode');
  // per IP: 30 gagal ke banyak identitas
  const sp = new Client('10.30.4.1'); for (let i = 0; i < 30; i++) await login(sp, `orang${i}`, 'x' + i);
  assert.equal((await login(sp, 'adm.in', PW.ADMIN)).status, 401, 'IP penyemprot tertahan');
});

test('Nama analis DIKETIK: validator 2-80 karakter, bukan hanya spasi, tanpa karakter kendali', () => {
  assert.equal(validateAnalystName('  Siti   Aminah  '), 'Siti Aminah'); assert.equal(validateAnalystName('Al'), 'Al'); assert.equal(validateAnalystName('x'.repeat(80)), 'x'.repeat(80)); assert.equal(validateAnalystName('Nafi\u2019ah \u00c9'), 'Nafi\u2019ah \u00c9');
  for (const bad of [undefined, null, 5, '', ' ', '   ', 'A', ' A ', 'x'.repeat(81), 'Ab\u0000c', 'Ab\tc', 'Ab\nc', 'Ab\u007fc', 'Ab\u0085c', ['Ab']]) assert.throws(() => validateAnalystName(bad), (e) => e.status === 400, JSON.stringify(bad));
});

test('Nama analis kosong/tidak valid = 400 pada SEMUA tulis (simpan run, ubah, hapus, pulihkan, impor xlsx/JSON, ingest commit, buat produk, alias); pratinjau dan dry tidak menuntut; tidak ada yang tersimpan', async () => {
  const w = new Client('10.30.5.1'); assert.equal((await login(w, 'form.dev', PW.FORMULATION)).status, 200);   // sengaja tanpa w.analyst
  const cnt = async () => JSON.stringify((await db.owner.query('SELECT (SELECT count(*) FROM compile)::int c, (SELECT count(*) FROM run)::int r, (SELECT count(*) FROM audit_event WHERE action<>\'user_create\')::int a, (SELECT count(*) FROM analyst)::int n')).rows[0]);
  const base = await cnt();
  const uuid = '11111111-1111-4111-8111-111111111111';
  const calls = [
    ['POST', '/api/products', { product_name: 'Tanpa Nama', strength: '1 mg', dosage_form: 'Tablet' }],
    ['POST', '/api/products/1/runs', { push_id: uuid }], ['PATCH', '/api/runs/1', { note: 'x' }], ['POST', '/api/runs/1/delete', { confirm: true, reason: 'x' }], ['POST', '/api/runs/1/restore', { reason: 'x' }],
    ['POST', '/api/compiles', { product_name: 'Tanpa Nama', strength: '1 mg', dosage_form: 'Tablet' }], ['POST', '/api/compiles/1/aliases', { alias: 'x' }],
    ['POST', '/api/ingest/commit', { push_id: uuid, package: {} }], ['POST', '/api/imports', {}],
  ];
  for (const [m, p, b] of calls) {
    for (const bad of [undefined, '', '   ', 'A', 'Ab\u0000c', 'x'.repeat(81)]) {
      const r = await w.call(m, p, bad === undefined ? b : { ...b, analyst_name: bad }, { analyst: null });
      assert.equal(r.status, 400, `${m} ${p} nama=${JSON.stringify(bad)} -> ${r.status} ${JSON.stringify(r.json)}`); assert.match(r.json.error, /Nama analis|Masukan tidak valid/);   // NUL ditolak pembaca JSON lebih dulu
    }
  }
  const x = await w.call('POST', '/api/imports/xlsx', undefined, { raw: Buffer.from('PK\u0003\u0004'), analyst: null, headers: { 'content-type': 'application/octet-stream' } });
  assert.equal(x.status, 400); assert.match(x.json.error, /Nama analis/);
  assert.equal(await cnt(), base, 'tidak ada compile/run/audit/analyst baru dari permintaan yang ditolak');
  // pratinjau tidak menuntut nama (dan dry xlsx tidak menuntut nama)
  assert.notEqual((await w.post('/api/products/1/runs/preview', {}, { analyst: null })).json?.error, 'Nama analis wajib diisi');
});

test('Nama diketik tercatat: audit memuat AKUN (user_id Formdev/Andev) DAN nama yang diketik; dua orang di satu akun bersama terbedakan; jejak run memuat keduanya', async () => {
  const f = new Client('10.30.6.1'); assert.equal((await login(f, 'form.dev', PW.FORMULATION)).status, 200);
  const a = new Client('10.30.6.2'); assert.equal((await login(a, 'an.dev', PW.ANDEV)).status, 200);
  const mk = (n) => ({ product_name: 'Produk F12 ' + n, strength: '5 mg', dosage_form: 'Tablet' });
  const p1 = await f.post('/api/compiles', { ...mk('A'), analyst_name: '  Siti   Aminah ' }, { analyst: undefined }); assert.equal(p1.status, 201, JSON.stringify(p1.json));
  const p2 = await f.post('/api/compiles', { ...mk('B'), analyst_name: 'Budi Santoso' }); assert.equal(p2.status, 201);
  const p3 = await a.post('/api/compiles', { ...mk('C'), analyst_name: 'Siti Aminah' }); assert.equal(p3.status, 201);
  const ev = (id) => db.owner.query("SELECT a.name, u.display_name AS account FROM audit_event e JOIN analyst a USING (analyst_id) JOIN app_user u ON u.user_id=e.user_id WHERE e.action='compile_create' AND e.entity_id=$1", [id]);
  assert.deepEqual((await ev(p1.json.compile_id)).rows, [{ name: 'Siti Aminah', account: 'Formdev' }]);
  assert.deepEqual((await ev(p2.json.compile_id)).rows, [{ name: 'Budi Santoso', account: 'Formdev' }]);
  assert.deepEqual((await ev(p3.json.compile_id)).rows, [{ name: 'Siti Aminah', account: 'Andev' }]);
  assert.equal((await db.owner.query('SELECT a.name FROM compile c JOIN analyst a ON a.analyst_id=c.created_by WHERE c.compile_id=$1', [p1.json.compile_id])).rows[0].name, 'Siti Aminah');
  assert.equal((await db.owner.query("SELECT count(*)::int n FROM analyst WHERE name='Siti Aminah'")).rows[0].n, 1);
});

test('Simpan/ubah/hapus/pulihkan run memakai nama diketik; jejak /api/runs/{id}/audit memuat analyst (diketik) dan account (akun); impor memakai nama diketik juga', { skip: hasFixtures ? false : 'fixture data/sheets/csv tidak ada' }, async () => {
  const f = new Client('10.30.7.1'); assert.equal((await login(f, 'form.dev', PW.FORMULATION)).status, 200);
  const imp = await f.post('/api/imports', readWorkbook(loadWorkbook('Vastrol20', 'Development of Vastrol 20 mg Tablet.xlsx', ['pH_1_2', 'pH_4_5', 'pH_6_8'])), { analyst: 'Pengimpor Satu' }); assert.equal(imp.status, 201, JSON.stringify(imp.json));
  const impEv = (await db.owner.query("SELECT a.name, u.display_name AS account FROM audit_event e JOIN analyst a USING (analyst_id) JOIN app_user u ON u.user_id=e.user_id WHERE e.action='import_sheet'")).rows; assert.deepEqual(impEv, [{ name: 'Pengimpor Satu', account: 'Formdev' }]);
  const PID = (await f.get('/api/products')).json.products.find((p) => /Vastrol/.test(p.name)).id;
  const body = { medium: '4,5', batch: 'F1200Z26A', variant: '', test_date: '2026-11-01', comparator: 'B41968', timepoints: [5, 10, 15, 20, 30, 45, 60], vessels: [{ no: 1, values: [78.7, 84.4, 87.3, 88.8, 90, 92, 95] }, { no: 2, values: [60, 70, 75, 80, 82, 85, 92] }, { no: 3, values: [55, 70, 76, 82, 84, 86, 93] }] };
  const sv = await f.call('POST', `/api/products/${PID}/runs`, { ...body, push_id: randomUUID() }, { analyst: 'Pemeriksa Satu' }); assert.equal(sv.status, 201, JSON.stringify(sv.json));
  const rid = sv.json.run_id;
  assert.equal((await f.call('PATCH', '/api/runs/' + rid, { note: 'catatan' }, { analyst: 'Pemeriksa Dua' })).status, 200);
  assert.equal((await f.call('POST', `/api/runs/${rid}/delete`, { confirm: true, reason: 'salah input' }, { analyst: 'Pemeriksa Tiga' })).status, 200);
  assert.equal((await f.call('POST', `/api/runs/${rid}/restore`, { reason: 'ternyata benar' }, { analyst: '  Pemeriksa   Empat ' })).status, 200);
  const au = (await f.get('/api/runs/' + rid + '/audit')).json.events;
  assert.deepEqual(au.filter((e) => e.action !== 'ingest_commit').map((e) => [e.action, e.analyst, e.account]), [['run_create', 'Pemeriksa Satu', 'Formdev'], ['run_update', 'Pemeriksa Dua', 'Formdev'], ['run_delete', 'Pemeriksa Tiga', 'Formdev'], ['run_restore', 'Pemeriksa Empat', 'Formdev']]);
  const rm = (await f.get(`/api/compiles/${PID}/removed`)).json; assert.ok(Array.isArray(rm.runs));
  // simpan oleh akun lain dengan nama yang sama: dua akun, satu nama, tetap terbedakan lewat akun
  const a = new Client('10.30.7.2'); assert.equal((await login(a, 'an.dev', PW.ANDEV)).status, 200);
  const sv2 = await a.call('POST', `/api/products/${PID}/runs`, { ...body, batch: 'F1200Z26B', push_id: randomUUID() }, { analyst: 'Pemeriksa Satu' }); assert.equal(sv2.status, 201);
  const ev2 = (await db.owner.query("SELECT a.name, u.display_name AS account FROM audit_event e JOIN analyst a USING (analyst_id) JOIN app_user u ON u.user_id=e.user_id WHERE e.action='ingest_commit' AND a.name='Pemeriksa Satu' ORDER BY e.event_id")).rows;
  assert.deepEqual(ev2.map((x) => x.account), ['Formdev', 'Andev']);
});

test('Panel Pengguna: admin punya akses; non-admin 403; TIDAK ada jalan membuat akun lain lewat UI/API (tombol tersembunyi + 403 tanpa env); admin tetap bisa setel ulang kata sandi akun lain', async () => {
  const adm = new Client('10.30.8.1'); assert.equal((await login(adm, 'adm.in', PW.ADMIN)).status, 200);
  const wr = new Client('10.30.8.2'); assert.equal((await login(wr, 'an.dev', PW.ANDEV)).status, 200);
  assert.equal((await wr.get('/api/admin/users')).status, 403);
  const users = (await adm.get('/api/admin/users')).json.users; assert.deepEqual(users.map((u) => u.display_name).sort(), ['Admin', 'Andev', 'Formdev']);
  const saved = process.env.UDT_ALLOW_ACCOUNT_CREATE; delete process.env.UDT_ALLOW_ACCOUNT_CREATE;
  try { const r = await adm.post('/api/admin/users', { email: 'baru@pharos.test', display_name: 'Orang Baru', role: 'penulis' }); assert.equal(r.status, 403); assert.match(r.json.error, /dinonaktifkan/); assert.equal((await adm.get('/api/admin/users')).json.users.length, 3); }
  finally { process.env.UDT_ALLOW_ACCOUNT_CREATE = saved; }
  // admin menyetel ulang kata sandi akun lain (tetap dipakai): sementara, wajib ganti, sesi akun itu mati
  const fid = users.find((u) => u.display_name === 'Formdev').user_id;
  const rs = await adm.patch('/api/admin/users/' + fid, { reset_password: true }); assert.equal(rs.status, 200); assert.ok(rs.json.temporary_password);
  const f = new Client('10.30.8.3'); const l = await login(f, 'form.dev', rs.json.temporary_password); assert.equal(l.status, 200); assert.equal(l.json.must_change_password, true);
  assert.equal(run('seed-env', '--env-file', envFile).status, 0);   // pulihkan kredensial Wahyu
  // UI statis
  const html = rd('compiler/index.html'), app = rd('compiler/app.js');
  assert.match(html, /<form id="usForm" hidden[^>]*display:none/); assert.match(app, /isAdmin\(\)/); assert.match(app, /\/api\/admin\/users/, 'kode panel dipertahankan');
  assert.match(rd('server/shell.js'), /href="\/ganti-sandi"/);   // F14: tautan ada di sidebar
});

test('Tidak ada endpoint/halaman lupa kata sandi lewat email (dibatalkan Wahyu): tanpa /api/auth/forgot, /api/auth/reset, /lupa, /reset, SMTP, nodemailer', async () => {
  for (const p of ['/api/auth/forgot', '/api/auth/reset']) { const r = await new Client('10.30.9.1').post(p, { identity: 'form.dev' }); assert.ok([401, 404].includes(r.status), p + ' ' + r.status); }
  for (const p of ['/lupa', '/reset']) assert.equal((await new Client('10.30.9.1').get(p)).status, 404, p);
  assert.ok(!existsSync(join(REPO, 'server', 'mailer.js')));
  const pkg = JSON.parse(rd('package.json')); assert.ok(!('nodemailer' in (pkg.dependencies || {})));
  for (const f of ['server/app.js', 'server/accounts.js', 'server/pages.js', 'server/authz.js']) assert.doesNotMatch(rd(f), /SMTP_|nodemailer|\/api\/auth\/forgot|\/api\/auth\/reset/, f);
  assert.doesNotMatch(rd('db/migrations/0006_f12_akun_bersama.sql'), /password_reset|forgot_request/);
});

test('UI: nama analis diketik (tanpa readonly), diingat di sessionStorage, dikirim pada tiap tulis; Studio Kirim memiliki isian nama; login menerima email atau username', () => {
  const html = rd('compiler/index.html'), app = rd('compiler/app.js'), k = rd('studio-ext/kirim.js'), pages = rd('server/pages.js');
  assert.doesNotMatch(html, /id="f-ana"[^>]*readonly/); assert.match(html, /id="f-ana"[^>]*maxlength="80"/);
  assert.match(app, /sessionStorage\.getItem\(ANA_KEY\)/); assert.match(app, /sessionStorage\.setItem\(ANA_KEY/); assert.match(app, /body\.analyst_name = /); assert.match(app, /x-analyst-name/);
  assert.match(app, /mg-ana/); assert.doesNotMatch(app, /ME\.analyst/);
  assert.match(k, /udtx-ana/); assert.match(k, /sessionStorage\.getItem\(ANA_KEY\)/); assert.match(k, /analyst_name: anaValid\(ana\.value\)/); assert.match(k, /!anaValid\(ana\.value\)/);
  assert.match(pages, /Email atau username/); assert.match(pages, /identity:id/); assert.match(pages, /\$\('em'\)\.value\.trim\(\)/);
});

test('Migrasi 0006: dari 0005 berisi data -> maju (data utuh, username kosong) -> mundur -> maju lagi; username unik tanpa beda huruf, tanpa @/spasi', async () => {
  const mig = listMigrations(); assert.ok(mig.at(-1).version >= 6);   // F15: 0007 diuji di tests/21
  const dir5 = mkdtempSync(join(tmpdir(), 'udt-mig5-')); for (const m of mig.filter((x) => x.version <= 5)) writeFileSync(join(dir5, m.name), m.sql);
  const admin = new pg.Client({ connectionString: ADMIN }); await admin.connect();
  const name = 'udt_mig6_' + Math.random().toString(16).slice(2, 8); await admin.query(`CREATE DATABASE ${name}`);
  const u = new URL(ADMIN); u.pathname = '/' + name; const url = u.toString(); const o = new pg.Client({ connectionString: url });
  try {
    await migrate(url, dir5); await o.connect();
    await o.query("INSERT INTO analyst(name) VALUES ('Lama')"); await o.query("INSERT INTO app_user(email,display_name,role,password_hash,analyst_id) SELECT 'lama@x.id','Lama','penulis','!x',analyst_id FROM analyst WHERE name='Lama'");
    const snap = async () => JSON.stringify((await o.query('SELECT user_id,email,display_name,role,password_hash FROM app_user ORDER BY 1')).rows);
    const s0 = await snap();
    const dir6 = mkdtempSync(join(tmpdir(), 'udt-mig6x-')); for (const m of mig.filter((x) => x.version <= 6)) writeFileSync(join(dir6, m.name), m.sql);   // F15: 0007 diuji di tests/21
    const up = await migrate(url, dir6); assert.deepEqual(up.applied, ['0006_f12_akun_bersama.sql']); assert.equal(await snap(), s0);
    assert.equal((await o.query('SELECT username FROM app_user')).rows[0].username, null);
    await o.query("UPDATE app_user SET username='Abc.Def' WHERE email='lama@x.id'");
    await o.query("INSERT INTO analyst(name) VALUES ('Dua')");
    const ins = (un) => o.query("INSERT INTO app_user(email,username,display_name,role,password_hash,analyst_id) SELECT 'dua@x.id',$1,'Dua','penulis','!x',analyst_id FROM analyst WHERE name='Dua'", [un]);
    for (const bad of ['abc.def', 'a@b', 'a b', 'ab']) await assert.rejects(() => ins(bad), (e) => e.code === '23505' || e.code === '23514', bad);
    await o.query(readFileSync(join(REPO, 'db', 'down', '0006_down.sql'), 'utf8'));
    assert.equal((await o.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='app_user' AND column_name='username'")).rows[0].n, 0);
    assert.equal(await snap(), s0); assert.equal(Number((await o.query('SELECT max(version) v FROM schema_migration')).rows[0].v), 5);
    assert.deepEqual((await migrate(url, dir6)).applied, ['0006_f12_akun_bersama.sql']);
  } finally { await o.end().catch(() => {}); await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); await admin.end(); }
});

test('Tanpa rahasia: kata sandi dari berkas env tidak ada di log server, tabel audit/percobaan masuk, atau repo; tidak ada berkas env/kata sandi tertanam di repo', async () => {
  const everything = logs.join('\n') + JSON.stringify((await db.owner.query('SELECT * FROM audit_change')).rows) + JSON.stringify((await db.owner.query('SELECT * FROM audit_event')).rows) + JSON.stringify((await db.owner.query('SELECT * FROM login_attempt')).rows);
  for (const p of Object.values(PW)) assert.ok(!everything.includes(p), 'kata sandi bocor ke log/jejak');
  const out = spawnSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' }).stdout.split('\n');
  assert.ok(!out.some((f) => (/(^|\/)\.env/.test(f) || /\.env$/.test(f)) && !/\.env\.example$/.test(f)), 'tidak ada berkas .env di repo (selain .env.example)');
  for (const f of ['scripts/user_admin.mjs', 'server/accounts.js', 'tests/19_f12_akun_bersama.test.js']) assert.doesNotMatch(rd(f), /_PASSWORD\s*=\s*['"][^'"]{4,}/, f);
});
