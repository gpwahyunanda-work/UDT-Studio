// F21: F20-01 (/record keadaan awal: panel sambutan, tanpa galat JS), F20-02 (token latar gelap Studio), F20-03 (pengisi tak terlihat), F20-05 (urutan analyst_id), Beranda.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createTestDb } from './helpers/db.js';
import { loggedIn, adminLoggedIn } from './helpers/http.js';
import { cleanText } from '../server/ingest.js';
import { validateAnalystName } from '../server/accounts.js';

const orig = { error: console.error, log: console.log, warn: console.warn };
let db, A, W;
const REC = '/api/record/tables';
before(async () => { for (const k of Object.keys(orig)) console[k] = () => {}; db = await createTestDb('f21'); A = await adminLoggedIn('10.21.0.1'); W = await loggedIn('Penulis F21', '10.21.0.2'); });
after(async () => { Object.assign(console, orig); await db.drop(); });

// DOM mini: cukup untuk shell/record.js pada keadaan awal (tanpa jsdom).
function mkDom(hash) {
  const mk = (id) => ({
    id, children: [], parent: null, attrs: { 'data-role': 'writer' }, value: '', listeners: {}, className: '', style: {}, _t: '',
    getAttribute(k) { return this.attrs[k] ?? null; }, setAttribute(k, v) { this.attrs[k] = v; },
    appendChild(c) { if (c.parent) c.parent.children = c.parent.children.filter((x) => x !== c); c.parent = this; this.children.push(c); return c; },
    addEventListener(t, f) { (this.listeners[t] ||= []).push(f); },
    set textContent(v) { for (const c of this.children) c.parent = null; this.children = []; this._t = v; }, get textContent() { return this._t; },
  });
  const els = {}; els.rec = mk('rec');
  els.recMain = mk('recMain'); els.recWelcome = mk('recWelcome'); els.recMain.appendChild(els.recWelcome);
  const location = { hash };
  const win = { l: {}, addEventListener(t, f) { (win.l[t] ||= []).push(f); } };
  const document = { getElementById: (id) => (id === 'recWelcome' ? (els.recWelcome.parent ? els.recWelcome : null) : (els[id] ||= mk(id))), createElement: (t) => mk(t), createTextNode: (t) => ({ text: t, children: [] }) };
  const ctx = vm.createContext({ document, window: win, location, URLSearchParams, console, localStorage: { getItem: () => null, setItem() {} },
    fetch: async (p) => ({ status: 200, json: async () => (p === '/api/record/tables' ? { tables: [] } : {}) }) });
  return { els, ctx, win, location };
}
const src = readFileSync(new URL('../shell/record.js', import.meta.url), 'utf8');
const wait = () => new Promise((r) => setTimeout(r, 30));

test('A1 F20-01: /record keadaan awal menampilkan panel sambutan tanpa galat; kembali dari tabel (hash kosong) juga', async () => {
  const d = mkDom('');
  vm.runInContext(src, d.ctx);
  await wait();
  assert.ok(d.els.recMain.children.includes(d.els.recWelcome), 'sambutan ada di recMain pada keadaan awal');
  d.els.recMain.textContent = ''; assert.equal(d.els.recMain.children.length, 0);   // seperti saat tabel dipilih
  d.location.hash = ''; for (const f of d.win.l.hashchange || []) f();
  await wait();
  assert.ok(d.els.recMain.children.includes(d.els.recWelcome), 'sambutan kembali setelah hash dikosongkan');
  assert.match(readFileSync(new URL('../server/shell.js', import.meta.url), 'utf8'), /<b>Pilih tabel di kiri<\/b>/);
});

