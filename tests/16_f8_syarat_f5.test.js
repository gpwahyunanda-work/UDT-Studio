// F8: penutupan syarat F5 (S-1..S-5), migrasi 0004 (F8b R1/R2/R3/R5), f2 resmi (S-2), blok ditahan, dan fitur UI README. [LAPTOP: PostgreSQL 17 biasa]
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createTestDb } from './helpers/db.js';
import { Client, loggedIn, readerLoggedIn } from './helpers/http.js';
import { loadWorkbook, hasFixtures, REPO } from './helpers/fixtures.js';
import { coherentF2 } from './helpers/f2.js';
import { readWorkbook } from '../server/import/sheetReader.js';
import { PAGE_HEADERS } from '../server/pageHeaders.js';
import { buildPublic } from '../scripts/build_public.mjs';
import { check } from '../scripts/check_exposure.mjs';

const rd = (f) => readFileSync(join(REPO, f), 'utf8');
const opt = { skip: hasFixtures ? false : 'fixture data/sheets/csv tidak ada' };

// ---------------- S-1 / S-5: paparan dan header ----------------
test('S-1: public/ hanya berisi daftar publik; 0 berkas non-publik (server, db, tests, docs, scripts, worker, apps-script, ui-lama, sample-data, catatan)', async () => {
  const out = buildPublic(join(mkdtempSync(join(tmpdir(), 'udt-pub-')), 'public'));
  const r = await check({ dir: out });
  assert.deepEqual(r.servedNonPublic, []); assert.ok(r.nonPublicTracked > 100 && r.publicFiles >= 10);
  assert.ok(existsSync(join(out, 'index.html')) && existsSync(join(out, 'compiler', 'index.html')) && existsSync(join(out, 'theme', 'pharos-theme.css')) && existsSync(join(out, 'studio-ext', 'kirim.js')));
  for (const f of ['server', 'db', 'tests', 'docs', 'scripts', 'cloudflare-worker', 'google-apps-script', 'ui-lama', 'sample-data', 'HANDOVER.md', 'neon.ts', 'UDT Studio.html']) assert.ok(!existsSync(join(out, f)), f);
});

