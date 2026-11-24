// F15: tangkapan layar + pemeriksaan DOM lewat Chrome agen (CDP http://localhost:9222, profil agen). Hanya membaca, kecuali langkah "dialog" yang membuka (tidak mengirim) dialog Ubah.
// Pakai: F15_PW=... node scripts/f15_visual.mjs --base http://127.0.0.1:8795 --email E --out DIR --label sesudah [--sizes 1366x768] [--steps home,record,record-run,record-dialog,architecture,arch-diagram,erd-relasi,compiler,studio]
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openTab, login } from './f14_visual.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base'), out = arg('out', '.'), label = arg('label', 'f15'), email = arg('email'), steps = arg('steps', 'home,record,record-run,record-dialog,architecture,arch-diagram,erd-relasi,compiler,studio').split(',');
mkdirSync(out, { recursive: true });
const sid = await login(base, email, process.env.F15_PW);
const tab = await openTab(); await tab.send('Page.enable'); await tab.send('Network.enable');
await tab.send('Network.setCookie', { name: 'udt_session', value: sid, url: base, httpOnly: true });
const SIZES = arg('sizes', '1366x768').split(',').map((x) => x.split('x').map(Number)); const report = [];
const URLS = { home: '/', record: '/record#t=compile', 'record-run': '/record#t=run&s=run_id&d=asc', 'record-dialog': '/record#t=compile', architecture: '/architecture', 'arch-diagram': '/architecture', 'erd-relasi': '/architecture/erd-relasi', compiler: '/compiler#dashboard', studio: '/studio', 'record-readonly': '/record#t=run_value' };
for (const [w, h] of SIZES) for (const theme of ['light', 'dark']) {
  await tab.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await tab.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
  for (const st of steps) {
    await tab.goto('about:blank', 'true'); await tab.goto(base + URLS[st]);   // muat ulang penuh (hash saja tidak memuat ulang; dialog sebelumnya tertinggal)
    await tab.ev(`try{localStorage.setItem('udt-theme','${theme}');localStorage.setItem('udt_theme','${theme}')}catch(e){};document.documentElement.setAttribute('data-theme','${theme}');true`);
    await tab.sleep(st === 'compiler' || st === 'studio' ? 2200 : 1200);
    let note = null;
    if (st === 'record-dialog') { note = await tab.ev(`(() => { const b = [...document.querySelectorAll('#recMain tbody button')].find((x) => x.textContent === 'Ubah'); if (!b) return 'tombol Ubah tidak ada'; b.click(); return document.getElementById('recDlg').open ? 'dialog terbuka' : 'dialog tidak terbuka'; })()`); await tab.sleep(400); }
    if (st === 'arch-diagram') { note = await tab.ev(`(() => { const b = document.querySelector('.arc-open[data-id="erd"]'); if (!b) return 'tombol tidak ada'; b.click(); return document.getElementById('arcFrame').getAttribute('src'); })()`); await tab.sleep(3500); }
    const dom = await tab.ev(`(() => ({ title: document.title, h1: document.querySelectorAll('h1').length, hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, side: !!document.getElementById('udtSide'), rows: document.querySelectorAll('#recMain tbody tr').length, cards: document.querySelectorAll('.arc-card:not([hidden])').length, fonts: [...document.querySelectorAll('.rec-t td,.rec-t th')].slice(0, 3).map((e) => getComputedStyle(e).fontSize) }))()`);
    const full = Math.min(2400, Math.max(h, Number(await tab.ev('document.documentElement.scrollHeight'))));
    await tab.send('Emulation.setDeviceMetricsOverride', { width: w, height: full, deviceScaleFactor: 1, mobile: false }); await tab.sleep(300);
    const shot = await tab.send('Page.captureScreenshot', { format: 'png' });
    await tab.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    const f = `${label}_${st}_${w}_${theme}.png`; writeFileSync(join(out, f), Buffer.from(shot.data, 'base64')); report.push({ file: f, step: st, theme, w, note, dom });
  }
}
writeFileSync(join(out, `${label}_dom.json`), JSON.stringify(report, null, 1)); await tab.close();
console.log(JSON.stringify(report.map((r) => ({ f: r.file, note: r.note, h1: r.dom.h1, rows: r.dom.rows, cards: r.dom.cards, hscroll: r.dom.hscroll }))));
