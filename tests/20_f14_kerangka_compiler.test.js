// F14: kerangka (Beranda, sidebar, /studio) + perbaikan UI Compiler (kuadran 2x2, perataan, satu sumber f2, urutan stabil).
// Bagian A: rute dan header (handler langsung). Bagian B: data (urutan waktu masuk, f2 resmi = matriks = ekspor). Bagian C: DOM nyata di Chrome agen (CDP 9222; dilewati bila tidak tersedia).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { createTestDb, APP_PW, TEST_PASSWORD } from './helpers/db.js';
import { Client, loggedIn, readerLoggedIn, adminLoggedIn } from './helpers/http.js';
import { REPO, loadWorkbook, hasFixtures } from './helpers/fixtures.js';
import { readWorkbook } from '../server/import/sheetReader.js';
import { PAGE_HEADERS, STUDIO_FRAME_HEADERS } from '../server/pageHeaders.js';
import { query } from '../server/db.js';
import { loadCompileData } from '../server/compileData.js';
import { buildDashboard } from '../server/dashboard.js';
import { buildXlsx } from '../server/export.js';

const rd = (f) => readFileSync(join(REPO, f), 'utf8');
let db, W, A, R, products = [];
const E10 = ['Empagliflozin10', 'Development of Empagliflozin 10 mg Tablet.xlsx'], V20 = ['Vastrol20', 'Development of Vastrol 20 mg Tablet.xlsx', ['pH_1_2', 'pH_4_5', 'pH_6_8']];
const orig = { error: console.error, log: console.log, warn: console.warn };
before(async () => {
  for (const k of Object.keys(orig)) console[k] = (...a) => { void a; };
  db = await createTestDb('f14');
  A = await adminLoggedIn('10.14.0.1'); W = await loggedIn('Penulis F14', '10.14.0.2'); R = await readerLoggedIn('10.14.0.3');
  if (hasFixtures) for (const x of [E10, V20]) { const r = await A.post('/api/imports', readWorkbook(loadWorkbook(...x))); assert.equal(r.status, 201); }
  products = (await A.get('/api/products')).json.products;
});
after(async () => { Object.assign(console, orig); await db.drop(); });

// ---------------------------------------------------------------- A. rute, kerangka, header
test('A1 tanpa sesi: / /studio /studio-app /record /architecture /index.html hanya halaman masuk (tidak ada isi aplikasi)', async () => {
  const anon = new Client('10.14.1.1');
  for (const p of ['/', '/studio', '/studio-app', '/record', '/architecture', '/index.html', '/compiler']) {
    const r = await anon.get(p); assert.equal(r.status, 200, p); assert.match(r.text, /id="em"/, p);
    assert.doesNotMatch(r.text, /udtSide|calcBatchWithStdMapping|studioFrame/, 'tidak bocor: ' + p);
  }
  for (const p of ['/shell/shell.js', '/shell/shell.css']) assert.equal((await anon.get(p)).status, 401, p);
});

test('A2 Beranda: / setelah masuk = Beranda dengan kartu ke /studio /compiler /record /architecture; TIDAK memuat Studio lagi', async () => {
  const r = await W.get('/'); assert.equal(r.status, 200);
  for (const h of ['/studio', '/compiler', '/record', '/architecture']) assert.ok(r.text.includes(`href="${h}"`), 'kartu ke ' + h);
  assert.match(r.text, /<h2 class="t">Beranda<\/h2>/); assert.match(r.text, /Penulis F14/);
  assert.doesNotMatch(r.text, /calcBatchWithStdMapping|id="steps"|Unggah Data/); assert.ok(r.text.length < 20000, 'bukan berkas Studio (11 ribu baris)');
  assert.match(r.text, /aria-current="page"[^>]*>.*?Beranda/s);
});

