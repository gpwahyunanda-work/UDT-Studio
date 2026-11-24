// IQ-05..08, IQ-10..13, IQ-15, IQ-17(bagian jejak), IQ-20, IQ-23, IQ-24, IQ-27 + skenario 1, 2 (impor + simpan) [LAPTOP: handler + PostgreSQL 17 biasa]
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestDb, TEST_PASSWORD } from './helpers/db.js';
import { coherentF2 } from './helpers/f2.js';
import { Client, loggedIn, ensureUser, BASE } from './helpers/http.js';
import { loadWorkbook, hasFixtures } from './helpers/fixtures.js';
import { readWorkbook } from '../server/import/sheetReader.js';
import { signSession } from '../server/auth.js';

let t, A;
before(async () => { t = await createTestDb('api'); A = t.app; });
after(async () => { await t.drop(); });
const cnt = async (tbl, where = '', p = []) => Number((await A.query(`SELECT count(*) n FROM ${tbl} ${where}`, p)).rows[0].n);
const opt = { skip: hasFixtures ? false : 'fixture data/sheets/csv tidak ada' };

// ---------- paket Studio kecil ----------
const mkRun = (o) => ({ key: o.key, medium_code: 'Release', brand_name: o.brand || 'Uji X', batch_no: o.batch || 'B1', role: o.role || 'uji', variant: o.variant || '', test_date: 'date' in o ? o.date : '2026-11-01', manufacturer_site: 'Site A', timepoints: o.tp || [5, 15, 30], values: o.values || [{ no: 1, values: [10, 50, 90] }, { no: 2, values: [12, 52, 92] }, { no: 3, values: [11, 51, null] }] });
const mkPkg = (compile_id, runs, cmp = true) => coherentF2({
  compile_id, mediums: [{ code: 'Release', full_name: 'Release (HCl 0,1N)', volume_text: '900 ml' }], runs,
  comparisons: cmp ? runs.filter(r => r.role === 'uji').map(r => ({ testKey: r.key, refKey: runs.find(x => x.role === 'reference').key, n_points: 3, f2: 50.5, conclusion_code: 'similar', total_sq: 12.5, points: [{ seq: 1, sq_diff: 1.5 }] })) : [],
});
const baseRuns = () => [mkRun({ key: 'ref', role: 'reference', brand: 'Ref', batch: 'R1' }), mkRun({ key: 'u1', batch: 'U1' })];
async function newCompile(c, name = 'ProdukUji') { const r = await c.post('/api/compiles', { product_name: name, strength: '10 mg', dosage_form: 'Tablet' }); assert.equal(r.status, 201, JSON.stringify(r.json)); return r.json.compile_id; }

test('IQ-27 health: versi dan versi skema, tanpa rahasia', async () => {
  const r = await new Client().get('/api/health');
  assert.equal(r.status, 200); assert.equal(r.json.ok, true); assert.equal(r.json.schema_version, 6);
  assert.doesNotMatch(JSON.stringify(r.json), /postgres|password|secret|udt_app/i);
});

test('Semua rute selain login dan health menuntut sesi (401)', async () => {
  const c = new Client();
  for (const [m, p] of [['GET', '/api/me'], ['GET', '/api/compiles'], ['GET', '/api/compiles/1'], ['GET', '/api/imports/1/report'], ['POST', '/api/compiles'], ['POST', '/api/ingest/preview'], ['POST', '/api/ingest/commit'], ['POST', '/api/imports'], ['PUT', '/api/me/analyst']]) {
    const r = await c.call(m, p, m === 'GET' ? undefined : {});
    assert.equal(r.status, 401, `${m} ${p}`);
  }
});

