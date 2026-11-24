// F14: tangkapan layar + pemeriksaan DOM lewat Chrome agen (CDP http://localhost:9222, profil agen; BUKAN peramban lain).
// Pakai: node scripts/f14_visual.mjs --base http://127.0.0.1:8791 --email E --out DIR --pages compiler,home --label sesudah   (kata sandi: env F14_PW)
// Hanya membaca; tidak menulis data. Kata sandi tidak dicetak.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
export const CDP = arg('cdp', 'http://localhost:9222');

export async function openTab(url = 'about:blank') {
  const r = await fetch(`${CDP}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  const t = await r.json(); const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
  let id = 0; const wait = new Map(); const events = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } else events.push(d); };
  const send = (method, params = {}) => new Promise((ok, no) => { const i = ++id; wait.set(i, (d) => (d.error ? no(new Error(method + ': ' + d.error.message)) : ok(d.result))); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r2 = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r2.exceptionDetails) throw new Error(JSON.stringify(r2.exceptionDetails).slice(0, 400)); return r2.result.value; };
  const sleep = (ms) => new Promise((r2) => setTimeout(r2, ms));
  const goto = async (u, ready) => { await send('Page.navigate', { url: u }); await sleep(300); for (let i = 0; i < 80; i++) { await sleep(150); try { if (await ev(ready || "document.readyState==='complete'")) return; } catch { /* navigasi */ } } throw new Error('timeout ' + u); };
  return { send, ev, sleep, goto, events, close: async () => { try { ws.close(); } catch { /* */ } await fetch(`${CDP}/json/close/${t.id}`).catch(() => {}); } };
}

export async function login(base, email, password) {
  const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ identity: email, password }) });
  if (r.status !== 200) throw new Error('login ' + r.status);
  const m = /udt_session=([^;]+)/.exec(r.headers.get('set-cookie') || ''); return m[1];
}

// Pemeriksaan DOM Compiler: tepat 4 kartu grafik, tidak ada elemen yang keluar kartu, urutan baris.
export const DOM_CHECK = `(() => {
  const arts = [...document.querySelectorAll('#panels > article')];
  const rect = (e) => e.getBoundingClientRect();
  const out = { cards: arts.length, sizes: arts.map((a) => [Math.round(rect(a).width), Math.round(rect(a).height)]), outside: [] };
  arts.forEach((a, i) => { const ar = rect(a); a.querySelectorAll('*').forEach((e) => { const r = rect(e); if (!r.width || !r.height) return; if (r.left < ar.left - 1 || r.right > ar.right + 1 || r.top < ar.top - 1 || r.bottom > ar.bottom + 1) out.outside.push(i + ':' + e.tagName + '.' + (e.getAttribute('class') || '')); }); });
  const note = document.getElementById('chartNote'), rc = document.getElementById('rightCard');
  out.noteInside = !!(note && rc && rc.contains(note) && rect(note).bottom <= rect(rc).bottom + 1);
  const lc = document.getElementById('leftCard'); out.panelHeights = lc && rc ? [Math.round(rect(lc).height), Math.round(rect(rc).height)] : null;
  out.rows = [...document.querySelectorAll('#matrix [data-rowkey]')].map((r) => r.getAttribute('data-rowkey'));
  out.hscroll = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
  const mx = document.getElementById('matrix'), hd = mx && mx.querySelector('.rw.hd');
  out.matrixCols = hd ? hd.querySelectorAll('[role=columnheader]').length : 0;
  return out; })()`;

if (process.argv[1] && process.argv[1].endsWith('f14_visual.mjs')) {
  const base = arg('base'), out = arg('out', '.'), label = arg('label', 'x'), pages = arg('pages', 'compiler').split(',');
  mkdirSync(out, { recursive: true });
  const sid = await login(base, arg('email'), process.env.F14_PW);
  const tab = await openTab(); const report = [];
  await tab.send('Page.enable'); await tab.send('Network.enable');
  await tab.send('Network.setCookie', { name: 'udt_session', value: sid, url: base, httpOnly: true });
  const SIZES = arg('sizes', '1366x768,1920x1080').split(',').map((x) => x.split('x').map(Number));
  for (const [w, h] of SIZES) for (const theme of ['light', 'dark']) {
    await tab.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await tab.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
    for (const p of pages) {
      const url = base + (p === 'compiler' ? `/compiler${arg('p') ? '?p=' + arg('p') : ''}#dashboard` : p === 'home' ? '/' : '/' + p);
      await tab.goto(url); await tab.ev(`try{localStorage.setItem('udt-theme','${theme}');localStorage.setItem('udt_theme','${theme}')}catch(e){};document.documentElement.setAttribute('data-theme','${theme}');true`);
      await tab.sleep(p === 'compiler' ? 1800 : 1200);
      const dom = p === 'compiler' ? await tab.ev(DOM_CHECK) : null;
      const full = Math.max(h, Number(await tab.ev('document.documentElement.scrollHeight')));   // tinggi penuh dulu (bukan captureBeyondViewport): elemen sticky/100vh tampil wajar
      await tab.send('Emulation.setDeviceMetricsOverride', { width: w, height: full, deviceScaleFactor: 1, mobile: false }); await tab.sleep(350);
      const shot = await tab.send('Page.captureScreenshot', { format: 'png' });
      await tab.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      const f = `${label}_${p}_${w}_${theme}.png`; writeFileSync(join(out, f), Buffer.from(shot.data, 'base64'));
      report.push({ file: f, w, theme, page: p, dom });
    }
  }
  writeFileSync(join(out, `${label}_dom.json`), JSON.stringify(report, null, 1)); await tab.close();
  console.log(JSON.stringify(report.map((r) => ({ f: r.file, cards: r.dom && r.dom.cards, outside: r.dom && r.dom.outside.length, cols: r.dom && r.dom.matrixCols }))));
}
