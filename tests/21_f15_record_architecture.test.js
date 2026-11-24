// F15: /record (penelusur + CRUD terkontrol) dan /architecture. [LAPTOP: PostgreSQL 17 biasa]
// A: daftar putih vs katalog nyata. B: matriks otorisasi tabel x peran. C: kolom terlarang tak pernah muncul. D: injeksi. E: paginasi, cari, urut, filter, FK.
// F: CSV aman. G: CRUD (audit nama + alasan, kunci optimistik, hapus lunak, tanpa hapus keras). H: halaman Record/Architecture. I: migrasi 0007. J: jejak per run (C-2).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { createTestDb, ADMIN } from './helpers/db.js';
import { Client, loggedIn, readerLoggedIn, adminLoggedIn } from './helpers/http.js';
import { REPO, loadWorkbook, hasFixtures } from './helpers/fixtures.js';
import { readWorkbook } from '../server/import/sheetReader.js';
import { TABLES, WRITE, FORBIDDEN, PAGE_SIZE, CSV_CAP, csvCell, csvTable } from '../server/record.js';
import { query } from '../server/db.js';
import { loadCompileData } from '../server/compileData.js';
import { labelOfCode } from '../server/dashboard.js';
import { runProfile } from '../server/lib/udtBridge.js';
import { loadPageHost } from './helpers/pageHost.js';
import { PAGE_HEADERS, STUDIO_FRAME_HEADERS } from '../server/pageHeaders.js';
import { GATED_PATTERNS } from '../scripts/public_manifest.mjs';
import { mdToHtml } from '../server/shell.js';
import { listMigrations, migrate } from '../db/migrate.mjs';
import { buildPublic } from '../scripts/build_public.mjs';
import { check } from '../scripts/check_exposure.mjs';

const E10 = ['Empagliflozin10', 'Development of Empagliflozin 10 mg Tablet.xlsx'], V20 = ['Vastrol20', 'Development of Vastrol 20 mg Tablet.xlsx', ['pH_1_2', 'pH_4_5', 'pH_6_8']];
const orig = { error: console.error, log: console.log, warn: console.warn };
let db, A, W, R;
const opt = { skip: hasFixtures ? false : 'fixture data/sheets/csv tidak ada' };
const REC = '/api/record/tables';
const ROLES = () => ({ pembaca: R, penulis: W, admin: A });
const names = Object.keys(TABLES);
const body = (o = {}) => ({ analyst_name: 'Siti Nurhaliza', reason: 'Koreksi uji F15', ...o });
const rows = async (c, t, qs = '') => { const r = await c.get(`${REC}/${t}${qs}`); assert.equal(r.status, 200, `${t}${qs} ${JSON.stringify(r.json)}`); return r.json; };
const one = async (c, t, qs) => { const j = await rows(c, t, qs); assert.ok(j.rows.length >= 1, `baris ${t} ${qs}`); return j.rows[0]; };

before(async () => {
  for (const k of Object.keys(orig)) console[k] = () => {};
  db = await createTestDb('f15');
  A = await adminLoggedIn('10.15.0.1'); W = await loggedIn('Penulis F15', '10.15.0.2'); R = await readerLoggedIn('10.15.0.3');
  if (hasFixtures) for (const x of [E10, V20]) { const r = await A.post('/api/imports', readWorkbook(loadWorkbook(...x))); assert.equal(r.status, 201, JSON.stringify(r.json)); }
});
after(async () => { Object.assign(console, orig); await db.drop(); });

// ---------------------------------------------------------------- A. daftar putih = katalog nyata
test('A1 daftar putih: 23 tabel dasar; kolom tampil + kolom disembunyikan = kolom nyata di katalog; kolom rahasia tidak ada di daftar tampil', async () => {
  const cat = (await db.owner.query("SELECT table_name, array_agg(column_name::text ORDER BY ordinal_position) cols FROM information_schema.columns WHERE table_schema='public' AND table_name IN (SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE') GROUP BY 1")).rows;
  assert.deepEqual(cat.map((r) => r.table_name).sort(), [...names].sort(), 'tabel dasar di basis data = daftar putih (tabel baru wajib diputuskan)');
  assert.equal(names.length, 23);
  for (const r of cat) {
    const t = TABLES[r.table_name], shown = t.cols.filter((c) => !c.virtual).map((c) => c.name);
    assert.deepEqual([...shown, ...t.hidden].sort(), [...r.cols].sort(), `kolom ${r.table_name}: tiap kolom harus diputuskan (tampil atau disembunyikan)`);
    for (const f of FORBIDDEN) assert.ok(!shown.includes(f), `${r.table_name}.${f} tidak boleh tampil`);
  }
  assert.deepEqual(TABLES.app_user.cols.map((c) => c.name), ['user_id', 'display_name', 'email', 'role', 'is_active']);
  for (const [n, t] of Object.entries(TABLES)) for (const [c, ref] of Object.entries(t.fk)) { const [pt, pc] = ref.split('.'); assert.ok(TABLES[pt]?.cols.some((x) => x.name === pc), `${n}.${c} -> ${ref}`); assert.ok(t.cols.some((x) => x.name === c)); }
  const fks = (await db.owner.query("SELECT conrelid::regclass::text t, a.attname c, confrelid::regclass::text pt FROM pg_constraint k JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum = ANY(k.conkey) WHERE k.contype='f' AND cardinality(k.conkey)=1")).rows;
  for (const f of fks) { const t = TABLES[f.t]; if (t.hidden.includes(f.c)) continue; assert.ok(t.fk[f.c]?.startsWith(f.pt + '.'), `FK tunggal ${f.t}.${f.c} -> ${f.pt} harus punya tautan lompat`); }
});

// ---------------------------------------------------------------- B. matriks otorisasi
test('B1 matriks BACA tabel x peran: tanpa login 401; admin-only (app_user, audit_event, audit_change, login_attempt, schema_migration) 403 untuk non-admin; selebihnya 200 untuk semua peran', async () => {
  let cells = 0;
  for (const n of names) {
    assert.equal((await new Client('10.15.9.1').get(`${REC}/${n}`)).status, 401, n); cells++;
    for (const [role, c] of Object.entries(ROLES())) {
      const r = await c.get(`${REC}/${n}`); cells++;
      const want = TABLES[n].admin && role !== 'admin' ? 403 : 200;
      assert.equal(r.status, want, `${role} ${n}`);
      const csv = await c.get(`${REC}/${n}/csv`); assert.equal(csv.status, want, `csv ${role} ${n}`); cells++;
    }
  }
  assert.ok(cells >= 23 * 7);
  const lw = (await W.get(REC)).json.tables.map((t) => t.name), la = (await A.get(REC)).json.tables.map((t) => t.name);
  assert.equal(la.length, 23); assert.deepEqual(lw.filter((n) => TABLES[n].admin), []); assert.equal(lw.length, 18);
  assert.deepEqual(new Set((await R.get(REC)).json.tables.map((t) => t.name)), new Set(lw));
});