test('IQ-05 login (email + kata sandi): salah/benar, pesan sama, batas per (email, IP)', async () => {
  const email = await ensureUser('Hanifa', 'penulis');
  const bad = new Client('10.9.9.1');
  const outs = [];
  for (let i = 0; i < 5; i++) outs.push(await bad.post('/api/auth/login', { email, password: 'salah-sekali-' + i }));
  assert.ok(outs.every(o => o.status === 401 && o.json.error === outs[0].json.error));
  const locked = await bad.post('/api/auth/login', { email, password: TEST_PASSWORD });       // benar, tetapi (email, IP) ini sudah dibatasi
  assert.equal(locked.status, 401); assert.equal(locked.json.error, outs[0].json.error); assert.equal(locked.setCookie, null);
  const other = new Client('10.9.9.2'); assert.equal((await other.post('/api/auth/login', { email, password: TEST_PASSWORD })).status, 200);   // IP lain tidak terkunci
  assert.ok(await cnt('login_attempt', 'WHERE ok=false') >= 5);
});

test('IQ-06 cookie sesi: HttpOnly, Secure, SameSite=Lax, 12 jam; dirusak/kedaluwarsa/versi lama ditolak; logout mencabut sesi', async () => {
  const email = await ensureUser('Salma Cookie', 'penulis');
  const c = new Client('10.9.9.3'); const l = await c.post('/api/auth/login', { email, password: TEST_PASSWORD });
  assert.match(l.setCookie, /HttpOnly/); assert.match(l.setCookie, /Secure/); assert.match(l.setCookie, /SameSite=Lax/); assert.match(l.setCookie, /Max-Age=43200/);
  assert.doesNotMatch(JSON.stringify(l.json), /udt_session/);              // tanpa token di badan respons (tidak ke localStorage)
  assert.equal((await c.get('/api/me')).status, 200);
  const uid = (await c.get('/api/me')).json.user_id;
  const tampered = new Client('10.9.9.3'); tampered.cookie = c.cookie.slice(0, -3) + 'abc'; assert.equal((await tampered.get('/api/me')).status, 401);
  const expired = new Client('10.9.9.3'); expired.cookie = 'udt_session=' + signSession({ exp: Date.now() - 1000, uid, tv: 0 }, process.env.SESSION_SECRET); assert.equal((await expired.get('/api/me')).status, 401);
  const wrongKey = new Client('10.9.9.3'); wrongKey.cookie = 'udt_session=' + signSession({ exp: Date.now() + 99999, uid, tv: 0 }, 'kunci-lain-yang-panjang-sekali-32-karakter'); assert.equal((await wrongKey.get('/api/me')).status, 401);
  const old = c.cookie;
  await c.post('/api/auth/logout', {}); assert.equal((await c.get('/api/me')).status, 401);
  const replay = new Client('10.9.9.3'); replay.cookie = old; assert.equal((await replay.get('/api/me')).status, 401, 'cookie lama tidak hidup lagi setelah logout');
});

test('IQ-07 nama analis DIKETIK (F12); jejak memuat nama yang diketik DAN akun (user_id)', async () => {
  const c = await loggedIn('Hanifa Analis', '10.9.9.4');
  const me = (await c.get('/api/me')).json;
  assert.equal(me.analyst, undefined); assert.equal(me.display_name, 'Hanifa Analis'); assert.ok(me.user_id);
  assert.equal((await c.put('/api/me/analyst', { name: 'Nama Palsu' })).status, 410);
  const id = await newCompile(c, 'DenganNama');
  const row = (await A.query('SELECT a.name FROM compile c JOIN analyst a ON a.analyst_id=c.created_by WHERE c.compile_id=$1', [id])).rows[0];
  assert.equal(row.name, 'Hanifa Analis');   // klien uji mengetik nama yang sama dengan akunnya
  const ev = (await A.query("SELECT e.*, a.name FROM audit_event e JOIN analyst a USING (analyst_id) WHERE action='compile_create' AND entity_id=$1", [id])).rows[0];
  assert.equal(ev.name, 'Hanifa Analis'); assert.equal(Number(ev.user_id), me.user_id); assert.ok(ev.request_id && ev.at_utc); assert.equal(ev.ip_hash.length, 32); assert.notEqual(ev.ip_hash, '10.9.9.4');
});

