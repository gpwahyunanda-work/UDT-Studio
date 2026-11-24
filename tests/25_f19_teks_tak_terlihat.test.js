// F19: F18-01 (karakter kendali/format tak terlihat ditolak di SEMUA kolom teks), F18-02 (page > pages = 400), F18-03 (CSS latar gelap + scrollbar-gutter), data lama tetap terbaca.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTestDb } from './helpers/db.js';
import { loggedIn, adminLoggedIn } from './helpers/http.js';
import { cleanText } from '../server/ingest.js';
import { validateAnalystName } from '../server/accounts.js';
import { readWorkbook } from '../server/import/sheetReader.js';
import { loadWorkbook, hasFixtures } from './helpers/fixtures.js';
import { scanBadText } from '../scripts/cek_teks_lama.mjs';

const orig = { error: console.error, log: console.log, warn: console.warn };
let db, A, W;
const REC = '/api/record/tables';
const BAD = { TAB: 'A\tB', ZWSP: 'A\u200bB', RLO: 'A\u202eB', BEL: 'A\u0007B', BOM: 'A\ufeffB', LS: 'A\u2028B', SHY: 'A\u00adB' };
before(async () => {
  for (const k of Object.keys(orig)) console[k] = () => {};
  db = await createTestDb('f19');
  A = await adminLoggedIn('10.19.0.1'); W = await loggedIn('Penulis F19', '10.19.0.2');
});
after(async () => { Object.assign(console, orig); await db.drop(); });

test('A1 cleanText: tolak TAB, U+200B, U+202E, BEL; normalisasi spasi; multiline hanya mengizinkan LF', () => {
  for (const [k, v] of Object.entries(BAD)) assert.equal(cleanText(v), null, k);
  assert.equal(cleanText('  Zemyc   150  mg \u00a0 Tablet '), 'Zemyc 150 mg Tablet');
  assert.equal(cleanText('a\nb'), null, 'LF ditolak di kolom satu baris');
  assert.equal(cleanText('a \r\n  b\n\n\n\nc', { multiline: true }), 'a\nb\n\nc');
  assert.equal(cleanText('a\tb', { multiline: true }), null);
  assert.equal(cleanText('a\u200bb', { multiline: true }), null);
  assert.equal(cleanText(5), null);
});

test('A2 nama analis: tolak Cc/Cf/TAB; spasi ganda digabung', () => {
  for (const [k, v] of Object.entries(BAD)) assert.throws(() => validateAnalystName('Siti ' + v), /tidak valid/, k);
  assert.equal(validateAnalystName('  Siti   Nurhaliza '), 'Siti Nurhaliza');
});

test('B1 POST /api/compiles menolak TAB/ZWSP/RLO/BEL di product_name, strength, dosage_form, api; spasi dinormalkan', async () => {
  for (const f of ['product_name', 'strength', 'dosage_form', 'api']) for (const [k, v] of Object.entries(BAD)) {
    const b = { product_name: 'ZZ F19', strength: '10 mg', dosage_form: 'Tablet', api: 'Zat', analyst_name: 'Siti Nurhaliza', [f]: 'ZZ F19 ' + v };
    const r = await W.post('/api/compiles', b); assert.equal(r.status, 400, `${f} ${k} ${JSON.stringify(r.json)}`);
  }
  const ok = await W.post('/api/compiles', { product_name: '  ZZ   F19  ', strength: '10  mg', dosage_form: 'Tablet', analyst_name: 'Siti  Nurhaliza' });
  assert.equal(ok.status, 201, JSON.stringify(ok.json));
  const row = (await db.owner.query('SELECT product_name, strength FROM compile WHERE compile_id=$1', [ok.json.compile_id])).rows[0];
  assert.deepEqual(row, { product_name: 'ZZ F19', strength: '10 mg' });
  assert.equal((await db.owner.query("SELECT 1 FROM analyst WHERE name='Siti Nurhaliza'")).rowCount, 1, 'nama analis dinormalkan');
});

test('B2 Record: insert/ubah menolak TAB/ZWSP/RLO/BEL di kolom teks, alasan, nama analis; yang bersih dinormalkan', async () => {
  const mk = { product_name: 'ZZ F19 R', strength: '5 mg', dosage_form: 'Tablet', title: 'ZZ F19 R' };
  const base = { analyst_name: 'Siti Nurhaliza', reason: 'Uji F19' };
  for (const [k, v] of Object.entries(BAD)) {
    assert.equal((await W.post(`${REC}/compile/rows`, { ...base, values: { ...mk, product_name: 'ZZ F19 ' + v } })).status, 400, 'product_name ' + k);
    assert.equal((await W.post(`${REC}/compile/rows`, { ...base, values: { ...mk, api: 'X' + v } })).status, 400, 'api ' + k);
    assert.equal((await W.post(`${REC}/compile/rows`, { ...base, reason: 'alasan ' + v, values: mk })).status, 400, 'alasan ' + k);
    assert.equal((await W.post(`${REC}/compile/rows`, { ...base, analyst_name: 'Siti ' + v, values: mk })).status, 400, 'analis ' + k);
  }
  const ins = await W.post(`${REC}/compile/rows`, { analyst_name: 'Siti  Nurhaliza', reason: '  Uji   F19 ', values: { ...mk, product_name: '  ZZ  F19   R ' } });
  assert.equal(ins.status, 201, JSON.stringify(ins.json));
  const cur = (await db.owner.query("SELECT compile_id FROM compile WHERE product_name='ZZ F19 R'")).rows[0];
  assert.ok(cur, 'baris tersimpan dengan spasi dinormalkan');
  const list = (await A.get(`${REC}/compile?q=${encodeURIComponent('ZZ F19 R')}`)).json.rows;
  const tok = list[0].token;
  assert.ok(tok);
  for (const [k, v] of Object.entries(BAD)) {
    const r = await W.patch(`${REC}/compile/rows/${cur.compile_id}`, { ...base, row_token: tok, changes: { api: 'X' + v } });
    assert.equal(r.status, 400, 'ubah api ' + k + ' ' + JSON.stringify(r.json));
  }
});