test('B2 matriks TULIS tabel x peran: pembaca 403; penulis/admin hanya pada tabel master yang diizinkan; tabel terukur/turunan/jejak/akun 403 (read_only) dengan tombol Perbaiki lewat Studio/Timpa', async () => {
  const wr = new Set(Object.keys(WRITE)); assert.deepEqual([...wr].sort(), ['batch', 'compile', 'compile_alias', 'medium', 'run']);
  for (const n of names) {
    const probes = [['POST', `${REC}/${n}/rows`, body({ values: {} })], ['PATCH', `${REC}/${n}/rows/1`, body({ row_token: 'a'.repeat(32), changes: { x: 1 } })], ['POST', `${REC}/${n}/rows/1/delete`, body({ row_token: 'a'.repeat(32) })], ['POST', `${REC}/${n}/rows/1/restore`, body({ row_token: 'a'.repeat(32) })]];
    for (const [m, p, b] of probes) {
      assert.equal((await R.call(m, p, b)).status, 403, `pembaca ${m} ${p}`);
      for (const [role, c] of [['penulis', W], ['admin', A]]) {
        const r = await c.call(m, p, b);
        if (TABLES[n].admin && role !== 'admin') assert.equal(r.status, 403, `${role} ${m} ${p}`);
        else if (!wr.has(n)) { assert.equal(r.status, 403, `${role} ${m} ${p} ${JSON.stringify(r.json)}`); assert.equal(r.json.read_only, true); }
        else assert.ok(![401, 403].includes(r.status) || (r.json && r.json.read_only), `${role} ${m} ${p} -> ${r.status}`);
      }
    }
  }
  for (const n of ['run_value', 'run_timepoint', 'comparison', 'comparison_point']) { const r = await W.patch(`${REC}/${n}/rows/1`, body({ row_token: 'a'.repeat(32), changes: { pct: 1 } })); assert.equal(r.status, 403); assert.equal(r.json.action.label, 'Perbaiki lewat Studio/Timpa'); assert.equal(r.json.action.href, '/studio'); }
  const meta = (await W.get(`${REC}/run_value`)).json.table; assert.equal(meta.readonly.action.label, 'Perbaiki lewat Studio/Timpa'); assert.equal(meta.can_write, false);
  assert.equal((await R.get(`${REC}/compile`)).json.table.can_write, false, 'pembaca: tidak ada kontrol tulis');
  assert.equal((await W.get(`${REC}/compile`)).json.table.can_write, true);
  // admin tidak bisa mengubah akun/hash dari Record
  for (const p of [['POST', `${REC}/app_user/rows`, body({ values: { email: 'x@y.id' } })], ['PATCH', `${REC}/app_user/rows/1`, body({ row_token: 'a'.repeat(32), changes: { password_hash: 'x' } })]]) { const r = await A.call(p[0], p[1], p[2]); assert.equal(r.status, 403); assert.equal(r.json.read_only, true); }
});

// ---------------------------------------------------------------- C. kolom terlarang
test('C1 kolom terlarang tak pernah muncul: nilai asli password_hash/ip_hash/email_key dan nama kolomnya tidak ada di respons mana pun (semua tabel, semua halaman 1, CSV, daftar)', async () => {
  await new Client('10.15.9.2').post('/api/auth/login', { email: 'tidak.ada@uji.test', password: 'salah-salah-salah' });   // pastikan login_attempt berisi ip_hash dan email_key
  const secrets = [];
  for (const r of (await db.owner.query('SELECT password_hash FROM app_user')).rows) secrets.push(r.password_hash);
  for (const r of (await db.owner.query('SELECT ip_hash, email_key FROM login_attempt')).rows) secrets.push(r.ip_hash, r.email_key);
  for (const r of (await db.owner.query('SELECT ip_hash FROM audit_event WHERE ip_hash IS NOT NULL')).rows) secrets.push(r.ip_hash);
  const uniq = [...new Set(secrets.filter((x) => x && x.length >= 16))]; assert.ok(uniq.length >= 6, 'ada rahasia nyata untuk dicari');
  const sink = [JSON.stringify((await A.get(REC)).json)];
  for (const n of names) { sink.push((await A.get(`${REC}/${n}`)).text ?? JSON.stringify((await A.get(`${REC}/${n}`)).json)); sink.push((await A.get(`${REC}/${n}/csv`)).text); }
  const blob = sink.join('\n');
  for (const s of uniq) assert.ok(!blob.includes(s), 'rahasia bocor: ' + s.slice(0, 8));
  assert.doesNotMatch(blob, /scrypt\$/);
  for (const f of FORBIDDEN) assert.ok(!blob.includes(f), `nama kolom ${f} muncul`);
  assert.ok(!/must_change_password|last_login_at|"username"/.test(blob), 'kolom akun lain yang disembunyikan');
  const au = (await A.get(`${REC}/app_user`)).json; assert.deepEqual(au.table.columns.map((c) => c.name), ['user_id', 'display_name', 'email', 'role', 'is_active']);
  for (const q of ['password_hash', 'ip_hash', 'token_version', 'email_key']) { assert.equal((await A.get(`${REC}/app_user?sort=${q}`)).status, 400); assert.equal((await A.get(`${REC}/login_attempt?f.${q}=a`)).status, 400); }
  // tidak ada jalur lain di API admin yang membuka hash
  const ul = JSON.stringify((await A.get('/api/admin/users')).json); assert.ok(!ul.includes('scrypt$'));
});