test('IQ-08 buat compile: nama bawaan "Development of ...", kombinasi unik (409), daftar dan ringkasan', async () => {
  const c = await loggedIn('Salma', '10.9.9.5');
  const r = await c.post('/api/compiles', { product_name: 'Alfa', strength: '5 mg', dosage_form: 'Kapsul' });
  assert.equal(r.status, 201); assert.equal(r.json.title, 'Development of Alfa 5 mg Kapsul');
  assert.equal((await c.post('/api/compiles', { product_name: 'Alfa', strength: '5 mg', dosage_form: 'Kapsul' })).status, 409);
  assert.equal((await c.post('/api/compiles', { product_name: 'Alfa', strength: '5 mg' })).status, 400);
  const list = (await c.get('/api/compiles')).json.compiles.find(x => x.compile_id === r.json.compile_id);
  assert.equal(list.run_count, 0);
  assert.equal((await c.get('/api/compiles/' + r.json.compile_id)).json.compile.title, 'Development of Alfa 5 mg Kapsul');
  assert.equal((await c.get('/api/compiles/999999')).status, 404);
});

test('IQ-23/IQ-24 masukan dan pengerasan: Origin, badan > 1 MB, JSON rusak, suntikan SQL/skrip tersimpan sebagai teks, galat tanpa jejak, header', async () => {
  const c = await loggedIn('Sania', '10.9.9.6');
  assert.equal((await c.post('/api/compiles', { product_name: 'x', strength: 'y', dosage_form: 'z' }, { origin: 'https://jahat.example' })).status, 403);
  assert.equal((await c.post('/api/compiles', { product_name: 'x', strength: 'y', dosage_form: 'z' }, { origin: null })).status, 403);
  assert.equal((await c.post('/api/compiles', undefined, { raw: '{rusak' })).status, 400);
  const big = await c.post('/api/compiles', undefined, { raw: JSON.stringify({ product_name: 'a'.repeat(1100000) }) });
  assert.equal(big.status, 413);
  assert.equal((await c.post('/api/compiles', { product_name: 'a'.repeat(501), strength: '1', dosage_form: 'z' })).status, 400);
  const evil = `x'); DROP TABLE run;-- <script>alert(1)</script>`;
  const r = await c.post('/api/compiles', { product_name: evil, strength: '1 mg', dosage_form: 'Tablet' });
  assert.equal(r.status, 201);
  assert.equal((await A.query('SELECT product_name FROM compile WHERE compile_id=$1', [r.json.compile_id])).rows[0].product_name, evil);
  assert.equal(await cnt('information_schema.tables', "WHERE table_name='run'"), 1);
  const nf = await c.get('/api/tidak-ada'); assert.equal(nf.status, 404); assert.doesNotMatch(JSON.stringify(nf.json), /\bat\b.*\.js|node_modules|postgres/);
  assert.equal(nf.headers.get('x-content-type-options'), 'nosniff'); assert.equal(nf.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(nf.headers.get('access-control-allow-origin'), null);                                   // same-origin: tanpa CORS
  assert.equal((await c.get('/api/compiles?x=1;DROP')).status, 200);
});

test('IQ-10 pratinjau tidak menulis; status baru / sama persis / bentrok benar; peringatan mutu data tidak menolak', async () => {
  const c = await loggedIn('Risa', '10.9.9.7'); const id = await newCompile(c, 'Pratinjau');
  const before = [await cnt('run'), await cnt('batch'), await cnt('medium'), await cnt('audit_event')];
  const p1 = await c.post('/api/ingest/preview', mkPkg(id, baseRuns()));
  assert.equal(p1.status, 200); assert.deepEqual(p1.json.counts, { baru: 2 });
  assert.deepEqual(before, [await cnt('run'), await cnt('batch'), await cnt('medium'), await cnt('audit_event')]);   // tidak ada yang tertulis
  const commit = await c.post('/api/ingest/commit', { push_id: randomUUID(), package: mkPkg(id, baseRuns()) });
  assert.equal(commit.status, 201); assert.deepEqual(commit.json.counts, { baru: 2 });
  const same = await c.post('/api/ingest/preview', mkPkg(id, baseRuns())); assert.deepEqual(same.json.counts, { sama_persis: 2 });
  const diff = baseRuns(); diff[1].values[0].values[0] = 11;
  const conf = await c.post('/api/ingest/preview', mkPkg(id, diff)); assert.deepEqual(conf.json.counts, { sama_persis: 1, bentrok: 1 });
  // peringatan (IQ-13): vessel > 12, nilai > 120, tanpa reference, identik, tanggal kosong; run tetap diterima
  const many = mkRun({ key: 'm', batch: 'M1', values: Array.from({ length: 13 }, (_, i) => ({ no: i + 1, values: [130, 50, 90] })), date: null });
  const dup = mkRun({ key: 'd', batch: 'M2', values: many.values });
  const w = await c.post('/api/ingest/preview', mkPkg(id, [many, dup], false));
  const codes = new Set(w.json.warnings.map(x => x.code));
  for (const k of ['W-vessel>12', 'W-nilai', 'W-tanpa-reference', 'W-identik', 'W-tanggal']) assert.ok(codes.has(k), k);
  assert.equal(w.status, 200);
});

test('IQ-11 idempoten: push_id sama = hasil sama tanpa data ganda; dua permintaan serentak; kegagalan di tengah = tidak ada baris tertinggal', async () => {
  const c = await loggedIn('Yonathan', '10.9.9.8'); const id = await newCompile(c, 'Idempoten');
  const push = randomUUID(), body = { push_id: push, package: mkPkg(id, baseRuns()) };
  const [a, b] = await Promise.all([c.post('/api/ingest/commit', body), c.post('/api/ingest/commit', body)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 201]);
  assert.deepEqual(a.json.runs, b.json.runs);
  assert.equal(await cnt('run', 'WHERE compile_id=$1', [id]), 2); assert.equal(await cnt('studio_push', 'WHERE push_id=$1', [push]), 1);
  const again = await c.post('/api/ingest/commit', body); assert.equal(again.status, 200); assert.equal(again.json.replay, true);
  assert.equal(await cnt('run', 'WHERE compile_id=$1', [id]), 2);
  assert.equal(await cnt('comparison', 'WHERE test_run_id IN (SELECT run_id FROM run WHERE compile_id=$1)', [id]), 1);
  // gagal di tengah: dua run dengan identitas dan isi sama dalam satu paket -> galat kunci unik pada run kedua -> semua dibatalkan
  const id2 = await newCompile(c, 'Gagal');
  const ref = mkRun({ key: 'r', role: 'reference', batch: 'R9' }), u1 = mkRun({ key: 'a', batch: 'U9' }), u2 = mkRun({ key: 'b', batch: 'U9' });
  const fail = await c.post('/api/ingest/commit', { push_id: randomUUID(), package: mkPkg(id2, [ref, u1, u2]) });
  assert.equal(fail.status, 409);
  assert.equal(await cnt('run', 'WHERE compile_id=$1', [id2]), 0); assert.equal(await cnt('batch', 'WHERE compile_id=$1', [id2]), 0); assert.equal(await cnt('medium', 'WHERE compile_id=$1', [id2]), 0);
  assert.equal((await c.post('/api/ingest/commit', { push_id: 'bukan-uuid', package: mkPkg(id2, baseRuns()) })).status, 400);
});

test('FS-08 bentrok: tanpa pilihan = 409; ulang = dua-duanya terlihat; timpa = lama tersembunyi tetapi tersimpan (jejak run_removal); batal = tidak masuk', async () => {
  const c = await loggedIn('Yonathan', '10.9.9.9'); const id = await newCompile(c, 'Bentrok');
  await c.post('/api/ingest/commit', { push_id: randomUUID(), package: mkPkg(id, baseRuns()) });
  const diff = () => { const r = baseRuns(); r[1].values[0].values[0] = 99; return r; };
  const r0 = await c.post('/api/ingest/commit', { push_id: randomUUID(), package: mkPkg(id, diff()) });
  assert.equal(r0.status, 409); assert.deepEqual(r0.json.conflicts, ['u1']);
  assert.equal(await cnt('run', 'WHERE compile_id=$1', [id]), 2);
  const rb = await c.post('/api/ingest/commit', { push_id: randomUUID(), package: mkPkg(id, diff()), decisions: { u1: 'batal' } });
  assert.equal(rb.status, 201); assert.equal(rb.json.runs.find(x => x.key === 'u1').status, 'dibatalkan'); assert.equal(await cnt('run', 'WHERE compile_id=$1', [id]), 2);
  const ru = await c.post('/api/ingest/commit', { push_id: randomUUID(), package: mkPkg(id, diff()), decisions: { u1: 'ulang' } });
  assert.equal(ru.json.runs.find(x => x.key === 'u1').status, 'run_ulang'); assert.equal(await cnt('run_visible', 'WHERE compile_id=$1', [id]), 3);
  const d2 = baseRuns(); d2[1].values[0].values[0] = 77;
  const rt = await c.post('/api/ingest/commit', { push_id: randomUUID(), package: mkPkg(id, d2), decisions: { u1: 'timpa' } });
  assert.equal(rt.json.runs.find(x => x.key === 'u1').status, 'ditimpa');
  assert.equal(await cnt('run', 'WHERE compile_id=$1', [id]), 4);                               // tidak ada hapus fisik
  assert.equal(await cnt('run_visible', 'WHERE compile_id=$1', [id]), 2);                       // ref + run baru; dua uji lama tersembunyi
  assert.equal(await cnt('run_removal', "WHERE kind='ditimpa' AND reason <> ''"), 2);
  assert.equal(await cnt('run_value', 'WHERE run_id IN (SELECT run_id FROM run WHERE compile_id=$1)', [id]), 4 * 8);   // nilai lama tetap utuh
});

test('IQ-12 pergi-pulang 10.000 angka acak identik persis; sel kosong bukan 0', async () => {
  const c = await loggedIn('Yonathan', '10.9.9.10'); const id = await newCompile(c, 'PergiPulang');
  const tp = Array.from({ length: 50 }, (_, i) => i + 1);
  const rnd = () => { const k = Math.random(); return k < 0.05 ? Number((Math.random() * 1e-6).toPrecision(12)) : k < 0.1 ? Math.round(Math.random() * 120) : Math.random() * 120; };
  const runs = [mkRun({ key: 'ref', role: 'reference', brand: 'Ref', batch: 'R1', tp, values: [] })];
  for (let k = 0; k < 4; k++) runs.push(mkRun({ key: 'r' + k, batch: 'B' + k, tp, values: Array.from({ length: 50 }, (_, v) => ({ no: v + 1, values: tp.map(() => rnd()) })) }));
  runs[0].values = [{ no: 1, values: tp.map(() => rnd()) }];
  runs[1].values[0].values[3] = null;                                                           // sel kosong
  const r = await c.post('/api/ingest/commit', { push_id: randomUUID(), package: { ...mkPkg(id, runs, false) } });
  assert.equal(r.status, 201, JSON.stringify(r.json).slice(0, 300));
  let n = 0, bad = 0;
  for (const run of runs) {
    const rid = r.json.runs.find(x => x.key === run.key).run_id;
    const db = new Map((await A.query('SELECT vessel_no, seq, pct FROM run_value WHERE run_id=$1', [rid])).rows.map(x => [`${x.vessel_no}|${x.seq}`, x.pct]));
    for (const v of run.values) v.values.forEach((x, j) => { const got = db.get(`${v.no}|${j + 1}`); if (x === null) { assert.equal(got, undefined); return; } n++; if (Number(got) !== x) bad++; });
  }
  assert.ok(n >= 10000, `n=${n}`); assert.equal(bad, 0);
});

test('Skenario 1+2 (impor Zemyc, simpan, laporan) + OQ-22 kesamaan 100% nilai vessel + idempoten impor ulang', opt, async () => {
  const c = await loggedIn('Hanifa', '10.9.9.11');
  const comments = { Release: { E83: 'Titik sampling terlewat, dilakukan pada menit ke-8', N85: 'exclude 5 minutes' } };
  const pkg = readWorkbook(loadWorkbook('Zemyc150', 'Development of Zemyc 150 mg Kapsul.xlsx', { comments }));
  const r = await c.post('/api/imports', pkg); assert.equal(r.status, 201, JSON.stringify(r.json).slice(0, 400));
  assert.equal(r.json.runs.length, 30); assert.equal(r.json.comparisons_added, 26); assert.deepEqual(r.json.counts, { baru: 30 });
  const rep = (await c.get(`/api/imports/${r.json.import_id}/report`)).json;
  assert.equal(rep.runs, 30); assert.equal(rep.comparisons, 26); assert.equal(rep.vessels, 90); assert.equal(rep.values, 30 * 3 * 7 - (0));
  assert.equal(rep.f2_cocok, 25); assert.equal(rep.f2_tidak_cocok, 1);
  assert.equal(rep.notes.sheet_diff.length, 1); assert.equal(rep.notes.cell_comment.length, 2);
  assert.ok(rep.notes.stat_mismatch.length > 0);
  // skenario 1: Release = 8 run (1 Reference + 7 Uji)
  const rel = (await A.query(`SELECT b.role, count(*) n FROM run r JOIN batch b USING (batch_id) JOIN medium m ON m.medium_id=r.medium_id WHERE r.import_id=$1 AND m.code='Release' GROUP BY b.role`, [r.json.import_id])).rows;
  assert.deepEqual(Object.fromEntries(rel.map(x => [x.role, Number(x.n)])), { null: 8 }, 'F8 D4: batch.role tidak ditulis lagi; peran dihitung dari comparison');
  // skenario 2: tujuh angka README tersimpan (nilai resmi tercetak)
  const q = (await A.query(`SELECT b.batch_no, c.total_sq, c.n_points, c.f2, c.conclusion_printed, c.conclusion_code FROM comparison c JOIN run r ON r.run_id=c.test_run_id JOIN batch b ON b.batch_id=r.batch_id JOIN medium m ON m.medium_id=r.medium_id WHERE r.import_id=$1 AND m.code='Release'`, [r.json.import_id])).rows;
  const byB = Object.fromEntries(q.map(x => [x.batch_no, x]));
  const README = { Y5G103B: [7533, 3, 15, 'Not Similar'], F0048E26A: [268, 5, 57, 'Similar'], F0048F26A: [353, 5, 54, 'Similar'], F0020G26A: [2912, 3, 25, 'Not Similar'], F0062G26A: [1459, 3, 33, 'Not Similar'], F0063G26A: [4517, 3, 21, 'Not Similar'], F0046H26A: [6200, 3, 17, 'Not Similar'] };
  for (const [b, [tot, n, f2, kes]] of Object.entries(README)) { const x = byB[b]; assert.equal(Math.round(Number(x.total_sq)), tot); assert.equal(x.n_points, n); assert.equal(Math.round(Number(x.f2)), f2); assert.equal(x.conclusion_printed, kes); assert.equal(x.conclusion_code, null); }
  // OQ-22: 100% nilai vessel sama dengan sumber
  let n = 0, bad = 0;
  for (const run of pkg.runs) {
    const rid = r.json.runs.find(x => x.key === run.key).run_id;
    const tps = (await A.query('SELECT seq, minute FROM run_timepoint WHERE run_id=$1 ORDER BY seq', [rid])).rows.map(x => Number(x.minute));
    assert.deepEqual(tps, run.timepoints);
    const db = new Map((await A.query('SELECT vessel_no, seq, pct FROM run_value WHERE run_id=$1', [rid])).rows.map(x => [`${x.vessel_no}|${x.seq}`, x.pct]));
    let expectCount = 0;
    for (const v of run.values) v.values.forEach((x, j) => { if (x === null) return; expectCount++; n++; if (Number(db.get(`${v.no}|${j + 1}`)) !== x) bad++; });
    assert.equal(db.size, expectCount);
  }
  assert.equal(bad, 0); assert.ok(n > 600);
  // SumberBlok untuk tiap run; baris pembanding dirujuk pada blok uji
  assert.equal(await cnt('run_source_block', 'WHERE import_id=$1', [r.json.import_id]), 30);
  assert.equal(await cnt('run_source_block', 'WHERE import_id=$1 AND ref_avg_row=14', [r.json.import_id]), 26);   // 26 blok uji merujuk baris pembanding 14
  // impor ulang berkas yang sama: tidak ada run ganda
  const again = await c.post('/api/imports', pkg); assert.equal(again.status, 201); assert.deepEqual(again.json.counts, { sama_persis: 30 }); assert.equal(again.json.comparisons_added, 0);
  assert.equal(await cnt('run', 'WHERE compile_id=$1', [r.json.compile_id]), 30);
});

test('Impor Empagliflozin 10 mg: 16 run, produsen pada run, blok tanpa AVG ditahan, FD diperiksa (IQ-14), jejak impor', opt, async () => {
  const c = await loggedIn('Salma', '10.9.9.12');
  const pkg = readWorkbook(loadWorkbook('Empagliflozin10', 'Development of Empagliflozin 10 mg Tablet.xlsx'));
  const r = await c.post('/api/imports', pkg); assert.equal(r.status, 201);
  const cid = r.json.compile_id;
  const rep = (await c.get(`/api/imports/${r.json.import_id}/report`)).json;
  assert.equal(rep.runs, 16); assert.equal(rep.comparisons, 12); assert.equal(rep.f2_cocok, 12); assert.equal(rep.f2_tidak_cocok, 0); assert.equal(rep.values, 16 * 3 * 7);
  assert.equal(rep.notes.hold.length, 1); assert.equal(rep.notes.hold[0].cell_range, 'C83:K100');
  assert.ok(rep.notes.stat_mismatch.length >= 12);
  // FD yang berlaku: 0 baris; FD yang dibantah sheet nyata: tepat 3 batch (dasar S-1)
  const fd = async (sql) => (await A.query(sql, [cid])).rowCount;
  assert.equal(await fd('SELECT 1 FROM medium WHERE compile_id=$1 GROUP BY compile_id, code HAVING count(DISTINCT full_name) > 1'), 0);
  assert.equal(await fd('SELECT 1 FROM run WHERE compile_id=$1 GROUP BY batch_id, medium_id HAVING count(DISTINCT manufacturer_site) > 1'), 0);
  assert.equal(await fd('SELECT 1 FROM run WHERE compile_id=$1 GROUP BY batch_id HAVING count(DISTINCT manufacturer_site) > 1'), 3);
  assert.equal(await fd('SELECT 1 FROM batch WHERE compile_id=$1 GROUP BY brand_name, batch_no HAVING count(DISTINCT role) > 1'), 0);
  assert.equal(await cnt('audit_event', "WHERE action='import_sheet' AND entity_id=$1", [cid]), 1);
  // tab 1,2: blok yatim tidak diimpor sebagai run (hanya 4 run di tab itu: 1 reference + 3 uji)
  assert.equal(await cnt('run r JOIN medium m ON m.medium_id=r.medium_id', "WHERE r.compile_id=$1 AND m.code='1,2'", [cid]), 4);
});
