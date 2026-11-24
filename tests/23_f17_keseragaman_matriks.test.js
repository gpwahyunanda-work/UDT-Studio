// F17 (arahan Wahyu 24 Nov): (A) keseragaman lebar/bilah atas/stepper Studio = Compiler = Beranda = Record = Architecture (selisih <= 1 px, 1366 dan 1920, terang dan gelap);
// (B) matriks f2: tanpa tumpang tindih sel, kolom Aksi/peringatan sendiri, chip di bawah nama, lebar penuh bila > 4 medium, legenda lengkap. DOM nyata lewat Chrome agen (CDP 9222).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createTestDb, APP_PW } from './helpers/db.js';
import { loginAs, } from './helpers/http.js';
import { REPO, loadWorkbook, hasFixtures } from './helpers/fixtures.js';
import { readWorkbook } from '../server/import/sheetReader.js';
import { openTab } from '../scripts/f14_visual.mjs';
import { PAGES, MEASURE } from '../scripts/f17_layout.mjs';

const rd = (f) => readFileSync(join(REPO, f), 'utf8');
const CDP = 'http://localhost:9222';
const cdpUp = async () => { try { return (await fetch(CDP + '/json/version', { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; } };
const skip = !hasFixtures ? 'fixture sheet tidak ada' : false;
let db, A, srv, base, sid, tab;
const EVID = process.env.UDT_F17_EVID || '';

before(async () => {
  if (!hasFixtures) return;
  db = await createTestDb('f17ui'); A = await loginAs('Admin F17', 'admin', '10.17.5.1');
  for (const x of [['Empagliflozin10', 'Development of Empagliflozin 10 mg Tablet.xlsx'], ['Empagliflozin25', 'Development of Empagliflozin 25 mg Tablet.xlsx', ['UDT_Release', 'UDT_pH_1_2', 'UDT_pH_4_5', 'UDT_pH_6_8']], ['Vastrol20', 'Development of Vastrol 20 mg Tablet.xlsx', ['pH_1_2', 'pH_4_5', 'pH_6_8']]]) {
    const r = await A.post('/api/imports', readWorkbook(loadWorkbook(...x))); assert.equal(r.status, 201, JSON.stringify(r.json));
  }
});
after(async () => { try { if (tab) await tab.close(); } catch { /* */ } if (srv) srv.kill(); if (db) await db.drop(); });

async function up() {
  const port = 18900 + Math.floor(Math.random() * 90); base = `http://127.0.0.1:${port}`;
  const u = new URL(db.ownerUrl); const url = `${u.protocol}//udt_app:${APP_PW}@${u.host}/${db.name}`;
  srv = spawn(process.execPath, ['server/node-server.mjs', String(port)], { cwd: REPO, env: { ...process.env, DATABASE_URL: url, SESSION_SECRET: process.env.SESSION_SECRET, APP_ENV: 'dev' }, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await fetch(base + '/api/health'); break; } catch { await new Promise((r) => setTimeout(r, 150)); } }
  const lr = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ identity: A.email, password: 'kata-sandi-uji-tim' }) });
  assert.equal(lr.status, 200); sid = /udt_session=([^;]+)/.exec(lr.headers.get('set-cookie'))[1];
  tab = await openTab(); await tab.send('Page.enable'); await tab.send('Network.enable');
  await tab.send('Network.setCookie', { name: 'udt_session', value: sid, url: base, httpOnly: true });
}
const theme = (t) => tab.ev(`(() => { localStorage.setItem('udt_theme','${t}'); localStorage.setItem('udt-theme','${t}'); document.documentElement.setAttribute('data-theme','${t}'); })()`);