test('A3 /studio = pembungkus sama-asal (sidebar + iframe /studio-app); /studio-app = index.html persis, bingkai SAMEORIGIN hanya di rute ini; /index.html dialihkan', async () => {
  const studio = rd('index.html');
  const w = await W.get('/studio'); assert.equal(w.status, 200); assert.match(w.text, /<iframe id="studioFrame"[^>]*src="\/studio-app"/); assert.match(w.text, /id="udtSide"/);
  assert.equal(w.headers.get('x-frame-options'), 'DENY'); assert.match(w.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const s = await W.get('/studio-app'); assert.equal(s.status, 200); assert.equal(s.text, studio, 'isi Studio tidak diubah satu bita pun');
  assert.equal(s.headers.get('x-frame-options'), 'SAMEORIGIN'); assert.match(s.headers.get('content-security-policy'), /frame-ancestors 'self'/); assert.doesNotMatch(s.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  for (const [k, v] of Object.entries(STUDIO_FRAME_HEADERS)) assert.equal(s.headers.get(k), v, k);
  for (const p of ['/', '/compiler', '/record', '/architecture', '/studio']) { const r = await W.get(p); assert.equal(r.headers.get('x-frame-options'), 'DENY', p); assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/, p); for (const [k, v] of Object.entries(PAGE_HEADERS)) assert.equal(r.headers.get(k), v, p + ' ' + k); }
  const old = await W.get('/index.html'); assert.equal(old.status, 302); assert.equal(old.headers.get('location'), '/studio');
  assert.equal((await W.call('POST', '/studio', {})).status, 405);
});

test('A4 /record dan /architecture: halaman "segera hadir" dengan kerangka sama; /compiler memuat sidebar; peran: Pengguna hanya untuk admin; pembaca boleh melihat kerangka', async () => {
  for (const [p, name] of [['/record', 'Record'], ['/architecture', 'Architecture']]) {
    const r = await W.get(p); assert.equal(r.status, 200, p); assert.match(r.text, /Segera hadir/); assert.match(r.text, /id="udtSide"/); assert.match(r.text, new RegExp(`aria-current="page"[^>]*>.*?${name}`, 's'));
  }
  const c = await W.get('/compiler'); assert.equal(c.status, 200); assert.match(c.text, /id="udtSide"/); assert.match(c.text, /aria-current="page"[^>]*>.*?Compiler/s); assert.doesNotMatch(c.text, /UDT_SIDEBAR/);
  assert.doesNotMatch(c.text, /href="\/compiler#users"/, 'penulis tidak melihat Pengguna'); assert.match((await A.get('/compiler')).text, /href="\/compiler#users"/);
  assert.equal((await R.get('/')).status, 200); assert.equal((await R.get('/studio')).status, 200);
  for (const t of [(await W.get('/')).text, c.text]) for (const l of ['Beranda', 'Studio', 'Compiler', 'Record', 'Architecture', 'Keluar', 'Ganti kata sandi']) assert.ok(t.includes(`>${l}<`), l);
});

test('A5 kerangka: sidebar bisa diciutkan (aria-expanded), menu layar sempit, fokus terlihat, Esc menutup; tema ikut Pharos; tombol Tampilan di bilah atas sama dengan Studio', () => {
  const js = rd('shell/shell.js'), css = rd('shell/shell.css'), srv = rd('server/shell.js');
  assert.match(js, /aria-expanded/); assert.match(js, /Escape/); assert.match(js, /udt_theme/); assert.match(css, /max-width:900px/); assert.match(css, /:focus-visible/); assert.match(css, /\.udt-side\[data-collapsed="true"\]/);
  assert.match(srv, /aria-controls="udtSideNav"/); assert.match(srv, /aria-label="Navigasi utama"/); assert.match(srv, /data-theme-toggle/);
  const html = rd('compiler/index.html'); assert.match(html, /class="udt-topbar"/); assert.match(html, /UDT Compiler<\/h1>/); assert.match(html, /Analytical Development · Pharos Indonesia/); assert.match(html, /data-theme-toggle/);
  assert.match(rd('index.html'), /<h1>UDT Studio<\/h1>[\s\S]{0,80}Analytical Development · Pharos Indonesia/);
  assert.doesNotMatch(css + rd('compiler/compiler-f14.css'), /https?:\/\//, 'tanpa pustaka/CDN luar');
});

test('A6 vercel.json: rewrite + header untuk rute baru; hanya /studio-app yang SAMEORIGIN', () => {
  const v = JSON.parse(rd('vercel.json'));
  for (const src of ['/studio', '/studio-app', '/record', '/architecture', '/shell/:path*']) assert.ok(v.rewrites.some((r) => r.source === src && r.destination === '/api/[...rute]'), src);
  for (const src of ['/', '/studio', '/record', '/architecture', '/compiler']) { const g = v.headers.find((h) => h.source === src); const m = Object.fromEntries(g.headers.map((h) => [h.key.toLowerCase(), h.value])); for (const [k, val] of Object.entries(PAGE_HEADERS)) assert.equal(m[k], val, `${src} ${k}`); }
  const g = v.headers.find((h) => h.source === '/studio-app'), m = Object.fromEntries(g.headers.map((h) => [h.key.toLowerCase(), h.value]));
  for (const [k, val] of Object.entries(STUDIO_FRAME_HEADERS)) assert.equal(m[k], val, 'studio-app ' + k);
});

// ---------------------------------------------------------------- B. data
const pickProduct = (re) => products.find((p) => re.test(p.name));
test('B1 urutan tampil = waktu data masuk (entered_at = run.created_at pertama), terbaru di atas; seri sama -> tanggal uji menurun; deterministik', { skip: !hasFixtures && 'fixture sheet tidak ada' }, async () => {
  const p = pickProduct(/Empagliflozin/); const d = await buildDashboard(query, p.id); assert.ok(d.runs.length >= 4);
  for (const r of d.runs) assert.match(r.entered_at, /^\d{4}-\d\d-\d\dT[\d:.]+Z$/, r.key);
  for (let i = 1; i < d.runs.length; i++) { const a = d.runs[i - 1], b = d.runs[i]; assert.ok(a.entered_at > b.entered_at || (a.entered_at === b.entered_at && (a.date > b.date || (a.date === b.date && a.key < b.key))), `${a.key} sebelum ${b.key}`); }
  const d2 = await buildDashboard(query, p.id); assert.deepEqual(d2.runs.map((r) => r.key), d.runs.map((r) => r.key));
  // data baru masuk belakangan => tampil di ATAS walau tanggal ujinya lebih lama
  await db.owner.query("UPDATE run SET created_at = created_at + interval '1 day' WHERE batch_id IN (SELECT batch_id FROM batch WHERE compile_id=$1 AND batch_no='F0073H25A')", [p.id]);
  const d3 = await buildDashboard(query, p.id); assert.equal(d3.runs.filter((r) => !r.comp)[0].key, 'F0073H25A', 'terbaru masuk di atas, bukan menurut tanggal uji');
  await db.owner.query("UPDATE run SET created_at = created_at - interval '1 day' WHERE batch_id IN (SELECT batch_id FROM batch WHERE compile_id=$1 AND batch_no='F0073H25A')", [p.id]);
});

test('B2 satu sumber f2 resmi: nilai matriks (cells.f2) = nilai tersimpan yang dipakai ekspor (cache rumus xlsx); chip memakai nilai yang sama (kode sumber)', { skip: !hasFixtures && 'fixture sheet tidak ada' }, async () => {
  const p = pickProduct(/Empagliflozin/); const d = await buildDashboard(query, p.id), data = await loadCompileData(query, p.id);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await buildXlsx(data)); const cached = [];
  wb.eachSheet((ws) => ws.eachRow((row) => row.eachCell((c) => { const v = c.value; if (v && typeof v === 'object' && /LOG10/.test(v.formula || '') && typeof v.result === 'number') cached.push(Math.round(v.result * 10) / 10); })));
  assert.ok(cached.length > 5, 'ekspor membawa nilai f2 tersimpan');
  let n = 0;
  for (const ck of d.comp_order) for (const [key, byMed] of Object.entries(d.cells[ck])) for (const [code, c] of Object.entries(byMed)) { if (typeof c.f2 !== 'number') continue; n++; assert.ok(cached.includes(Math.round(c.f2 * 10) / 10), `${key} ${code}: matriks ${c.f2} ada di ekspor`); }
  assert.ok(n >= 9, 'banyak sel diperiksa: ' + n);
  const app = rd('compiler/app.js'); const chipLine = app.split('\n').find((l) => l.includes("chips += '<span class=\"chip"));
  assert.match(chipLine, /fmt\(c\.f2\)/); assert.doesNotMatch(chipLine, /f2s/, 'chip tidak lagi memakai hitung ulang tim');
  const cellsFor = app.split('\n').find((l) => l.includes("txt: fmt(c.f2), tip: detail(c)")); assert.ok(cellsFor, 'sel matriks = c.f2');
});

test('B3 kontrak payload: kolom urutan entered_at ada di runs; tidak ada kunci baru lain yang merusak pembaca lama', { skip: !hasFixtures && 'fixture sheet tidak ada' }, async () => {
  const p = pickProduct(/Empagliflozin/); const d = await buildDashboard(query, p.id); const r = d.runs.find((x) => !x.comp);
  for (const k of ['key', 'code', 'variant', 'date', 'prof', 'invalid', 'comp', 'entered_at']) assert.ok(k in r, k);
});

// ---------------------------------------------------------------- C. DOM nyata (Chrome agen, CDP)
const CDP = 'http://localhost:9222';
const cdpUp = async () => { try { return (await fetch(CDP + '/json/version', { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; } };
let srv, base, tab, openTab, loginSid;
async function startSrv() {
  const port = 18800 + Math.floor(Math.random() * 90); base = `http://127.0.0.1:${port}`;
  const u = new URL(db.ownerUrl); const url = `${u.protocol}//udt_app:${APP_PW}@${u.host}/${db.name}`;
  srv = spawn(process.execPath, ['server/node-server.mjs', String(port)], { cwd: REPO, env: { ...process.env, DATABASE_URL: url, SESSION_SECRET: process.env.SESSION_SECRET, APP_ENV: 'dev' }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await fetch(base + '/api/health'); return; } catch { await new Promise((r) => setTimeout(r, 150)); } }
  throw new Error('server uji tidak naik');
}
const SNAP = `(() => { const rows = [...document.querySelectorAll('#matrix .rw')].filter((r) => r.querySelector('input[data-key]')); const o = {};
  rows.forEach((r, i) => { const cb = r.querySelector('input[data-key]'), k = cb.getAttribute('data-key'), pth = r.querySelector('svg path'); o[k] = { pos: i, on: cb.checked, fill: pth ? pth.getAttribute('fill') : null, d: pth ? (pth.getAttribute('d') || '').slice(0, 14) : null }; });
  return { rows: rows.map((r) => r.querySelector('input[data-key]').getAttribute('data-key')), o, cards: document.querySelectorAll('#panels > article').length, note: document.getElementById('mxNote').textContent,
    legend: [...document.querySelectorAll('#legend svg line')].map((l) => l.getAttribute('stroke')).filter((c) => c && !['#202729', '#666666', '#8E9496'].includes(c)) }; })()`;
const click = (k) => `(() => { const e = [...document.querySelectorAll('input[data-key]')].filter((x) => x.getAttribute('data-key') === ${JSON.stringify(k)})[0]; e.click(); return true; })()`;

test('C1 DOM nyata: tepat 4 kartu sama besar, tidak ada elemen keluar kartu, catatan di dalam kartu, kolom matriks = jumlah medium, chip = matriks; urutan & penanda stabil; batas 4 menggeser yang TERTUA', { skip: !hasFixtures && 'fixture sheet tidak ada', timeout: 120000 }, async (t) => {
  if (!(await cdpUp())) return t.skip('Chrome agen (CDP 9222) tidak aktif');
  ({ openTab } = await import('../scripts/f14_visual.mjs'));
  await startSrv();
  try {
    const sidRes = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ identity: A.email, password: TEST_PASSWORD }) });
    assert.equal(sidRes.status, 200); loginSid = /udt_session=([^;]+)/.exec(sidRes.headers.get('set-cookie'))[1];
    tab = await openTab(); await tab.send('Page.enable'); await tab.send('Network.enable');
    await tab.send('Network.setCookie', { name: 'udt_session', value: loginSid, url: base, httpOnly: true });
    // produk dengan batch terbanyak (untuk uji batas 4)
    const best = (await Promise.all(products.map(async (p) => ({ p, n: (await buildDashboard(query, p.id)).runs.filter((r) => !r.comp).length })))).sort((a, b) => b.n - a.n)[0];
    for (const [w, h] of [[1366, 768], [1920, 1080]]) {
      await tab.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      for (const p of [pickProduct(/Empagliflozin/), best.p]) {
        await tab.goto(`${base}/compiler?p=${p.id}#dashboard`, "document.querySelectorAll('#panels > article').length > 0"); await tab.sleep(500);
        const dom = await tab.ev(`(() => { const R = (e) => e.getBoundingClientRect(); const arts = [...document.querySelectorAll('#panels > article')]; const out = [];
          arts.forEach((a, i) => { const ar = R(a); a.querySelectorAll('*').forEach((e) => { const r = R(e); if (!r.width || !r.height) return; if (r.left < ar.left - 1 || r.right > ar.right + 1 || r.top < ar.top - 1 || r.bottom > ar.bottom + 1) out.push(i + ':' + e.tagName + '.' + (e.getAttribute('class') || '')); }); });
          const rc = document.getElementById('rightCard'), nt = document.getElementById('chartNote'), lc = document.getElementById('leftCard');
          const hd = document.querySelector('#matrix .rw.hd'); const cols = hd.children.length;
          const bad = [...document.querySelectorAll('#matrix .rw')].filter((r) => r.children.length !== cols).length;
          const lrect = [...document.querySelectorAll('#matrix .rw > *')].filter((e) => R(e).left < R(lc).left - 1 || R(e).right > R(lc).right + 1).length;
          const chipBad = []; document.querySelectorAll('.chip[data-chip]').forEach((c) => { const [k, med] = c.getAttribute('data-chip').split('|'); const art = c.closest('article'); const mname = art.querySelector('h3').textContent; const heads = [...hd.children].slice(2).map((h) => h.firstElementChild.textContent); const idx = heads.indexOf(mname); const row = [...document.querySelectorAll('#matrix .rw')].filter((r) => { const cb = r.querySelector('input[data-key]'); return cb && cb.getAttribute('data-key') === k; })[0]; const cell = row.children[2 + idx].textContent.trim(); const chip = c.textContent.split('\\u00b7').pop().trim(); if (cell.replace(/[^0-9,]/g, '') !== chip) chipBad.push(k + '/' + mname + ' matriks ' + cell + ' chip ' + chip); });
          const sizes = arts.map((a) => [Math.round(R(a).width), Math.round(R(a).height)]);
          return { cards: arts.length, sizes, out, noteInside: R(nt).bottom <= R(rc).bottom + 1 && R(nt).top >= R(rc).top, cols, bad, lrect, chipBad, nchips: document.querySelectorAll('.chip[data-chip]').length, hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            ticks: (() => { const s = arts[0] && arts[0].querySelector('svg'); if (!s) return null; const tm = [...s.querySelectorAll('text.tm')]; const ax = tm[tm.length - 1], t0 = tm[0]; return R(ax).top - R(t0).bottom; })(), medNames: [...hd.children].slice(2).length }; })()`);
        const tag = `${w} ${p.name}`;
        assert.equal(dom.cards, 4, 'tepat 4 kartu ' + tag); assert.ok(dom.sizes.every((s) => Math.abs(s[0] - dom.sizes[0][0]) <= 1 && Math.abs(s[1] - dom.sizes[0][1]) <= 1), 'ukuran sama ' + JSON.stringify(dom.sizes) + tag);
        assert.deepEqual(dom.out, [], 'tidak ada elemen keluar kartu ' + tag); assert.equal(dom.noteInside, true, 'catatan kaki di dalam kartu ' + tag);
        assert.equal(dom.bad, 0, 'tiap baris matriks punya jumlah sel = header ' + tag); assert.equal(dom.lrect, 0, 'tidak ada sel meluber ke luar kartu matriks ' + tag); assert.equal(dom.hscroll, false, 'tanpa gulir horizontal halaman ' + tag);
        assert.deepEqual(dom.chipBad, [], 'chip = matriks ' + tag); assert.ok(dom.nchips >= 3, 'ada chip ' + tag); assert.ok(dom.ticks === null || dom.ticks >= 2, 'label sumbu tidak menabrak angka tick (jarak ' + dom.ticks + ') ' + tag);
      }
    }
    // ---- urutan stabil + batas 4 (produk batch terbanyak, 1920)
    await tab.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await tab.goto(`${base}/compiler?p=${best.p.id}#dashboard`, "document.querySelectorAll('#matrix input[data-key]').length > 0"); await tab.sleep(500);
    const api = await tab.ev(`fetch('/api/products/${best.p.id}/dashboard').then((r) => r.json()).then((j) => j.runs.filter((r) => !r.comp && Object.values(r.prof).some((x) => x.valid)).map((r) => r.key))`);
    const s0 = await tab.ev(SNAP); assert.deepEqual(s0.rows, api, 'baris matriks = urutan waktu masuk dari server');
    const on0 = s0.rows.filter((k) => s0.o[k].on); assert.ok(on0.length >= 1);
    const X = on0[0];
    await tab.ev(click(X)); const s1 = await tab.ev(SNAP); assert.equal(s1.o[X].on, false); assert.deepEqual(s1.rows, s0.rows, 'urutan baris tidak berubah saat dibuka centang');
    await tab.ev(click(X)); const s2 = await tab.ev(SNAP); assert.deepEqual(s2.o[X], s0.o[X], 'centang-buka-centang: posisi, warna, bentuk kembali semula'); assert.deepEqual(s2.rows, s0.rows);
    // batch lain dicentang: penanda batch X tidak bergeser
    const other = s0.rows.find((k) => !s0.o[k].on);
    if (other) { await tab.ev(click(other)); const s3 = await tab.ev(SNAP); assert.deepEqual(s3.o[X], s0.o[X], 'X tidak bergeser'); await tab.ev(click(other)); }
    // urutan klik tidak menentukan penanda: centang semua yang aktif dari belakang ke depan = penanda sama
    const sel = s0.rows.filter((k) => s0.o[k].on);
    for (const k of sel) await tab.ev(click(k)); for (const k of [...sel].reverse()) await tab.ev(click(k));
    const s4 = await tab.ev(SNAP); for (const k of sel) assert.deepEqual(s4.o[k], s0.o[k], 'urutan klik terbalik: penanda ' + k + ' sama'); assert.deepEqual(s4.legend, s0.legend, 'legenda seri sama (berurutan menurut waktu masuk)');
    // batas 4 (butuh >= 5 batch valid)
    if (s0.rows.length >= 5) {
      for (const k of s0.rows) { const s = await tab.ev(SNAP); if (s.rows.filter((x) => s.o[x].on).length >= 4) break; if (!s.o[k].on) await tab.ev(click(k)); }
      const full = await tab.ev(SNAP), onK = full.rows.filter((k) => full.o[k].on); assert.equal(onK.length, 4);
      const fifth = full.rows.find((k) => !full.o[k].on), oldest = onK[onK.length - 1];   // baris menurun menurut waktu masuk: terakhir = tertua
      await tab.ev(click(fifth)); const after = await tab.ev(SNAP); const onA = after.rows.filter((k) => after.o[k].on);
      assert.equal(onA.length, 4, 'tetap 4'); assert.ok(onA.includes(fifth) && !onA.includes(oldest), 'yang tertua (menurut waktu masuk) yang dilepas: ' + oldest);
      assert.match(after.note, new RegExp(oldest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); assert.match(after.note, /paling banyak 4 batch/);
      for (const k of onK.filter((x) => x !== oldest)) assert.deepEqual(after.o[k], full.o[k], 'penanda ' + k + ' tidak bergeser oleh pergeseran');
      assert.equal(after.cards, 4);
    }
    // kartu keempat: Air bila ada, Release bila ada, tab bila keduanya, kosong sama ukuran bila tidak ada
    const q4 = await tab.ev(`(() => { const a = document.querySelectorAll('#panels > article')[3]; return { med: a.getAttribute('data-med'), tabs: [...a.querySelectorAll('[data-med4]')].map((b) => b.getAttribute('data-med4')) }; })()`);
    assert.ok(['Air', 'Release'].includes(q4.med), 'kartu keempat = Air atau Release: ' + q4.med);
  } finally { try { await tab.close(); } catch { /* */ } srv.kill(); }
});

test('C2 aturan kartu keempat (fungsi tampilan): Air > Release > kosong; tab bila keduanya; tidak pernah kartu kelima (kode)', () => {
  const app = rd('compiler/app.js');
  assert.match(app, /FIRST3 = \['1,2', '4,5', '6,8'\]/); assert.match(app, /cand\.length > 1 \? '<div class="tabs"/); assert.match(app, /\(rest\[0\] \|\| null\)/);
  assert.match(app, /\(m4 \? panelHtml\(m4, tabs4\) : ''\)/, 'panel = 3 + satu kartu keempat');
  assert.match(rd('compiler/compiler-f14.css'), /#panels\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);grid-auto-rows:1fr/);
  assert.match(rd('compiler/compiler-f14.css'), /repeat\(var\(--mc\),minmax\(64px,76px\)\)/, 'kolom matriks mengikuti jumlah medium');
});

test('C3 kartu keempat dengan Air DAN Release berdata: satu kartu dengan tab (Air | Release), tetap 4 kartu sama besar; pindah tab tidak membuat kartu kelima', { skip: !hasFixtures && 'fixture sheet tidak ada', timeout: 120000 }, async (t) => {
  if (!(await cdpUp())) return t.skip('Chrome agen (CDP 9222) tidak aktif');
  ({ openTab } = await import('../scripts/f14_visual.mjs'));
  const p = pickProduct(/Vastrol/); const mk = (o) => ({ medium: 'Air', batch: 'F0998Z26A', variant: '', test_date: '2026-11-02', comparator: 'B41968', push_id: randomUUID(), timepoints: [5, 10, 15, 20, 30, 45, 60],
    vessels: [{ no: 1, values: [78.7, 84.4, 87.3, 88.8, 90, 92, 95] }, { no: 2, values: [60, 70, 75, 80, 82, 85, 92] }, { no: 3, values: [55, 70, 76, 82, 84, 86, 93] }], ...o });
  for (const m of ['Air', 'Release']) { const r = await W.post(`/api/products/${p.id}/runs`, mk({ medium: m, batch: m === 'Air' ? 'F0998Z26A' : 'F0997Z26A', push_id: randomUUID() })); assert.ok([200, 201].includes(r.status), `simpan ${m}: ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`); }
  await startSrv();
  try {
    const sid = /udt_session=([^;]+)/.exec((await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ identity: A.email, password: TEST_PASSWORD }) })).headers.get('set-cookie'))[1];
    tab = await openTab(); await tab.send('Page.enable'); await tab.send('Network.enable'); await tab.send('Network.setCookie', { name: 'udt_session', value: sid, url: base, httpOnly: true });
    await tab.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await tab.goto(`${base}/compiler?p=${p.id}#dashboard`, "document.querySelectorAll('#panels > article').length > 0"); await tab.sleep(500);
    const Q = `(() => { const a = [...document.querySelectorAll('#panels > article')]; const R = (e) => e.getBoundingClientRect(); return { n: a.length, med: a[3].getAttribute('data-med'), tabs: [...a[3].querySelectorAll('[data-med4]')].map((b) => b.getAttribute('data-med4') + ':' + b.getAttribute('aria-selected')), sizes: a.map((x) => [Math.round(R(x).width), Math.round(R(x).height)]), svg: !!a[3].querySelector('svg') }; })()`;
    const q1 = await tab.ev(Q); assert.equal(q1.n, 4); assert.equal(q1.med, 'Air', 'Air diutamakan'); assert.deepEqual(q1.tabs, ['Air:true', 'Release:false']); assert.equal(q1.svg, true);
    await tab.ev("document.querySelector('[data-med4=\"Release\"]').click()"); await tab.sleep(200);
    const q2 = await tab.ev(Q); assert.equal(q2.n, 4); assert.equal(q2.med, 'Release'); assert.deepEqual(q2.tabs, ['Air:false', 'Release:true']);
    for (const q of [q1, q2]) assert.ok(q.sizes.every((s) => Math.abs(s[0] - q.sizes[0][0]) <= 1 && Math.abs(s[1] - q.sizes[0][1]) <= 1), 'ukuran sama ' + JSON.stringify(q.sizes));
  } finally { try { await tab.close(); } catch { /* */ } srv.kill(); }
});