test('C1 F18-02: page di atas jumlah halaman = 400 (konsisten dengan angka sangat besar); page terakhir tetap 200', async () => {
  const j = (await A.get(`${REC}/audit_event`)).json;
  assert.equal((await A.get(`${REC}/audit_event?page=${j.pages}`)).status, 200);
  for (const p of [j.pages + 1, j.pages + 500, 100001, 999999, 99999999]) assert.equal((await A.get(`${REC}/audit_event?page=${p}`)).status, 400, 'page ' + p);
});

test('D1 data lama dengan karakter tak terlihat tetap terbaca (tidak diubah, tidak gagal)', async () => {
  await db.owner.query("INSERT INTO analyst(name) VALUES ('Lama F19') ON CONFLICT DO NOTHING");
  await db.owner.query("INSERT INTO compile(product_name,strength,dosage_form,title,created_by) SELECT $1,'1 mg','Tablet','Lama F19',analyst_id FROM analyst WHERE name='Lama F19'", ['ZZ Lama\u200b\tF19']);
  const r = await W.get(`${REC}/compile?q=Lama`); assert.equal(r.status, 200);
  assert.ok(r.json.rows.length >= 1, 'baris lama terbaca');
  assert.equal((await W.get(`${REC}/compile/csv`)).status, 200);
  assert.equal((await W.get('/api/compiles')).status, 200);
  assert.equal((await W.get('/api/products')).status, 200);
  assert.equal((await db.owner.query("SELECT 1 FROM compile WHERE product_name LIKE '%'||chr(8203)||'%'")).rowCount, 1, 'tidak diubah');
  const rep = await scanBadText((s, p) => db.owner.query(s, p));   // laporan baca-saja menemukan baris lama itu
  const f = rep.find((x) => x.tabel === 'compile' && x.kolom === 'product_name');
  assert.ok(f && f.baris_karakter_terlarang === 1, JSON.stringify(rep));
  assert.equal((await db.owner.query("SELECT 1 FROM compile WHERE product_name LIKE '%'||chr(8203)||'%'")).rowCount, 1, 'pemindaian tidak mengubah');
});

test('E1 F18-03: satu token latar gelap (aturan navy Compiler dihapus) + scrollbar-gutter stable di CSS bersama', () => {
  const f8 = readFileSync(new URL('../compiler/compiler-f8.css', import.meta.url), 'utf8'), sh = readFileSync(new URL('../shell/shell.css', import.meta.url), 'utf8');
  assert.ok(!/body\{background:var\(--pharos-navy\)\}/.test(f8), 'tidak ada latar body navy di Compiler');
  assert.match(sh, /html\{scrollbar-gutter:stable\}/); assert.match(sh, /\nbody\{background:var\(--pharos-white\)\}/);
  assert.match(sh, /:root\[data-theme="dark"\]\{[^}]*\n?\s*--pharos-white:#131A36/);
});

test('F1 impor sheet: product_name, batch, catatan, alasan dengan TAB/ZWSP/RLO/BEL ditolak 400; catatan multi-baris bersih tetap lolos', { skip: hasFixtures ? false : 'fixture tidak ada' }, async () => {
  const mk = () => structuredClone(readWorkbook(loadWorkbook('Empagliflozin10', 'Development of Empagliflozin 10 mg Tablet.xlsx')));
  const muts = { product_name: (p, v) => { p.compile.product_name = 'Zat ' + v; }, batch_no: (p, v) => { p.runs[0].batch_no = 'B' + v; }, note: (p, v) => { p.runs[0].note = 'cat ' + v; }, strength: (p, v) => { p.compile.strength = '10 mg ' + v; } };
  for (const [f, m] of Object.entries(muts)) for (const [k, v] of Object.entries({ TAB: '\t', ZWSP: '\u200b', RLO: '\u202e', BEL: '\u0007' })) {
    const p = mk(); m(p, v); p.analyst_name = 'Siti Nurhaliza';
    const r = await A.post('/api/imports', p); assert.equal(r.status, 400, `${f} ${k} ${JSON.stringify(r.json).slice(0, 200)}`);
  }
  const p = mk(); p.runs[0].note = 'baris satu\r\nbaris   dua'; p.analyst_name = 'Siti Nurhaliza';
  const ok = await A.post('/api/imports', p); assert.equal(ok.status, 201, JSON.stringify(ok.json).slice(0, 300));
  const n = (await db.owner.query("SELECT note FROM run WHERE note LIKE 'baris satu%'")).rows[0]?.note; assert.equal(n, 'baris satu\nbaris dua');
});