// ---------------------------------------------------------------- D. injeksi
test('D1 injeksi lewat nama tabel/kolom/urut/filter/cari/halaman: daftar putih menolak (400/404), nilai terikat; tabel dan data tetap utuh', async () => {
  const before = Number((await db.owner.query('SELECT count(*) n FROM run')).rows[0].n), tbl = Number((await db.owner.query("SELECT count(*) n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n);
  for (const t of ['compile;drop', 'COMPILE', 'pg_user', 'information_schema', '__proto__', 'constructor', 'compile%20x', '..%2f..%2fetc', 'compile%27--', 'run_visible', 'analyst_identity', 'pg_catalog.pg_user']) { const r = await W.get(`${REC}/${t}`); assert.ok([404].includes(r.status), `${t} -> ${r.status}`); }
  for (const s of ['product_name;DROP TABLE run', 'product_name%20desc', 'password_hash', '1', '(select%201)', '%22product_name%22', 'product_name,1', 'PRODUCT_NAME', 'x', '']) assert.equal((await W.get(`${REC}/compile?sort=${s}`)).status, 400, 'sort ' + s);
  for (const s of ['asc;--', 'sideways', 'ASC', '']) assert.equal((await W.get(`${REC}/compile?dir=${s}`)).status, 400, 'dir ' + s);
  for (const k of ['f.nope', 'f.product_name%22--', 'f.product_name%3Bdrop', 'fx.pg_user', 'f.', 'f.PRODUCT_NAME', 'g.product_name', 'limit', 'size', 'offset', 'sort2']) assert.equal((await W.get(`${REC}/compile?${k}=x`)).status, 400, 'param ' + k);
  for (const p of ['0', '-1', '1.5', 'abc', '99999999', '1e3', '%20']) assert.equal((await W.get(`${REC}/compile?page=${p}`)).status, 400, 'page ' + p);
  assert.equal((await W.get(`${REC}/compile?` + Array.from({ length: 9 }, () => 'f.title=a').join('&'))).status, 400);
  assert.equal((await W.get(`${REC}/compile?q=${'a'.repeat(201)}`)).status, 400);
  assert.equal((await W.get(`${REC}/compile?q=%00`)).status, 400);
  for (const q of ["' OR 1=1 --", "%'; DROP TABLE run; --", '" OR ""="', '\\', '%', '_', 'a\\']) { const j = await rows(W, 'compile', `?q=${encodeURIComponent(q)}`); assert.equal(j.total, 0, 'q ' + q); }
  const j = await rows(W, 'compile', `?fx.compile_id=${encodeURIComponent('1 OR 1=1')}`); assert.equal(j.total, 0);
  assert.equal(Number((await db.owner.query('SELECT count(*) n FROM run')).rows[0].n), before);
  assert.equal(Number((await db.owner.query("SELECT count(*) n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n), tbl);
  // tulis: nama kolom dari klien dicocokkan ke daftar
  const c = (await one(W, 'compile', '?sort=compile_id'));
  for (const k of ['api"=\'x\',"title', 'compile_id', 'created_by', 'name_key', '__proto__', 'constructor']) { const r = await W.patch(`${REC}/compile/rows/${c.pk.compile_id}`, body({ row_token: c.token, changes: JSON.parse(`{"${k.replace(/"/g, '\\"')}":"x"}`) })); assert.equal(r.status, 400, 'changes ' + k); }
  assert.equal((await W.post(`${REC}/compile/rows`, body({ values: { product_name: 'A', strength: 'B', dosage_form: 'C', created_by: 1 } }))).status, 400);
});

// ---------------------------------------------------------------- E. paginasi, cari, urut, filter, FK
test('E1 paginasi server-side 50/halaman: batas, halaman berurutan tanpa tumpang tindih, halaman melewati batas dijepit; urut, cari, filter kolom', opt, async () => {
  const p1 = await rows(W, 'run_value'); assert.equal(PAGE_SIZE, 50); assert.equal(p1.page_size, 50); assert.equal(p1.rows.length, 50); assert.ok(p1.total > 200); assert.equal(p1.pages, Math.ceil(p1.total / 50));
  const p2 = await rows(W, 'run_value', '?page=2'), key = (r) => JSON.stringify(r.pk);
  assert.equal(p2.rows.length, 50); assert.equal(new Set([...p1.rows, ...p2.rows].map(key)).size, 100);
  const last = await rows(W, 'run_value', `?page=${p1.pages}`); assert.equal(last.rows.length, p1.total - 50 * (p1.pages - 1));
  const over = await rows(W, 'run_value', `?page=${p1.pages + 500}`); assert.equal(over.page, p1.pages); assert.equal(over.rows.length, last.rows.length);
  const desc = await rows(W, 'run_value', '?sort=pct&dir=desc'); const v = desc.rows.map((r) => Number(r.c.pct)); assert.deepEqual(v, [...v].sort((a, b) => b - a));
  assert.equal(desc.sort, 'pct'); assert.equal(desc.dir, 'desc');
  const s = await rows(W, 'compile', '?q=vastrol'); assert.equal(s.total, 1); assert.match(s.rows[0].c.product_name, /Vastrol/i);
  const f = await rows(W, 'compile', '?f.product_name=empagli'); assert.equal(f.total, 1);
  const ex = await rows(W, 'compile', '?f.product_name=empagli&q=nonexist'); assert.equal(ex.total, 0);
  const all = await rows(W, 'run', '?sort=run_id&dir=asc'); const ids = all.rows.map((r) => r.c.run_id); assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
  const st = await rows(W, 'run', '?f.status=Terlihat'); assert.equal(st.total, all.total);
});

test('E2 tautan lompat PK/FK: kolom FK membawa tabel induk; filter persis (fx) mendarat tepat di baris induk; tipe dan PK tampil di metadata', opt, async () => {
  const run = await one(W, 'run', '?sort=run_id'), cols = Object.fromEntries((await rows(W, 'run')).table.columns.map((c) => [c.name, c]));
  assert.deepEqual(cols.batch_id.fk, { table: 'batch', col: 'batch_id' }); assert.deepEqual(cols.compile_id.fk, { table: 'compile', col: 'compile_id' }); assert.equal(cols.run_id.pk, true); assert.equal(cols.is_valid.type, 'bool');
  for (const [col, t] of [['batch_id', 'batch'], ['medium_id', 'medium'], ['compile_id', 'compile'], ['created_by', 'analyst']]) {
    const parent = await rows(W, t, `?fx.${cols[col].fk.col}=${run.c[col]}`); assert.equal(parent.total, 1, `${col} -> ${t}`); assert.equal(parent.rows[0].c[cols[col].fk.col], run.c[col]);
  }
  const rv = (await rows(W, 'run_value')).table.columns.find((c) => c.name === 'run_id'); assert.deepEqual(rv.fk, { table: 'run', col: 'run_id' });
  const cmp = (await rows(W, 'comparison')).table.columns; assert.deepEqual(cmp.find((c) => c.name === 'test_run_id').fk, { table: 'run', col: 'run_id' });
  assert.equal((await rows(W, 'run', `?fx.run_id=${run.c.run_id}`)).total, 1);
});

// ---------------------------------------------------------------- F. CSV
test('F1 unduh CSV tabel yang sedang dilihat (filter + urut sama), unduhan lampiran, BOM; cegah CSV injection: awalan = + - @ tab diberi tanda kutip; angka negatif sah tetap angka', async () => {
  assert.equal(csvCell('=1+1', 'text'), "'=1+1"); assert.equal(csvCell('+62812', 'text'), "'+62812"); assert.equal(csvCell('-2+3', 'text'), "'-2+3"); assert.equal(csvCell('@SUM(A1)', 'text'), "'@SUM(A1)");
  assert.equal(csvCell('\t=x', 'text'), "'\t=x".replace(/^(.*)$/, (m) => (/[",\r\n]|^\s|\s$/.test(m) ? '"' + m + '"' : m))); assert.equal(csvCell('-5.2', 'num'), '-5.2'); assert.equal(csvCell('-5.2', 'text'), "'-5.2"); assert.equal(csvCell('-1e3', 'num'), '-1e3'); assert.equal(csvCell('-abc', 'num'), "'-abc");
  assert.equal(csvCell('a,b', 'text'), '"a,b"'); assert.equal(csvCell('x"y', 'text'), '"x""y"'); assert.equal(csvCell(null, 'text'), ''); assert.equal(csvCell(false, 'bool'), 'false');
  for (const [i, nm] of ['=HYPERLINK("http://x","k")', '+cmd|calc', '-1+1', '@SUM(1)'].entries()) { const r = await W.post(`${REC}/compile/rows`, body({ values: { product_name: nm, strength: '1 mg', dosage_form: 'Tablet ' + i } })); assert.equal(r.status, 201, JSON.stringify(r.json)); }
  const r = await W.get(`${REC}/compile/csv?q=Tablet&sort=compile_id&dir=desc`);
  assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /text\/csv/); assert.match(r.headers.get('content-disposition'), /^attachment; filename="record_compile\.csv"$/); assert.equal(r.headers.get('x-truncated'), '0');
  assert.ok(r.text.startsWith('compile_id,'), 'header'); assert.equal((await csvTable(query, TABLES.compile, new URLSearchParams())).body.charCodeAt(0), 0xFEFF, 'BOM UTF-8 agar Excel membaca benar'); const lines = r.text.trim().split('\r\n'); assert.equal(lines.length - 1, Number(r.headers.get('x-row-count')));
  const j = await rows(W, 'compile', '?q=Tablet'); assert.equal(lines.length - 1, j.total, 'CSV = baris tersaring yang sedang dilihat');
  for (const bad of ['=HYPERLINK', '+cmd', '-1+1', '@SUM']) { const ln = lines.find((l) => l.includes(bad)); assert.ok(ln, bad); assert.ok(/(^|,)"?'[=+\-@]/.test(ln) && !/(^|,)"?[=+\-@]/.test(ln.replace(/'[=+\-@]/g, '')), 'diberi tanda kutip: ' + ln); }
  const ids = lines.slice(1).map((l) => Number(l.split(',')[0])); assert.deepEqual(ids, [...ids].sort((a, b) => b - a), 'urut desc ikut');
  assert.ok(CSV_CAP >= 10000); assert.equal((await R.get(`${REC}/compile/csv`)).status, 200);
  assert.equal((await W.get(`${REC}/compile/csv?sort=password_hash`)).status, 400);
});

// ---------------------------------------------------------------- G. CRUD terkontrol
let created;
test('G1 tambah baris compile: nama analis diketik + alasan wajib; jejak audit memuat nama, akun, alasan, nilai baru; kolom di luar daftar ditolak; duplikat 409', async () => {
  const v = { product_name: 'Zemtest', strength: '5 mg', dosage_form: 'Tablet', api: 'Ondansetron HCl', api_uncertain: true };
  assert.equal((await W.post(`${REC}/compile/rows`, { values: v, reason: 'x' })).status, 400, 'tanpa nama analis');
  assert.equal((await W.post(`${REC}/compile/rows`, { values: v, analyst_name: 'S' })).status, 400, 'tanpa alasan');
  assert.equal((await W.post(`${REC}/compile/rows`, body({ reason: '   ', values: v }))).status, 400, 'alasan kosong');
  assert.equal((await W.post(`${REC}/compile/rows`, body({ values: { ...v, strength: 5 } }))).status, 400, 'tipe salah');
  assert.equal((await W.post(`${REC}/compile/rows`, body({ values: { ...v, api_uncertain: 'ya' } }))).status, 400, 'bool salah');
  assert.equal((await W.post(`${REC}/compile/rows`, body({ values: { ...v, product_name: '' } }))).status, 400, 'wajib');
  assert.equal((await W.post(`${REC}/compile/rows`, body({ values: { ...v, title: 'x'.repeat(301) } }))).status, 400, 'terlalu panjang');
  const r = await W.post(`${REC}/compile/rows`, body({ reason: 'Produk baru uji F15', values: v })); assert.equal(r.status, 201, JSON.stringify(r.json)); created = r.json;
  assert.equal(created.row.c.title, 'Development of Zemtest 5 mg Tablet'); assert.equal(created.row.c.api_uncertain, true); assert.match(created.row.token, /^[0-9a-f]{32}$/);
  assert.equal((await W.post(`${REC}/compile/rows`, body({ values: v }))).status, 409, 'produk sama');
  const ev = (await db.owner.query("SELECT e.*, a.name analyst, u.display_name acct FROM audit_event e JOIN analyst a USING (analyst_id) LEFT JOIN app_user u ON u.user_id=e.user_id WHERE e.entity_type='compile' AND e.entity_id=$1 AND e.action='record_insert'", [created.id])).rows;
  assert.equal(ev.length, 1); assert.equal(ev[0].analyst, 'Siti Nurhaliza'); assert.equal(ev[0].acct, 'Penulis F15'); assert.equal(ev[0].reason, 'Produk baru uji F15');
  const ch = Object.fromEntries((await db.owner.query('SELECT field_name, old_value, new_value FROM audit_change WHERE event_id=$1', [ev[0].event_id])).rows.map((x) => [x.field_name, x]));
  assert.equal(ch.product_name.new_value, 'Zemtest'); assert.equal(ch.product_name.old_value, null); assert.equal(ch.api_uncertain.new_value, 'true');
});

test('G2 ubah baris: kunci optimistik (409 bila berubah sejak dibuka), jejak nilai lama dan baru + nama + alasan; mengoreksi API menghapus "API belum pasti" di Compiler', async () => {
  const id = created.id, d0 = (await A.get(`/api/products/${id}/dashboard`)); assert.equal(d0.status, 200); assert.equal(d0.json.product.api_uncertain, true);
  assert.ok(d0.json.findings.some((f) => /belum pasti/.test(f.text)), 'sebelum: catatan zat aktif belum pasti');
  const tok0 = created.row.token;
  assert.equal((await R.patch(`${REC}/compile/rows/${id}`, body({ row_token: tok0, changes: { api: 'X' } }))).status, 403);
  assert.equal((await W.patch(`${REC}/compile/rows/${id}`, { analyst_name: 'Siti Nurhaliza', row_token: tok0, changes: { api: 'X' } })).status, 400, 'tanpa alasan');
  assert.equal((await W.patch(`${REC}/compile/rows/${id}`, { reason: 'x', row_token: tok0, changes: { api: 'X' } })).status, 400, 'tanpa nama');
  assert.equal((await W.patch(`${REC}/compile/rows/${id}`, body({ changes: { api: 'X' } }))).status, 400, 'tanpa row_token');
  assert.equal((await W.patch(`${REC}/compile/rows/${id}`, body({ row_token: tok0, changes: { api: 'Zat Lama', api_uncertain: true } }))).status, 200);   // pembuka kedua yang lebih dulu menyimpan
  const stale = await A.patch(`${REC}/compile/rows/${id}`, body({ analyst_name: 'Admin Dua', row_token: tok0, changes: { api: 'Rosuvastatin Calcium' } }));
  assert.equal(stale.status, 409, 'token basi'); assert.equal(stale.json.conflict, true); assert.equal(stale.json.current.c.api, 'Zat Lama'); assert.notEqual(stale.json.current.token, tok0);
  assert.equal((await db.owner.query('SELECT api FROM compile WHERE compile_id=$1', [id])).rows[0].api, 'Zat Lama', 'baris tidak berubah oleh permintaan 409');
  const ok = await A.patch(`${REC}/compile/rows/${id}`, body({ analyst_name: 'Admin Dua', reason: 'Jawaban tim A-24: zat aktif Rosuvastatin', row_token: stale.json.current.token, changes: { api: 'Rosuvastatin Calcium' } }));
  assert.equal(ok.status, 200, JSON.stringify(ok.json)); assert.equal(ok.json.row.c.api, 'Rosuvastatin Calcium'); assert.equal(ok.json.row.c.api_uncertain, false); assert.deepEqual(ok.json.changed.sort(), ['api', 'api_uncertain']);
  const ev = (await db.owner.query("SELECT e.event_id, e.reason, a.name analyst, u.display_name acct FROM audit_event e JOIN analyst a USING (analyst_id) LEFT JOIN app_user u ON u.user_id=e.user_id WHERE e.entity_type='compile' AND e.entity_id=$1 AND e.action='record_update' ORDER BY e.event_id DESC LIMIT 1", [id])).rows[0];
  assert.equal(ev.analyst, 'Admin Dua'); assert.equal(ev.acct, 'Admin Uji'); assert.match(ev.reason, /A-24/);
  const ch = Object.fromEntries((await db.owner.query('SELECT field_name, old_value, new_value FROM audit_change WHERE event_id=$1', [ev.event_id])).rows.map((x) => [x.field_name, x]));
  assert.deepEqual([ch.api.old_value, ch.api.new_value], ['Zat Lama', 'Rosuvastatin Calcium']); assert.deepEqual([ch.api_uncertain.old_value, ch.api_uncertain.new_value], ['true', 'false']);
  const d1 = await A.get(`/api/products/${id}/dashboard`); assert.equal(d1.json.product.api_uncertain, false); assert.equal(d1.json.product.api, 'Rosuvastatin Calcium');
  assert.ok(!d1.json.findings.some((f) => /belum pasti/.test(f.text)), 'sesudah: catatan hilang di Compiler');
  assert.equal((await A.patch(`${REC}/compile/rows/${id}`, body({ row_token: ok.json.row.token, changes: { api: 'Rosuvastatin Calcium' } }))).status, 400, 'nilai sama = tidak ada perubahan');
  assert.equal((await A.patch(`${REC}/compile/rows/${id}`, body({ row_token: ok.json.row.token, changes: { project_code: 'ZEM-1' } }))).status, 200);
  assert.equal((await A.patch(`${REC}/compile/rows/${id}`, body({ row_token: 'f'.repeat(32), changes: { title: 'x' } }))).status, 409);
  assert.equal((await A.patch(`${REC}/compile/rows/999999`, body({ row_token: 'f'.repeat(32), changes: { title: 'x' } }))).status, 404);
  created.row = (await one(A, 'compile', `?fx.compile_id=${id}`));
});

test('G3 master lain: medium, batch, alias (tambah + ubah) lewat daftar putih; kode medium divalidasi; alias_key dihitung ulang; kolom identitas tidak bisa diubah', async () => {
  const cid = created.id, T = (t, r) => `${REC}/${t}/rows${r ? '/' + r : ''}`;
  assert.equal((await W.post(T('medium'), body({ values: { compile_id: cid, code: '9,9', full_name: 'x' } }))).status, 400); assert.equal((await W.post(T('medium'), body({ values: { compile_id: 987654, code: '1,2', full_name: 'x' } }))).status, 400);
  const m = await W.post(T('medium'), body({ values: { compile_id: cid, code: '1,2', full_name: 'Buffer pH 1,2', volume_text: '900 ml' } })); assert.equal(m.status, 201, JSON.stringify(m.json));
  assert.equal((await W.post(T('medium'), body({ values: { compile_id: cid, code: '1,2', full_name: 'Lain' } }))).status, 409, 'satu medium per kode');
  const mu = await W.patch(T('medium', m.json.id), body({ row_token: m.json.row.token, changes: { full_name: 'Simulated Gastric Fluid pH 1,2', apparatus: 'Apparatus 2' } })); assert.equal(mu.status, 200);
  assert.equal((await W.patch(T('medium', m.json.id), body({ row_token: mu.json.row.token, changes: { code: '4,5' } }))).status, 400); assert.equal((await W.patch(T('medium', m.json.id), body({ row_token: mu.json.row.token, changes: { compile_id: 1 } }))).status, 400);
  const b = await W.post(T('batch'), body({ values: { compile_id: cid, batch_no: 'ZB-001', brand_name: 'Zemtest 5 mg' } })); assert.equal(b.status, 201);
  assert.equal((await W.post(T('batch'), body({ values: { compile_id: cid, batch_no: 'ZB-001' } }))).status, 409);
  const bu = await W.patch(T('batch', b.json.id), body({ row_token: b.json.row.token, changes: { brand_name: 'Zemtest 5 mg Tablet (merek)' } })); assert.equal(bu.status, 200); assert.equal(bu.json.row.c.brand_name, 'Zemtest 5 mg Tablet (merek)');
  assert.equal((await W.patch(T('batch', b.json.id), body({ row_token: bu.json.row.token, changes: { batch_no: 'X' } }))).status, 400);
  const a = await W.post(T('compile_alias'), body({ values: { compile_id: cid, alias: 'Development of Zemtest 5 mg' } })); assert.equal(a.status, 201); assert.equal(a.json.row.c.source, 'analis');
  const au = await W.patch(T('compile_alias', a.json.id), body({ row_token: a.json.row.token, changes: { alias: 'Zemtest Lama 5 mg' } })); assert.equal(au.status, 200);
  assert.equal((await db.owner.query('SELECT alias_key FROM compile_alias WHERE alias_id=$1', [a.json.id])).rows[0].alias_key, 'zemtest lama 5 mg'.replace(/\s+/g, ''));
  for (const x of [m, b, a]) assert.equal((await db.owner.query("SELECT count(*)::int n FROM audit_event WHERE entity_id=$1 AND action='record_insert' AND reason IS NOT NULL", [x.json.id])).rows[0].n >= 1, true);
});

test('G4 run: ubah catatan/varian/produsen/status Valid-Tidak valid (alasan wajib), hapus lunak + pulihkan, kunci optimistik; baris run tetap ada; jejak per run memuat nama dan alasan', opt, async () => {
  const run = await one(W, 'run', '?sort=run_id&f.status=Terlihat'), id = run.pk.run_id, ra = `${REC}/run/rows/${id}`;
  const bad = await W.patch(ra, body({ row_token: run.token, changes: { is_valid: false } })); assert.equal(bad.status, 400, 'Tidak valid wajib beralasan');
  const up = await W.patch(ra, body({ reason: 'Vessel 3 pecah saat uji', row_token: run.token, changes: { is_valid: false, invalid_reason: 'Vessel 3 pecah', note: 'dicek ulang', manufacturer_site: 'Pharos Cikarang' } })); assert.equal(up.status, 200, JSON.stringify(up.json));
  assert.equal(up.json.row.c.is_valid, false); assert.equal(up.json.row.c.manufacturer_site, 'Pharos Cikarang');
  assert.equal((await W.patch(ra, body({ row_token: run.token, changes: { note: 'x' } }))).status, 409, 'token lama');
  const audit = (await W.get(`/api/runs/${id}/audit`)).json.events.filter((e) => e.action === 'record_update'); assert.equal(audit.length, 1); assert.equal(audit[0].analyst, 'Siti Nurhaliza'); assert.equal(audit[0].account, 'Penulis F15'); assert.match(audit[0].reason, /Vessel 3/);
  assert.deepEqual(audit[0].changes.map((c) => c.field).sort(), ['invalid_reason', 'is_valid', 'manufacturer_site', 'note']); assert.equal(audit[0].changes.find((c) => c.field === 'is_valid').old, 'true');
  const back = await W.patch(ra, body({ reason: 'Ternyata valid', row_token: up.json.row.token, changes: { is_valid: true } })); assert.equal(back.status, 200); assert.equal(back.json.row.c.invalid_reason, null);
  for (const k of ['content_hash', 'compile_id', 'batch_id', 'medium_id', 'test_date', 'created_by', 'source', 'status']) assert.equal((await W.patch(ra, body({ row_token: back.json.row.token, changes: { [k]: 'x' } }))).status, 400, k);
  // hapus lunak
  const total0 = Number((await db.owner.query('SELECT count(*) n FROM run')).rows[0].n), vis0 = Number((await db.owner.query('SELECT count(*) n FROM run_visible')).rows[0].n), rem0 = Number((await db.owner.query('SELECT count(*) n FROM run_removal')).rows[0].n);
  assert.equal((await W.post(`${ra}/delete`, body({ row_token: back.json.row.token, reason: '' }))).status, 400); assert.equal((await W.post(`${ra}/delete`, { analyst_name: 'S S', reason: 'x' })).status, 400, 'tanpa row_token');
  assert.equal((await W.post(`${ra}/delete`, body({ row_token: up.json.row.token }))).status, 409, 'token basi');
  const del = await W.post(`${ra}/delete`, body({ reason: 'Salah unggah', row_token: back.json.row.token })); assert.equal(del.status, 200, JSON.stringify(del.json)); assert.equal(del.json.row.c.status, 'Dihapus');
  assert.equal(Number((await db.owner.query('SELECT count(*) n FROM run')).rows[0].n), total0, 'baris tidak pernah dihapus'); assert.equal(Number((await db.owner.query('SELECT count(*) n FROM run_visible')).rows[0].n), vis0 - 1); assert.equal(Number((await db.owner.query('SELECT count(*) n FROM run_removal')).rows[0].n), rem0 + 1);
  assert.equal((await rows(W, 'run', `?fx.run_id=${id}`)).rows[0].c.status, 'Dihapus', 'tetap terlihat di Record dengan penanda Dihapus');
  assert.equal((await W.patch(ra, body({ row_token: del.json.row.token, changes: { note: 'x' } }))).status, 409, 'run terhapus tidak bisa diubah');
  assert.equal((await W.post(`${ra}/delete`, body({ row_token: del.json.row.token }))).status, 409, 'sudah dihapus');
  const res = await W.post(`${ra}/restore`, body({ reason: 'Dipulihkan: salah hapus', row_token: del.json.row.token })); assert.equal(res.status, 200); assert.equal(res.json.row.c.status, 'Terlihat');
  assert.equal(Number((await db.owner.query('SELECT count(*) n FROM run_visible')).rows[0].n), vis0);
  const acts = (await W.get(`/api/runs/${id}/audit`)).json.events.map((e) => [e.action, e.analyst, e.reason]); for (const a of ['run_delete', 'run_restore']) assert.ok(acts.some((x) => x[0] === a && x[1] === 'Siti Nurhaliza' && x[2]), a);
  assert.equal((await W.post(`${REC}/compile/rows/1/delete`, body({ row_token: 'a'.repeat(32) }))).status, 403, 'compile tidak punya hapus (lunak pun tidak ada)');
  assert.equal((await W.post(`${REC}/run/rows`, body({ values: { compile_id: 1 } }))).status, 403, 'run tidak ditambah dari Record');
  const ditimpa = (await db.owner.query("SELECT run_id FROM run_removal WHERE kind='ditimpa' LIMIT 1")).rows[0]; if (ditimpa) { const t = (await one(W, 'run', `?fx.run_id=${ditimpa.run_id}`)).token; assert.equal((await W.post(`${REC}/run/rows/${ditimpa.run_id}/restore`, body({ row_token: t }))).status, 409); }
});

test('G5 TANPA hapus keras: metode DELETE tidak ada; peran aplikasi tanpa hak DELETE pada tabel mana pun; tanpa hak ubah pada nilai terukur dan turunan; SQL DELETE ditolak basis data', async () => {
  assert.equal((await W.call('DELETE', `${REC}/run/rows/1`, body())).status, 404); assert.equal((await A.call('DELETE', `${REC}/compile/rows/1`, body())).status, 404);
  const t = (await db.owner.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).rows.map((r) => r.table_name);
  for (const n of t) assert.equal((await db.owner.query("SELECT has_table_privilege('udt_app', $1, 'DELETE') p", [n])).rows[0].p, false, `DELETE ${n}`);
  for (const n of ['run_value', 'run_timepoint', 'comparison', 'comparison_point', 'import_check', 'audit_event', 'audit_change']) assert.equal((await db.owner.query("SELECT has_table_privilege('udt_app', $1, 'UPDATE') p", [n])).rows[0].p, false, `UPDATE ${n}`);
  assert.equal((await db.owner.query("SELECT has_column_privilege('udt_app','run','content_hash','UPDATE') p")).rows[0].p, false);
  assert.equal((await db.owner.query("SELECT has_column_privilege('udt_app','app_user','display_name','UPDATE') p")).rows[0].p, false);
  await assert.rejects(() => db.app.query('DELETE FROM run_value'), (e) => e.code === '42501'); await assert.rejects(() => db.app.query('UPDATE run_value SET pct=0'), (e) => e.code === '42501'); await assert.rejects(() => db.app.query("UPDATE compile SET created_by=1 WHERE false"), (e) => e.code === '42501');
  const src = ['server/record.js'].map((f) => readFileSync(join(REPO, f), 'utf8')).join('\n'); assert.doesNotMatch(src, /\bDELETE\s+FROM\b/i, 'tidak ada SQL DELETE di lapisan Record');
});

// ---------------------------------------------------------------- H. halaman Record dan Architecture
const IDX = JSON.parse(readFileSync(join(REPO, 'architecture', 'index.json'), 'utf8'));
test('H1 /record: tanpa sesi halaman masuk; semua peran melihat kerangka (sidebar sama, Record aktif); aset gated; satu H1', async () => {
  const anon = new Client('10.15.9.5');
  for (const p of ['/record', '/architecture', '/architecture/erd-relasi']) { const r = await anon.get(p); assert.match(r.text, /id="em"/, p); assert.doesNotMatch(r.text, /udtSide|recTables|arcCards/, p); }
  for (const p of ['/shell/record.js', '/shell/record.css', '/shell/architecture.js', '/shell/architecture.css', '/architecture/index.json', '/architecture/erd.html', '/architecture/ERD_relasi.md', '/architecture/ERD_relasi.csv']) assert.equal((await anon.get(p)).status, 401, p);
  for (const [role, c] of Object.entries(ROLES())) {
    const r = await c.get('/record'); assert.equal(r.status, 200, role); assert.match(r.text, /id="udtSide"/); assert.match(r.text, /<a href="\/record" aria-current="page">/); assert.match(r.text, new RegExp(`id="rec" data-role="${role}"`));
    assert.match(r.text, /src="\/shell\/record\.js"/); assert.equal((r.text.match(/<h1[ >]/g) || []).length, 1, 'satu H1'); assert.doesNotMatch(r.text, /Segera hadir/);
    assert.equal(r.headers.get('content-security-policy'), PAGE_HEADERS['content-security-policy']); assert.equal(r.headers.get('x-frame-options'), 'DENY');
    for (const f of ['record.js', 'record.css']) assert.equal((await c.get('/shell/' + f)).status, 200);
  }
  const js = readFileSync(join(REPO, 'shell', 'record.js'), 'utf8'); assert.doesNotMatch(js, /\.innerHTML\s*=|insertAdjacentHTML|document\.write|eval\(/, 'data pengguna hanya lewat textContent');
});

test('H2 /architecture: daftar kartu dengan filter analis/teknis, 9 diagram dari index.json, sidebar sama; diagram disajikan sama-asal (SAMEORIGIN) hanya setelah masuk; ERD punya halaman tabel relasi teks', async () => {
  const r = await R.get('/architecture'); assert.equal(r.status, 200); assert.match(r.text, /<a href="\/architecture" aria-current="page">/); assert.match(r.text, /id="udtSide"/);
  assert.equal((r.text.match(/class="arc-card"/g) || []).length, IDX.diagram.length); assert.equal(IDX.diagram.length, 9);
  const an = IDX.diagram.filter((d) => d.tingkat === 'analis').length, te = IDX.diagram.filter((d) => d.tingkat === 'teknis').length;
  assert.equal((r.text.match(/data-level="analis"/g) || []).length, an); assert.equal((r.text.match(/data-level="teknis"/g) || []).length, te); assert.ok(an >= 3 && te >= 3);
  assert.match(r.text, /data-f="analis"/); assert.match(r.text, /data-f="teknis"/); assert.match(r.text, /href="\/architecture\/erd-relasi"/); assert.equal((r.text.match(/<h1[ >]/g) || []).length, 1);
  assert.equal(r.headers.get('x-frame-options'), 'DENY', 'halaman daftar tidak boleh dibingkai');
  for (const d of IDX.diagram) {
    const f = await W.get(`/architecture/${d.berkas}`); assert.equal(f.status, 200, d.berkas); assert.match(f.headers.get('content-type'), /text\/html/);
    assert.equal(f.headers.get('x-frame-options'), 'SAMEORIGIN'); assert.equal(f.headers.get('content-security-policy'), STUDIO_FRAME_HEADERS['content-security-policy']); assert.match(f.headers.get('content-security-policy'), /frame-ancestors 'self'/);
    assert.equal(f.headers.get('x-content-type-options'), 'nosniff'); assert.equal(f.headers.get('cache-control'), 'private, no-store');
    assert.equal(createHash('sha256').update(Buffer.from(readFileSync(join(REPO, 'architecture', d.berkas), 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10)))).digest('hex'), d.sha256, 'index.json cocok dengan berkas ' + d.berkas);
  }
  const rel = await R.get('/architecture/erd-relasi'); assert.equal(rel.status, 200); assert.match(rel.text, /<table>/); assert.match(rel.text, /app_user\.analyst_id/); assert.equal((rel.text.match(/<tr><td>\d+<\/td>/g) || []).length, 33, '33 baris relasi FK tampil sebagai tabel teks'); assert.match(rel.text, /id="udtSide"/);
  const ix = await W.get('/architecture/index.json'); assert.equal(ix.json.diagram.length, 9);
  for (const p of ['/architecture/../server/app.js', '/architecture/%2e%2e/server/app.js', '/architecture/tidak-ada.html', '/architecture/..%5cserver%5capp.js', '/architecture/%00.html']) { const x = await W.get(p); assert.ok([404, 400].includes(x.status), `${p} -> ${x.status}`); assert.doesNotMatch(String(x.text), /routeRecord/); }
  assert.equal((await W.call('POST', '/architecture/erd.html', {})).status, 405);
  for (const p of ['/compiler/..%5cserver%5capp.js', '/shell/..%5c..%5cserver%5cdb.js', '/architecture/..%5c..%5cpackage.json', '/studio-ext/%2e%2e%5cserver%5capp.js']) { const x = await W.get(p); assert.ok(x.status >= 400, `${p} -> ${x.status}`); assert.doesNotMatch(String(x.text), /routeRecord|DATABASE_URL|"name": "udt-studio"/); }
});

test('H3 Architecture: tanpa rahasia (kata sandi, URL basis data, token, kunci), tanpa sumber luar; markdown di-escape; berkas masuk daftar gated dan keluaran publik tidak memuatnya', async () => {
  const files = readdirSync(join(REPO, 'architecture')); assert.ok(files.length >= 12);
  const bad = [/postgres(ql)?:\/\/[^\s"'<]+:[^\s"'<@]+@/i, /\bsk-[A-Za-z0-9]{16,}/, /\bghp_[A-Za-z0-9]{20,}/, /\bAKIA[0-9A-Z]{16}/, /-----BEGIN [A-Z ]*PRIVATE KEY/, /\b(SESSION_SECRET|DATABASE_URL|API_KEY|PASSWORD)\s*[=:]\s*['"]?[A-Za-z0-9+/_-]{8,}/i, /scrypt\$\d+\$/, /\bBearer [A-Za-z0-9._-]{16,}/];
  for (const f of files) { const t = readFileSync(join(REPO, 'architecture', f), 'utf8'); for (const re of bad) assert.doesNotMatch(t, re, `${f}: ${re}`); }
  for (const f of files.filter((x) => x.endsWith('.html'))) { const t = readFileSync(join(REPO, 'architecture', f), 'utf8'); const ext = [...t.matchAll(/(?:<script[^>]*\ssrc|<img[^>]*\ssrc|<iframe[^>]*\ssrc|<link[^>]*\shref)=["'](https?:\/\/[^"']+)/g), ...t.matchAll(/@import[^;]*https?:\/\/[^;]+|url\(\s*['"]?https?:\/\/[^)]+/g)].map((m) => m[1] || m[0]); assert.deepEqual(ext, [], `${f}: tanpa sumber luar yang dimuat (tautan teks seperti kredit archify tidak dimuat dan diblokir CSP)`); }
  assert.match(mdToHtml('# T\n\n| a | b |\n|---|---|\n| <script>alert(1)</script> | `x` |\n\n- **k** <img src=x onerror=1>'), /&lt;script&gt;/); assert.doesNotMatch(mdToHtml('<script>alert(1)</script>\n- <b onmouseover=1>'), /<script|<b onmouseover/);
  for (const f of ['architecture/erd.html', 'architecture/index.json', 'architecture/ERD_relasi.md', 'architecture/ERD_relasi.csv', 'architecture/dataflow.html']) assert.ok(GATED_PATTERNS.some((re) => re.test(f)), f);
  const out = mkdtempSync(join(tmpdir(), 'udt-pub-')); buildPublic(out); const rep = await check({ dir: out }); assert.deepEqual(rep.servedNonPublic, [], 'keluaran publik hanya theme/ icons/: architecture/ tidak ikut');
  assert.ok(!existsSync(join(out, 'architecture')));
});

// ---------------------------------------------------------------- I. migrasi 0007
test('I1 migrasi 0007: dari 0006 berisi data -> maju (data utuh, hak kolom bertambah) -> mundur (hak dicabut, data utuh) -> maju lagi; tidak pernah memberi DELETE', async () => {
  const mig = listMigrations(); assert.equal(mig.at(-1).version, 7); assert.equal(mig.at(-1).name, '0007_f15_record.sql');
  const dir6 = mkdtempSync(join(tmpdir(), 'udt-mig6-')); for (const m of mig.filter((x) => x.version <= 6)) writeFileSync(join(dir6, m.name), m.sql);
  const admin = new pg.Client({ connectionString: ADMIN }); await admin.connect();
  const name = 'udt_mig7_' + Math.random().toString(16).slice(2, 8); await admin.query(`CREATE DATABASE ${name}`);
  const u = new URL(ADMIN); u.pathname = '/' + name; const url = u.toString(); const o = new pg.Client({ connectionString: url });
  try {
    await migrate(url, dir6); await o.connect();
    await o.query("INSERT INTO analyst(name) VALUES ('Lama')"); await o.query("INSERT INTO compile(product_name,strength,dosage_form,api,title,created_by) SELECT 'P','1 mg','Tablet','A','Development of P',analyst_id FROM analyst WHERE name='Lama'");
    const snap = async () => JSON.stringify((await o.query('SELECT * FROM compile ORDER BY 1')).rows);
    const can = async () => (await o.query("SELECT has_column_privilege('udt_app','compile','api','UPDATE') a, has_column_privilege('udt_app','run','manufacturer_site','UPDATE') b, has_column_privilege('udt_app','medium','full_name','UPDATE') c, has_column_privilege('udt_app','batch','brand_name','UPDATE') d, has_column_privilege('udt_app','compile_alias','alias','UPDATE') e")).rows[0];
    const s0 = await snap(); assert.deepEqual(await can(), { a: false, b: false, c: false, d: false, e: false });
    assert.deepEqual((await migrate(url)).applied, ['0007_f15_record.sql']); assert.equal(await snap(), s0); assert.deepEqual(await can(), { a: true, b: true, c: true, d: true, e: true });
    for (const t of ['compile', 'medium', 'batch', 'run', 'compile_alias', 'run_value', 'comparison']) assert.equal((await o.query("SELECT has_table_privilege('udt_app',$1,'DELETE') p", [t])).rows[0].p, false);
    await o.query(readFileSync(join(REPO, 'db', 'down', '0007_down.sql'), 'utf8'));
    assert.deepEqual(await can(), { a: false, b: false, c: false, d: false, e: false }); assert.equal(await snap(), s0); assert.equal(Number((await o.query('SELECT max(version) v FROM schema_migration')).rows[0].v), 6);
    assert.deepEqual((await migrate(url)).applied, ['0007_f15_record.sql']);
  } finally { await o.end().catch(() => {}); await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`); await admin.end(); }
});

// ---------------------------------------------------------------- J. jejak per run saat simpan (F13 C-2)
test('J1 jejak per run saat simpan: setiap run baru punya entri run_create (nama diketik + akun) di /api/runs/{id}/audit', opt, async () => {
  const run = await one(W, 'run', '?sort=run_id'); const ev = (await W.get(`/api/runs/${run.pk.run_id}/audit`)).json.events;
  const c = ev.find((e) => e.action === 'run_create'); assert.ok(c, JSON.stringify(ev)); assert.equal(c.analyst, 'Admin Uji'); assert.equal(c.account, 'Admin Uji'); assert.ok(c.changes.some((x) => x.field === 'sumber' && x.new === 'sheet'));
  const n = Number((await db.owner.query("SELECT count(*) n FROM audit_event WHERE action='run_create'")).rows[0].n), r = Number((await db.owner.query('SELECT count(*) n FROM run')).rows[0].n); assert.equal(n, r, 'satu entri per run');
});

// ---------------------------------------------------------------- K. RSD = aturan Langkah 4 (jawaban tim P-2)
test('K1 temuan "RSD di atas batas" = hitung ulang dengan fungsi ASLI Studio (evalSimilarityF2) pada data Vastrol, Empagliflozin 10/25, Zemyc, Gionix; batas titik pertama/berikutnya dari Studio; tanpa angka batas di server', opt, async () => {
  for (const x of [['Empagliflozin25', 'Development of Empagliflozin 25 mg Tablet.xlsx', ['UDT_Release', 'UDT_pH_1_2', 'UDT_pH_4_5', 'UDT_pH_6_8']], ['Zemyc150', 'Development of Zemyc 150 mg Kapsul.xlsx'], ['Gionix16', 'Development of Gionix 16 mg Tab.xlsx']]) { const r = await A.post('/api/imports', readWorkbook(loadWorkbook(...x))); assert.equal(r.status, 201, x[0]); }
  const host = loadPageHost(), prods = (await A.get('/api/products')).json.products; assert.ok(prods.length >= 5); let flagged = 0, points = 0;
  for (const p of prods) {
    const dash = (await A.get(`/api/products/${p.id}/dashboard`)).json, data = await loadCompileData(query, p.id), byId = new Map(data.runs.map((r) => [r.run_id, r])), want = new Map();
    for (const e of dash.runs) for (const [code, pr] of Object.entries(e.prof)) {
      if (!pr.valid) continue; const r = byId.get(pr.run_id), prof = runProfile(host, r.minutes, r.vessels); if (prof.error) continue;
      const ev = host.evalSimilarityF2(prof.times, prof.means, prof.means, prof.stats, prof.stats);
      if (ev.rsdExceeded) want.set(`${e.comp ? `${e.product} (${e.code})` : e.key}|${labelOfCode(code)}`, ev.rsdDetails);
    }
    const got = dash.findings.filter((f) => f.kind === 'rsd'); flagged += got.length;
    assert.deepEqual(got.map((f) => `${f.batch}|${f.medium}`).sort(), [...want.keys()].sort(), p.name);
    for (const f of got) for (const d of want.get(`${f.batch}|${f.medium}`)) { const m = /^menit (\S+)' \(Limit (\S+)%/.exec(d); assert.ok(m, d); points++; assert.ok(f.text.includes(`${m[1]} menit`) && f.text.includes(`batas ${m[2]}%`), `${p.name} ${f.batch}: ${f.text} <- ${d}`); }
  }
  assert.ok(flagged >= 20 && points >= 40, `temuan nyata ada (${flagged}, ${points})`);
  const src = ['server/dashboard.js', 'server/products.js', 'server/lib/udtBridge.js'].map((f) => readFileSync(join(REPO, f), 'utf8')).join(String.fromCharCode(10));
  assert.doesNotMatch(src, /rsdLimit|<=\s*10\s*\?\s*20|\?\s*20\s*:\s*10/, 'tidak ada angka batas RSD di server');
});
