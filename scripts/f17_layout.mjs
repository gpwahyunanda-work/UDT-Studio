// F17: ukur kotak pembatas (getBoundingClientRect) bilah atas, stepper, kontainer isi, dan judul di semua halaman x 1366/1920 x terang/gelap; simpan tabel dan tangkapan layar.
// Pakai: node scripts/f17_layout.mjs --base http://127.0.0.1:8797 --email E --out DIR --label sebelum   (kata sandi: env F17_PW). Hanya membaca. Chrome agen CDP 9222.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openTab, login } from './f14_visual.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
export const PAGES = [['/studio-app', 'studio'], ['/compiler', 'compiler'], ['/', 'beranda'], ['/record', 'record'], ['/architecture', 'architecture']];
export const MEASURE = `(() => {
  const vis = (e) => e && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden';
  const pick = (sels) => { for (const s of sels) { const e = [...document.querySelectorAll(s)].find(vis); if (e) return e; } return null; };
  const R = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map((x) => Math.round(x * 10) / 10); };
  const S = (e, p) => (e ? getComputedStyle(e)[p] : null);
  const top = pick(['header.topbar', 'header.udt-topbar']), step = pick(['nav#steps', 'nav.udt-steps']), wrap = pick(['.wrap', '#dashboard > main', '#form > main', '.udt-page', '.rec', '.arc']);
  const h1 = pick(['.wrap h1', '#dashboard header h1', '#form header h1', '.udt-page h1', '.arc h1', '.rec h1', 'main h1']);
  const brand = top && top.querySelector('h1');
  const btn = top && top.querySelector('button');
  return { topbar: R(top), stepper: R(step), content: R(wrap), contentCls: wrap && (wrap.className || wrap.tagName), h1: R(h1), brand_font: S(brand, 'fontSize'), brandH1: R(brand), btn: R(btn), btn_font: S(btn, 'fontSize'), content_pad: wrap && S(wrap, 'paddingLeft'), vw: document.documentElement.clientWidth, side: R(document.querySelector('.udt-side')), hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 };
})()`;

if (process.argv[1] && process.argv[1].endsWith('f17_layout.mjs')) {
  const base = arg('base'), out = arg('out', '.'), label = arg('label', 'x'); mkdirSync(out, { recursive: true });
  const sid = await login(base, arg('email'), process.env.F17_PW);
  const tab = await openTab(); await tab.send('Page.enable'); await tab.send('Network.enable');
  await tab.send('Network.setCookie', { name: 'udt_session', value: sid, url: base, httpOnly: true });
  const rows = [];
  for (const w of [1366, 1920]) {
    await tab.send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: false });
    for (const theme of ['light', 'dark']) {
      for (const [path, name] of PAGES) {
        await tab.goto(base + path, 'document.readyState==="complete"');
        await tab.ev(`(() => { localStorage.setItem('udt_theme','${theme}'); localStorage.setItem('udt-theme','${theme}'); document.documentElement.setAttribute('data-theme','${theme}'); })()`);
        await tab.sleep(1200);
        const m = await tab.ev(MEASURE); rows.push({ page: name, w, theme, ...m });
        const shot = await tab.send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(join(out, `${label}_${name}_${w}_${theme}.png`), Buffer.from(shot.data, 'base64'));
      }
    }
  }
  writeFileSync(join(out, `layout_${label}.json`), JSON.stringify(rows, null, 1));
  // tabel: selisih terhadap Studio (acuan) per lebar/tema; kolom: kiri,lebar bilah/isi/judul
  const ref = (w, t) => rows.find((r) => r.page === 'studio' && r.w === w && r.theme === t);
  const f = (a) => (a ? `${a[0]},${a[2]}x${a[3]}` : '-');
  let md = `| halaman | lebar | tema | bilah atas (x,WxH) | stepper | isi (kelas) | h1 | selisih isi-lebar vs Studio | selisih inset kiri efektif (isi+padding-sidebar; relevan 1366) |\n|---|---|---|---|---|---|---|---|---|\n`;
  for (const r of rows) { const s = ref(r.w, r.theme); const dW = r.content && s.content ? Math.round((r.content[2] - s.content[2]) * 10) / 10 : null; const eff = (x) => (x.content ? Math.round((x.content[0] + parseFloat(x.content_pad || 0) - (x.side ? x.side[2] : 0)) * 10) / 10 : null); const dL = r.content && s.content ? Math.round((eff(r) - eff(s)) * 10) / 10 : null; md += `| ${r.page} | ${r.w} | ${r.theme} | ${f(r.topbar)} | ${f(r.stepper)} | ${f(r.content)} (${r.contentCls}) | ${f(r.h1)} | ${dW} | ${dL} |\n`; }
  writeFileSync(join(out, `layout_${label}.md`), md); console.log(md);
  await tab.close();
}