test('S-1/S-5: server Node: berkas non-publik 404, halaman HTML bertajuk keamanan, tanpa Access-Control-Allow-Origin, fungsi tetap melayani halaman dan /api', async () => {
  const port = 18900 + Math.floor(Math.random() * 90);
  const child = spawn(process.execPath, ['server/node-server.mjs', String(port)], { cwd: REPO, stdio: 'ignore' });
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 40; i++) { try { await fetch(base + '/'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
    const ex = await check({ url: base });
    assert.deepEqual(ex.servedNonPublic, []); assert.ok(ex.publicServed >= 10);
    for (const p of ['/server/app.js', '/db/migrations/0001_compile.sql', '/tests/helpers/db.js', '/docs/F5_laporan.md', '/HANDOVER.md', '/NOTES_F7.md', '/neon.ts', '/cloudflare-worker/worker.js', '/google-apps-script/Code.gs', '/scripts/backup_pg.mjs', '/UDT%20Studio.html', '/package.json', '/.env']) assert.equal((await fetch(base + p)).status, 404, p);
    for (const p of ['/', '/compiler', '/compiler/index.html']) {
      const r = await fetch(base + p); assert.equal(r.status, 200, p); await r.text();
      for (const [k, v] of Object.entries(PAGE_HEADERS)) assert.equal(r.headers.get(k), v, `${p} ${k}`);
      assert.equal(r.headers.get('access-control-allow-origin'), null, p);
    }
    for (const p of ['/compiler/app.js', '/theme/pharos-theme.css', '/theme/fonts/GoogleSans-var.woff2']) { const r = await fetch(base + p); assert.equal(r.status, 200, p); await r.arrayBuffer(); assert.equal(r.headers.get('access-control-allow-origin'), null, p); assert.equal(r.headers.get('x-content-type-options'), 'nosniff'); }
  } finally { child.kill(); }
});

test('S-5: CSP tanpa CDN/domain luar; vercel.json: outputDirectory public, header sama dengan server, tanpa ACAO *, server/ ikut bundel fungsi', () => {
  const csp = PAGE_HEADERS['content-security-policy'];
  assert.doesNotMatch(csp, /https?:/); assert.match(csp, /default-src 'self'/); assert.match(csp, /frame-ancestors 'none'/); assert.match(csp, /object-src 'none'/);
  const v = JSON.parse(rd('vercel.json'));
  assert.equal(v.outputDirectory, 'public'); assert.match(v.buildCommand, /build_public\.mjs/);
  assert.equal(v.functions['api/[...rute].js'].includeFiles, 'server/**');
  const pages = v.headers.filter((h) => ['/', '/compiler', '/index.html', '/compiler/index.html'].includes(h.source));
  assert.equal(pages.length, 4);
  for (const g of pages) {
    const m = Object.fromEntries(g.headers.map((h) => [h.key.toLowerCase(), h.value]));
    for (const [k, val] of Object.entries(PAGE_HEADERS)) assert.equal(m[k], val, `${g.source} ${k}`);
  }
  for (const g of v.headers) for (const h of g.headers) if (/^access-control-allow-origin$/i.test(h.key)) assert.notEqual(h.value, '*');
  assert.match(rd('.gitignore'), /^public\/$/m);
});

test('S-1: tests/helpers/db.js tanpa kata sandi tertanam (env atau dummy)', () => {
  const s = rd('tests/helpers/db.js');
  assert.match(s, /UDT_TEST_PG_PASSWORD/); assert.doesNotMatch(s, /udt_owner:[A-Za-z0-9_-]{6,}@/);
});

test('Dokumen pemulihan peran udt_app untuk pg_restore ada (docs/PEMULIHAN_PERAN_DB.md)', () => {
  const s = rd('docs/PEMULIHAN_PERAN_DB.md');
  for (const w of ['pg_restore', 'udt_app', 'CREATE ROLE', '--no-owner', 'GRANT']) assert.ok(s.includes(w), w);
});

// ---------------- Basis data uji bersama ----------------
let db, W, R;
before(async () => {
  if (!hasFixtures) return;
  db = await createTestDb('f8'); W = await loggedIn('Analis F8'); R = await readerLoggedIn('10.8.8.8');
  for (const a of [['Zemyc150', 'Development of Zemyc 150 mg Kapsul.xlsx'], ['Gionix16', 'Development of Gionix 16 mg Tab.xlsx'], ['Vastrol20', 'Development of Vastrol 20 mg Tablet.xlsx', ['pH_1_2', 'pH_4_5', 'pH_6_8']], ['Empagliflozin25', 'Development of Empagliflozin 25 mg Tablet.xlsx', ['UDT_Release', 'UDT_pH_1_2', 'UDT_pH_4_5', 'UDT_pH_6_8']]]) {
    const r = await W.post('/api/imports', readWorkbook(loadWorkbook(...a))); assert.equal(r.status, 201, JSON.stringify(r.json));
  }
});
after(async () => { if (db) await db.drop(); });
const dash = async (re) => { const p = (await W.get('/api/products')).json.products.find((x) => re.test(x.name)); return { id: p.id, d: (await W.get(`/api/products/${p.id}/dashboard`)).json }; };
const r1 = (x) => Math.round(x * 10) / 10;

// ---------------- S-2: f2 resmi ----------------
test('S-2: data impor menampilkan nilai TERCETAK sheet (f2, Total, n): Zemyc Release 57 dan 54, Gionix F0080G26A 838,9 / 5 / 44,3', opt, async () => {
  const { d } = await dash(/Zemyc/); const ck = d.comp_order[0];
  const a = d.cells[ck].F0048E26A.Release, b = d.cells[ck].F0048F26A.Release;
  assert.equal(Math.round(a.f2), 57); assert.equal(Math.round(b.f2), 54); assert.equal(a.src, 'sheet'); assert.equal(a.n, 5); assert.equal(r1(a.total), 268.3); assert.equal(r1(b.total), 353.1);
  assert.equal(r1(a.f2s), 52.3, 'hitung ulang aturan tim (n=3) tetap tersedia sebagai pembanding'); assert.notEqual(a.f2, a.f2s);
  const g = (await dash(/Gionix/)).d, gc = g.cells[g.comp_order[0]].F0080G26A.Release;
  assert.equal(r1(gc.total), 838.9); assert.equal(gc.n, 5); assert.equal(r1(gc.f2), 44.3); assert.equal(gc.k, 'not');
});

test('S-2: Vastrol 36,9 (Ezero), 58,1 (Crestor), Crestor vs Ezero 46,7 (pH 4,5) dan 44,1 (pH 1,2) tampil sebagai nilai resmi', opt, async () => {
  const { d } = await dash(/Vastrol/);
  assert.equal(r1(d.cells.B41968.F0066A26A['4,5'].f2), 36.9); assert.equal(r1(d.cells['6005160'].F0066A26A['4,5'].f2), 58.1);
  assert.equal(r1(d.cells.B41968['6005160']['4,5'].f2), 46.7); assert.equal(r1(d.cells.B41968['6005160']['1,2'].f2), 44.1);
  for (const c of Object.values(d.cells.B41968.F0066A26A)) assert.equal(c.src, 'sheet');
});

test('S-2: data baru dari Studio memakai hasil Langkah 4 (f2, n, Total dari server); nilai impor tidak berubah', opt, async () => {
  const { id, d } = await dash(/Vastrol/);
  const body = { medium: '4,5', batch: 'F0F8Z26A', variant: '', test_date: '2026-11-02', comparator: 'B41968', timepoints: [5, 10, 15, 20, 30, 45, 60], vessels: [1, 2, 3].map((i) => ({ no: i, values: [30 + i, 45, 60, 70, 78, 84, 90] })), push_id: randomUUID() };
  assert.equal((await W.post(`/api/products/${id}/runs`, body)).status, 201);
  const d2 = (await W.get(`/api/products/${id}/dashboard`)).json, c = d2.cells.B41968.F0F8Z26A['4,5'];
  assert.equal(c.src, 'langkah4'); assert.equal(c.f2, c.f2l); assert.equal(c.n, c.nl); assert.ok(c.total > 0);
  assert.equal(d2.cells.B41968.F0066A26A['4,5'].f2, d.cells.B41968.F0066A26A['4,5'].f2);
});

const KONTRAK = join(REPO, '..', 'docs', 'KONTRAK_API_COMPILER.md');
test('S-2: kontrak API tidak lagi menyebut f2s sebagai tampilan bawaan yang cocok README', { skip: existsSync(KONTRAK) ? false : 'dokumen proyek di luar repo tidak ada' }, () => {
  const k = readFileSync(KONTRAK, 'utf8');
  assert.doesNotMatch(k, /Tampilan bawaan\*\* di matriks dan grafik\. Cocok dengan angka README/);
  assert.match(k, /nilai resmi/i); assert.match(k, /tercetak/i);
});

// ---------------- S-3: 500 menjadi 400 ----------------
test('S-3: test_date tidak valid, id melewati bigint, NUL, compile_id raksasa = 400 (bukan 500); pratinjau juga menolak tanggal', opt, async () => {
  const { id } = await dash(/Vastrol/);
  const b = (o = {}) => ({ medium: '4,5', batch: 'F0F8D26A', variant: '', test_date: '2026-11-02', comparator: 'B41968', timepoints: [5, 10, 15], vessels: [1, 2, 3].map((i) => ({ no: i, values: [30 + i, 45, 60] })), ...o });
  for (const bad of ['2026-13-45', '2026-02-30', '2026-00-10']) {
    assert.equal((await W.post(`/api/products/${id}/runs/preview`, b({ test_date: bad }))).status, 400, 'pratinjau ' + bad);
    assert.equal((await W.post(`/api/products/${id}/runs`, { ...b({ test_date: bad }), push_id: randomUUID() })).status, 400, 'simpan ' + bad);
  }
  assert.equal((await W.get('/api/products/99999999999999999999')).status, 400);
  assert.equal((await W.get('/api/products/99999999999999999999/dashboard')).status, 400);
  assert.equal((await W.get('/api/runs/99999999999999999999/audit')).status, 400);
  assert.equal((await W.get('/api/compiles/match?product=a%00b')).status, 400);
  assert.equal((await W.post(`/api/products/${id}/runs/preview`, b({ batch: 'F0' + String.fromCharCode(0) + 'X' }))).status, 400);
  const mk = (cid) => ({ compile_id: cid, mediums: [{ code: '6,8', full_name: 'X' }], runs: [{ key: 'a', medium_code: '6,8', brand_name: 'B', batch_no: 'N1', role: 'uji', variant: '', test_date: '2026-01-01', timepoints: [5, 10, 15], values: [{ no: 1, values: [1, 2, 3] }] }], comparisons: [] });
  assert.equal((await W.post('/api/ingest/commit', { push_id: randomUUID(), package: mk(1e20) })).status, 400);
  assert.equal((await W.post('/api/ingest/preview', mk(1e20))).status, 400);
  assert.equal((await W.post('/api/ingest/commit', { push_id: randomUUID(), package: mk(999999999999) })).status, 404);
});

test('S-3: galat FK 23503 diterjemahkan menjadi 409, galat kelas 22 menjadi 400 (peta galat basis data)', () => {
  const s = rd('server/app.js'); assert.match(s, /e\?\.code === '23503'/); assert.match(s, /startsWith\('22'\)/);
  assert.match(s, /return json\(409, \{ error: 'Data merujuk/);
});

test('S-3 / F8b R1: dua medium berkode sama dalam satu produk ditolak (UNIQUE) dan push dengan nama lain = 409 jelas, tanpa data tersimpan', opt, async () => {
  const { id } = await dash(/Vastrol/);
  const had = (await db.owner.query('SELECT medium_id, full_name FROM medium WHERE compile_id=$1 AND code=$2', [id, '6,8'])).rows;
  assert.equal(had.length, 1);
  await assert.rejects(db.owner.query("INSERT INTO medium(compile_id,code,full_name) VALUES ($1,'6,8','nama lain')", [id]), (e) => e.code === '23505' && /medium_compile_code_key/.test(e.constraint));
  const run = { key: 'a', medium_code: '6,8', brand_name: 'B', batch_no: 'ZN1', role: 'uji', variant: '', test_date: '2026-01-01', timepoints: [5, 10, 15], values: [{ no: 1, values: [10, 20, 30] }] };
  const before = Number((await db.owner.query('SELECT count(*) n FROM run WHERE compile_id=$1', [id])).rows[0].n);
  const r = await W.post('/api/ingest/commit', { push_id: randomUUID(), package: { compile_id: id, mediums: [{ code: '6,8', full_name: 'Buffer berbeda nama' }], runs: [run], comparisons: [] } });
  assert.equal(r.status, 409, JSON.stringify(r.json)); assert.match(r.json.error, /satu medium per kode/); assert.equal(r.json.stored_full_name, had[0].full_name);
  assert.equal(Number((await db.owner.query('SELECT count(*) n FROM run WHERE compile_id=$1', [id])).rows[0].n), before);
  const ok = await W.post('/api/ingest/commit', { push_id: randomUUID(), package: { compile_id: id, mediums: [{ code: '6,8', full_name: had[0].full_name }], runs: [run], comparisons: [] } });
  assert.equal(ok.status, 201, JSON.stringify(ok.json));
  const dup = await W.post('/api/ingest/preview', { compile_id: id, mediums: [{ code: '6,8', full_name: 'a' }, { code: '6,8', full_name: 'b' }], runs: [run], comparisons: [] });
  assert.equal(dup.status, 400);
});

test('F8b R5 (D3): produk unik per name_key, tak peka huruf besar dan spasi: 409', opt, async () => {
  const a = await W.post('/api/products', { product_name: 'KunciUji', strength: '5 mg', dosage_form: 'Tablet' }); assert.equal(a.status, 201, JSON.stringify(a.json));
  const b = await W.post('/api/products', { product_name: 'kunciuji', strength: '5mg', dosage_form: 'tablet' }); assert.equal(b.status, 409, JSON.stringify(b.json));
  await assert.rejects(db.owner.query("INSERT INTO compile(product_name,strength,dosage_form,title,created_by) VALUES ('Kunci Uji','5 mg','Tablet','t',1)"), (e) => e.code === '23505' && /compile_name_key_uq/.test(e.constraint));
});

test('F8b R2: compile_alias.alias_key dijaga CHECK (turunan alias); R3/R4 (D4): batch.role tidak ditulis, brand_name hanya untuk data Studio', opt, async () => {
  await assert.rejects(db.owner.query("INSERT INTO compile_alias(compile_id,alias,alias_key,source,created_by) VALUES (1,'Development of A B','salah','sheet',1)"), (e) => e.code === '23514' && /compile_alias_key_chk/.test(e.constraint));
  await db.owner.query("INSERT INTO compile_alias(compile_id,alias,alias_key,source,created_by) VALUES (1,'Development of A  B','ab','analis',1)");
  const roles = (await db.owner.query('SELECT count(*) FILTER (WHERE role IS NOT NULL) AS terisi FROM batch')).rows[0];
  assert.equal(Number(roles.terisi), 0);
  const sheetBrand = (await db.owner.query("SELECT count(*) n FROM batch b WHERE b.brand_name IS NOT NULL AND EXISTS (SELECT 1 FROM run r JOIN run_source_block s ON s.run_id=r.run_id WHERE r.batch_id=b.batch_id)")).rows[0].n;
  assert.equal(Number(sheetBrand), 0, 'batch dari sheet: nama merek dibaca dari run_source_block.product_printed');
  const { d } = await dash(/Vastrol/); assert.equal(d.comps.B41968.name, 'Ezero 20 mg');
});

test('Migrasi 0004: mundur lalu maju lagi pada salinan (basis data uji)', opt, async () => {
  const down = rd('db/down/0004_down.sql'), up = rd('db/migrations/0004_f8_identitas.sql');
  const had = async (name) => Number((await db.owner.query('SELECT count(*) n FROM pg_constraint WHERE conname=$1', [name])).rows[0].n);
  const idx = async () => Number((await db.owner.query("SELECT count(*) n FROM pg_indexes WHERE indexname='compile_name_key_uq'")).rows[0].n);
  await db.owner.query("DELETE FROM compile_alias WHERE alias_key='ab'");
  await db.owner.query("DELETE FROM batch WHERE role IS NULL AND NOT EXISTS (SELECT 1 FROM run r WHERE r.batch_id=batch.batch_id)");
  await db.owner.query("UPDATE batch SET role='uji' WHERE role IS NULL");   // mundur menuntut role terisi lagi (lihat komentar down)
  await db.owner.query(down);
  assert.equal(await had('medium_compile_code_key'), 0); assert.equal(await had('compile_alias_key_chk'), 0); assert.equal(await idx(), 0);
  await db.owner.query(up.replace(/SET LOCAL lock_timeout = '5s';/, ''));
  assert.equal(await had('medium_compile_code_key'), 1); assert.equal(await had('compile_alias_key_chk'), 1); assert.equal(await idx(), 1);
  await db.owner.query("INSERT INTO schema_migration(version,name,sha256) SELECT 4,'0004_f8_identitas.sql',sha256 FROM schema_migration WHERE version=3 ON CONFLICT DO NOTHING");
});

// ---------------- S-4: f2 klien tidak dipercaya ----------------
test('S-4: /api/ingest/commit menghitung ulang f2/Total/n di server; f2=99,9 ditolak 400; selisih dalam toleransi disimpan sebagai hasil server', opt, async () => {
  const c = await W.post('/api/products', { product_name: 'ZZ F8 S4', strength: '1 mg', dosage_form: 'Tablet' }); assert.equal(c.status, 201);
  const tp = [5, 10, 15, 20, 30, 45];
  const run = (key, batch, role, vals) => ({ key, medium_code: '6,8', brand_name: 'ZZ ' + role, batch_no: batch, role, variant: '', test_date: '2026-11-23', is_valid: true, timepoints: tp, values: [1, 2, 3].map((i) => ({ no: i, values: vals.map((v) => v + i * 0.1) })) });
  const pkg = (f2) => ({ compile_id: c.json.compile_id, mediums: [{ code: '6,8', full_name: 'Buffer QA' }], runs: [run('r', 'S4-REF', 'reference', [20, 30, 40, 50, 60, 70]), run('t', 'S4-TEST', 'uji', [2, 3, 4, 5, 6, 7])], comparisons: [{ testKey: 't', refKey: 'r', total_sq: 0.01, n_points: 6, f2, conclusion_code: 'similar', conclusion_printed: 'palsu', points: tp.map((_, i) => ({ seq: i + 1, sq_diff: 0.001 })) }] });
  for (const bad of [99.9, null, 'x']) {
    const r = await W.post('/api/ingest/commit', { push_id: randomUUID(), package: pkg(bad) });
    assert.equal(r.status, 400, String(bad) + ' ' + JSON.stringify(r.json));
  }
  assert.equal((await W.post('/api/ingest/preview', pkg(99.9))).status, 400);
  assert.equal(Number((await db.owner.query('SELECT count(*) n FROM comparison c JOIN run r ON r.run_id=c.test_run_id WHERE r.compile_id=$1', [c.json.compile_id])).rows[0].n), 0, 'tidak ada yang tersimpan');
  const good = coherentF2(pkg(0)); const serverF2 = good.comparisons[0].f2;
  const near = pkg(serverF2 + 0.4);
  const ok = await W.post('/api/ingest/commit', { push_id: randomUUID(), package: near }); assert.equal(ok.status, 201, JSON.stringify(ok.json));
  const row = (await db.owner.query('SELECT f2::float8 AS f2, total_sq::float8 AS t, n_points, conclusion_code, f2_source, conclusion_is_printed FROM comparison c JOIN run r ON r.run_id=c.test_run_id WHERE r.compile_id=$1', [c.json.compile_id])).rows[0];
  assert.ok(Math.abs(row.f2 - serverF2) < 1e-9, 'tersimpan = hasil server, bukan kiriman klien'); assert.ok(row.t > 100); assert.equal(row.n_points, 6); assert.equal(row.f2_source, 'studio'); assert.equal(row.conclusion_is_printed, false);
});

// ---------------- (e) blok ditahan ----------------
test('README skenario 7: Empagliflozin 25 mg F0058D26A 500mL (pH 6,8) ditandai ditahan di payload dashboard dan di laporan impor', opt, async () => {
  const { d } = await dash(/Empagliflozin 25/);
  const row = d.runs.find((x) => x.key === 'F0058D26A 500mL');
  assert.ok(row.held['6,8'], 'payload: held'); assert.match(row.held['6,8'], /W-19/); assert.equal(row.prof['6,8'].held, row.held['6,8']);
  assert.ok(d.findings.some((f) => f.kind === 'ditahan' && f.batch === 'F0058D26A 500mL' && f.medium === 'pH 6,8'));
  assert.match(d.warn['F0058D26A 500mL'], /Ditahan saat impor/);
  const imp = (await db.owner.query("SELECT import_id FROM import_run WHERE source_name ILIKE '%Empagliflozin 25%'")).rows[0].import_id;
  const rep = (await W.get(`/api/imports/${imp}/report`)).json;
  assert.equal(rep.ditahan_blok.length, 1); assert.equal(rep.ditahan_blok[0].batch, 'F0058D26A'); assert.equal(rep.ditahan_blok[0].variant, '500mL'); assert.equal(rep.ditahan_blok[0].medium, '6,8');
  const dry = readWorkbook(loadWorkbook('Empagliflozin25', 'Development of Empagliflozin 25 mg Tablet.xlsx', ['UDT_Release', 'UDT_pH_1_2', 'UDT_pH_4_5', 'UDT_pH_6_8']));
  assert.equal(dry.runs.flatMap((r) => r.sourceBlocks).filter((b) => b.import_outcome === 'ditahan').length, 1);
});

// ---------------- README skenario 8: UI ----------------
test('UI: tombol unduh PNG (>= 1600 px), Cetak, tema terang/gelap; mode gelap mengikuti prefers-color-scheme; cetak satu halaman A4 lanskap', () => {
  const html = rd('compiler/index.html'), app = rd('compiler/app.js'), css = rd('compiler/compiler-f8.css');
  for (const id of ['pngBtn', 'printBtn', 'themeBtn']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(app, /var W = 1800/); assert.match(app, /toBlob/); assert.match(app, /beforeprint/); assert.match(app, /window\.print\(\)/);
  assert.match(css, /@media \(prefers-color-scheme:dark\)/); assert.match(css, /:root\[data-theme="dark"\]/); assert.match(css, /@page\{size:A4 landscape/); assert.match(css, /@media print/);
  assert.match(html, /compiler-f8\.css/); assert.match(html, /localStorage\.getItem\("udt-theme"\)/);
});

test('UI: Ubah, Hapus, Pulihkan hanya untuk penulis (pembaca tidak melihat tombol); jejak dibuka dari baris run; teks kecil minimal 12 px', () => {
  const app = rd('compiler/app.js'), html = rd('compiler/index.html');
  assert.match(app, /isWriter\(\) \? '<button type="button" class="btn-s mg-btn"/); assert.match(app, /\$\('rmBtn'\)\.style\.display = isWriter\(\)/);
  for (const w of ['Ubah', 'Hapus', 'Pulihkan', 'Jejak']) assert.ok(app.includes(w), w);
  for (const u of ['/api/runs/', '/delete', '/restore', '/audit', '/removed']) assert.ok(app.includes(u), u);
  assert.match(html, /id="rmBtn" class="btn2" style="display:none"/);
  assert.doesNotMatch(app + html, /font-size:(10\.5|11\.5|11)px/);
});

test('API: pembaca tidak dapat mengubah/menghapus/memulihkan (403); penulis dapat, jejak tercatat', opt, async () => {
  const { d } = await dash(/Vastrol/); const rid = d.runs.find((x) => x.key === 'F0104I26A').prof['4,5'].run_id;
  assert.equal((await R.patch(`/api/runs/${rid}`, { note: 'x' })).status, 403);
  assert.equal((await R.post(`/api/runs/${rid}/delete`, { confirm: true, reason: 'x' })).status, 403);
  assert.equal((await W.post(`/api/runs/${rid}/delete`, { confirm: true, reason: 'uji F8' })).status, 200);
  assert.equal((await R.post(`/api/runs/${rid}/restore`, { reason: 'x' })).status, 403);
  assert.equal((await W.post(`/api/runs/${rid}/restore`, { reason: 'uji F8 pulih' })).status, 200);
  assert.equal((await R.get(`/api/runs/${rid}/audit`)).json.events.length, 2);
});