test('A Keseragaman: bilah atas, stepper, kontainer isi, token lebar: selisih <= 1 px terhadap Studio di 5 halaman x 1366/1920 x terang/gelap', { skip, timeout: 240000 }, async (t) => {
  if (!(await cdpUp())) return t.skip('Chrome agen (CDP 9222) tidak aktif');
  await up();
  const rows = [];
  for (const w of [1366, 1920]) {
    await tab.send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
    for (const th of ['light', 'dark']) for (const [path, name] of PAGES) {
      await tab.goto(base + path, 'document.readyState==="complete"'); await theme(th); await tab.sleep(900);
      rows.push({ page: name, w, theme: th, ...(await tab.ev(MEASURE)) });
    }
  }
  const eff = (x) => x.content[0] + parseFloat(x.content_pad || 0) - (x.side ? x.side[2] : 0);
  for (const r of rows) {
    const s = rows.find((x) => x.page === 'studio' && x.w === r.w && x.theme === r.theme), id = `${r.page} ${r.w} ${r.theme}`;
    assert.ok(r.topbar && r.content, 'ada bilah atas dan isi: ' + id);
    assert.ok(Math.abs(r.topbar[3] - s.topbar[3]) <= 1, `tinggi bilah atas ${id}: ${r.topbar[3]} vs ${s.topbar[3]}`);
    assert.equal(r.content_pad, '24px', 'padding isi ' + id);
    assert.ok(!r.hscroll, 'tanpa gulir horizontal ' + id);
    if (r.w === 1920) assert.ok(Math.abs(r.content[2] - s.content[2]) <= 1, `lebar isi ${id}: ${r.content[2]} vs ${s.content[2]}`);   // 1600 px sama di semua halaman
    else assert.ok(Math.abs(eff(r) - eff(s)) <= 1, `inset kiri efektif ${id}`);                                                              // 1366: sidebar memakan ruang; tepi dalam sama
    assert.equal(r.brand_font, s.brand_font, 'ukuran judul bilah atas ' + id); assert.equal(r.btn_font, s.btn_font, 'font tombol Tampilan ' + id);
    assert.ok(Math.abs(r.btn[3] - s.btn[3]) <= 1, `tinggi tombol Tampilan ${id}`); assert.ok(Math.abs(r.brandH1[3] - s.brandH1[3]) <= 1, `tinggi judul bilah ${id}`);
    if (r.stepper) assert.ok(Math.abs(r.stepper[3] - s.stepper[3]) <= 1, `tinggi stepper ${id}: ${r.stepper[3]} vs ${s.stepper[3]}`);
  }
  if (EVID) { mkdirSync(EVID, { recursive: true }); writeFileSync(join(EVID, 'layout_uji.json'), JSON.stringify(rows, null, 1)); }
});

test('A2 Sumber: satu token lebar (1600 / 24 px) dipakai semua halaman; tidak ada lebar 1100/1400/1480/1360 tersisa', () => {
  const sh = rd('shell/shell.css'); assert.match(sh, /--udt-wrap-max:1600px/); assert.match(sh, /--udt-pad-x:24px/);
  for (const f of ['shell/shell.css', 'shell/record.css', 'shell/architecture.css', 'compiler/compiler-f14.css']) assert.doesNotMatch(rd(f), /max-width:(1100|1400|1480|1360)px/, f);
  assert.doesNotMatch(rd('compiler/compiler-f14.css'), /padding:14px 40px|padding:20px 40px/);
  for (const f of ['shell/record.css', 'shell/architecture.css']) assert.match(rd(f), /var\(--udt-wrap-max\)/, f);
});