test('B1 F20-02: latar gelap Studio = token halaman lain (#131A36), token navy merek tidak berubah', () => {
  const css = readFileSync(new URL('../theme/pharos-theme.css', import.meta.url), 'utf8');
  const bgs = [...css.matchAll(/--bg:([^;]+);--card:#131A36/g)].map((m) => m[1]);
  assert.deepEqual(bgs, ['#131A36', '#131A36'], 'mode gelap (media + data-theme)');
  assert.match(css, /--pharos-navy:#0C132B/);
  assert.ok(!/--bg:var\(--pharos-navy\)/.test(css));
});

test('C1 F20-03: pengisi tak terlihat ditolak; emoji tunggal, diakritik, Yunani, spasi biasa lolos', () => {
  for (const cp of [0x3164, 0x2800, 0x034f, 0x115f, 0x1160, 0xffa0, 0xfe0f]) {
    const c = String.fromCodePoint(cp), h = 'U+' + cp.toString(16);
    assert.equal(cleanText('A' + c + 'B'), null, h);
    assert.equal(cleanText('A' + c + 'B', { multiline: true }), null, 'ml ' + h);
    assert.throws(() => validateAnalystName('Siti' + c + 'Nur'), /tidak valid/, 'analis ' + h);
  }
  for (const ok of ['Zémyc β-Blocker', 'Ωmega 10 mg', 'Zat 😀', 'Zat ❤\uFE0F', 'Naïve Müller']) assert.equal(cleanText(ok), ok, ok);
  assert.equal(validateAnalystName('  Siti   Nurhaliza '), 'Siti Nurhaliza');
});

test('C2 F20-03 lewat API: kolom nama/identitas di Record ditolak 400; emoji lolos', async () => {
  const mk = (n) => ({ product_name: 'ZZ F21 ' + n, strength: '5 mg', dosage_form: 'Tablet', api: 'Zat' });
  const post = (values, an = 'Siti Nurhaliza') => W.post(`${REC}/compile/rows`, { analyst_name: an, reason: 'uji F21', values });
  for (const [n, c] of [['a', '\u3164'], ['b', '\u2800'], ['c', '\u034f'], ['d', '\u115f'], ['e', '\u1160'], ['f', '\uffa0'], ['g', '\ufe0f']]) {
    for (const k of ['product_name', 'strength', 'dosage_form', 'api']) { const v = mk(n); v[k] += c; const r = await post(v); assert.equal(r.status, 400, k + ' U+' + c.codePointAt(0).toString(16) + ' ' + JSON.stringify(r.json)); }
    const r = await post(mk(n), 'Siti' + c + 'Nur'); assert.equal(r.status, 400, 'analis ' + JSON.stringify(r.json));
  }
  const ok = await post({ ...mk('ok'), api: 'Zat 😀' }); assert.equal(ok.status, 201, JSON.stringify(ok.json));
});

test('D1 F20-05: penolakan 400 tidak menghabiskan urutan analyst_id; nama yang sudah ada tidak menaikkannya', async () => {
  const seq = async () => Number((await db.owner.query('SELECT last_value FROM analyst_analyst_id_seq')).rows[0].last_value);
  const row = (n) => ({ product_name: 'ZZ F21 urut ' + n, strength: '1 mg', dosage_form: 'Tablet', api: 'Zat' });
  const first = await W.post(`${REC}/compile/rows`, { analyst_name: 'Analis Urut F21', reason: 'uji', values: row(0) });
  assert.equal(first.status, 201, JSON.stringify(first.json));
  const s0 = await seq();
  const bad = await W.post(`${REC}/compile/rows`, { analyst_name: 'Analis Baru Ditolak', reason: 'uji', values: { ...row(1), product_name: 'ZZ\tF21' } });
  assert.equal(bad.status, 400);
  const tok = (await A.get(`${REC}/compile?q=${encodeURIComponent('ZZ F21 urut 0')}`)).json.rows[0].token;
  const same = await W.patch(`${REC}/compile/rows/${first.json.id}`, { analyst_name: 'Analis Baru Ditolak 2', reason: 'uji', row_token: tok, changes: { api: 'Zat' } });
  assert.equal(same.status, 400);
  assert.equal(await seq(), s0, 'urutan tidak bergerak karena penolakan');
  assert.equal((await db.owner.query("SELECT 1 FROM analyst WHERE name LIKE 'Analis Baru Ditolak%'")).rowCount, 0);
  for (let i = 2; i < 5; i++) assert.equal((await W.post(`${REC}/compile/rows`, { analyst_name: 'Analis Urut F21', reason: 'uji', values: row(i) })).status, 201);
  assert.equal(await seq(), s0, 'nama lama tidak menaikkan urutan');
});

test('E1 Beranda memuat satu kalimat: ekspor Google Sheets tidak aktif, pakai unduhan Excel dari Compiler', async () => {
  const r = await W.get('/'); assert.equal(r.status, 200);
  assert.match(JSON.stringify(r), /ekspor ke Google Sheets tidak aktif/);
});