test('B Matriks: produk 5 medium (Empagliflozin 25 dan 10 mg), semua baris, 1366 dan 1920, terang dan gelap: tanpa tumpang tindih, kolom sendiri, chip di bawah nama, lebar penuh', { skip, timeout: 240000 }, async (t) => {
  if (!(await cdpUp())) return t.skip('Chrome agen (CDP 9222) tidak aktif');
  if (!tab) await up();
  const prods = (await A.get('/api/products')).json.products.filter((p) => /Empagliflozin/.test(p.name));
  assert.equal(prods.length, 2);
  const CHECK = `(() => { const R = (e) => e.getBoundingClientRect(); const inter = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    const hd = document.querySelector('#matrix .rw.hd'); const cols = hd.children.length, mc = Number(getComputedStyle(document.getElementById('matrix')).getPropertyValue('--mc'));
    const rows = [...document.querySelectorAll('#matrix .rw')].filter((r) => !r.classList.contains('hd')); const overlaps = [], outside = [], heights = []; let held = 0, withChip = 0, heldBox = [];
    const lc = R(document.getElementById('leftCard')), rc = R(document.getElementById('rightCard'));
    [hd, ...rows].forEach((r, ri) => { const kids = [...r.children]; if (kids.length !== cols) overlaps.push('jumlah sel ' + ri);
      for (let i = 0; i < kids.length; i++) { const a = R(kids[i]); if (a.left < lc.left - 1 || a.right > lc.right + 1) outside.push(ri + ':' + i);
        for (let j = i + 1; j < kids.length; j++) { const b = R(kids[j]); if (a.width && b.width && inter(a, b)) overlaps.push(ri + ':' + i + 'x' + j); }
        // isi sel tidak keluar dari kotak selnya
        kids[i].querySelectorAll('*').forEach((e) => { const q = R(e); if (q.left < -1000) return; if (q.width && q.height && (q.left < a.left - 1 || q.right > a.right + 1) && getComputedStyle(kids[i]).overflow === 'visible') outside.push(ri + ':' + i + ':' + e.tagName); }); }
      if (ri > 0) { heights.push(Math.round(R(r).height)); const hc = r.querySelector('.cell.k-pend'); if (hc) { held++; const vb = r.querySelector('.cell:not(.k-pend)'); heldBox.push([Math.round(R(hc).height), vb ? Math.round(R(vb).height) : null, Math.round(R(hc).width), vb ? Math.round(R(vb).width) : null]); } if (r.querySelector('.vchip')) { withChip++; const n = R(r.querySelector('.bcode')), v = R(r.querySelector('.vchip')); if (v.top < n.bottom - 1) overlaps.push('chip tidak di bawah nama ' + ri); } } });
    const heads = [...hd.children].map((h) => h.textContent.trim().replace(/\\s+/g, ' ')); const act = rows.filter((r) => r.querySelector('.mg-btn')).map((r) => R(r.querySelector('.mg-btn')).right); const hdAct = R(hd.lastElementChild).right;
    const batchW = Math.round(R(rows[0].children[1]).width);
    return { cols, mc, n: rows.length, overlaps, outside: [...new Set(outside)].slice(0, 8), heights, held, heldBox, withChip, heads, actRights: [...new Set(act.map((x) => Math.round(x)))], hdAct: Math.round(hdAct), batchW, legend: document.querySelector('.mx-legend').textContent, wide: document.querySelector('.split').classList.contains('wide'), lcw: Math.round(lc.width), rcw: Math.round(rc.width), rcTop: Math.round(rc.top), lcBottom: Math.round(lc.bottom), hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 }; })()`;
  const table = [];
  for (const w of [1366, 1920]) {
    await tab.send('Emulation.setDeviceMetricsOverride', { width: w, height: 1000, deviceScaleFactor: 1, mobile: false });
    for (const th of ['light', 'dark']) for (const p of prods) {
      await tab.goto(`${base}/compiler?p=${p.id}#dashboard`, "document.querySelectorAll('#matrix .rw').length > 2"); await theme(th); await tab.sleep(700);
      const d = await tab.ev(CHECK), id = `${p.name} ${w} ${th}`;
      assert.equal(d.mc, 5, '5 medium ' + id); assert.equal(d.cols, d.mc + 4, 'kolom = centang + batch + medium + peringatan + aksi ' + id);
      assert.deepEqual(d.overlaps, [], 'tidak ada tumpang tindih sel ' + id); assert.deepEqual(d.outside, [], 'tidak ada isi keluar kotak ' + id);
      assert.ok(d.n >= 3, 'baris ' + id); assert.equal(d.hscroll, false, id);
      assert.equal(d.wide, true, '> 4 medium: matriks lebar penuh ' + id); assert.ok(Math.abs(d.lcw - d.rcw) <= 2, `lebar kartu matriks = lebar kartu grafik ${id}`); assert.ok(d.rcTop >= d.lcBottom - 1, 'grafik di bawah matriks ' + id);
      assert.ok(d.batchW >= 220, 'kolom Batch >= 220 px ' + id + ': ' + d.batchW);
      const nonChip = Math.min(...d.heights); assert.ok(Math.max(...d.heights) - nonChip <= 22, `baris ber-chip tidak lebih tinggi dari baris lain > 1 baris teks ${id}: ${d.heights}`);
      assert.deepEqual(d.actRights.length, 1, 'tombol Kelola lurus (tepi kanan sama) ' + id + JSON.stringify(d.actRights));
      assert.ok(Math.abs(d.actRights[0] - d.hdAct) <= 12, 'tombol Kelola sejajar dengan header Aksi ' + id);
      assert.equal(d.heads[d.heads.length - 1], 'Aksi'); assert.ok(d.heads.some((x) => x.startsWith('Release')) && d.heads.some((x) => x.startsWith('Air')));
      for (const hb of d.heldBox) assert.ok(hb[3] === null || (Math.abs(hb[0] - hb[1]) <= 1), 'sel ditahan setinggi sel nilai ' + id + JSON.stringify(hb));
      for (const k of ['Ditahan saat impor', 'Run tidak valid', 'Ada temuan di Perlu dicek', 'penanda batch', 'Baru dikirim', 'Similar', 'Not Similar', 'Sangat cepat', 'Angka resmi = Langkah 4']) assert.ok(d.legend.includes(k), `legenda memuat "${k}" ${id}`);
      table.push({ produk: p.name, w, tema: th, baris: d.n, kolom: d.cols, batchW: d.batchW, tinggi: [Math.min(...d.heights), Math.max(...d.heights)], ditahan: d.held, chip: d.withChip, lebar_penuh: d.wide, tumpang_tindih: d.overlaps.length });
    }
  }
  // F16-02: blok ditahan (Empagliflozin 25 mg, F0058D26A 500mL pH 6,8): chip grafik = matriks = 'ditahan', tanpa angka
  const p25 = prods.find((x) => /25 mg/.test(x.name));
  await tab.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1000, deviceScaleFactor: 1, mobile: false });
  await tab.goto(`${base}/compiler?p=${p25.id}#dashboard`, "document.querySelectorAll('#matrix .rw').length > 2"); await tab.sleep(600);
  const hc = await tab.ev(`(() => { const K = 'F0058D26A 500mL'; const cb = [...document.querySelectorAll('input[data-key]')].find((x) => x.getAttribute('data-key') === K); if (!cb) return { err: 'baris tidak ada' }; if (!cb.checked) cb.click();
    const chip = [...document.querySelectorAll('.chip[data-chip]')].find((c) => c.getAttribute('data-chip') === K + '|6,8'); const row = cb.closest('.rw'); const held = row.querySelector('.cell.k-pend');
    return { chip: chip ? chip.textContent.trim() : null, held: !!held, heldText: held ? held.textContent.trim() : null, cells: [...row.querySelectorAll('.cell')].map((c) => c.textContent.trim()) }; })()`);
  assert.equal(hc.err, undefined); assert.ok(hc.held, 'sel matriks ditahan'); assert.equal(hc.heldText, '', 'sel ditahan tanpa angka');
  assert.ok(hc.chip && /ditahan$/.test(hc.chip) && !/\d+[,.]\d/.test(hc.chip.replace(/F0058D26A 500mL/, '')), 'chip ditahan tanpa angka f2: ' + hc.chip);
  assert.ok(table.some((x) => x.ditahan > 0), 'Empagliflozin 25 mg memuat sel ditahan'); assert.ok(table.some((x) => x.chip > 0), 'ada baris ber-chip varian');
  if (EVID) { mkdirSync(EVID, { recursive: true }); writeFileSync(join(EVID, 'matriks_uji.json'), JSON.stringify(table, null, 1)); }
});

test('B2 Vastrol (3 medium + Air/Release): matriks tetap dua kolom (matriks kiri, grafik kanan) di layar >= 1600; tidak ada tumpang tindih', { skip, timeout: 120000 }, async (t) => {
  if (!(await cdpUp())) return t.skip('Chrome agen (CDP 9222) tidak aktif');
  if (!tab) await up();
  const p = (await A.get('/api/products')).json.products.find((x) => /Vastrol/.test(x.name));
  await tab.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1000, deviceScaleFactor: 1, mobile: false });
  await tab.goto(`${base}/compiler?p=${p.id}#dashboard`, "document.querySelectorAll('#matrix .rw').length > 2"); await tab.sleep(600);
  const d = await tab.ev(`(() => { const hd = document.querySelector('#matrix .rw.hd'); const ov = []; document.querySelectorAll('#matrix .rw').forEach((r, ri) => { const k = [...r.children].map((e) => e.getBoundingClientRect()); for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) if (k[i].width && k[j].width && k[i].left < k[j].right - .5 && k[j].left < k[i].right - .5 && k[i].top < k[j].bottom - .5 && k[j].top < k[i].bottom - .5) ov.push(ri + ':' + i + 'x' + j); }); return { ov, wide: document.querySelector('.split').classList.contains('wide'), cols: hd.children.length, mc: Number(getComputedStyle(document.getElementById('matrix')).getPropertyValue('--mc')) }; })()`);
  assert.deepEqual(d.ov, []); assert.equal(d.cols, d.mc + 4);
});
