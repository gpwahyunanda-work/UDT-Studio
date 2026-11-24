// F14: ukur tinggi mode cetak (media print, lebar kontainer 1360) untuk kalibrasi printScale() di compiler/app.js.
import { openTab, login } from './f14_visual.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base'), sid = await login(base, arg('email'), process.env.F14_PW);
const tab = await openTab(); await tab.send('Page.enable'); await tab.send('Network.enable');
await tab.send('Network.setCookie', { name: 'udt_session', value: sid, url: base, httpOnly: true });
await tab.send('Emulation.setDeviceMetricsOverride', { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false });
await tab.send('Emulation.setEmulatedMedia', { media: 'print' });
for (const p of (arg('products', '1,2')).split(',')) {
  await tab.goto(`${base}/compiler?p=${p}#dashboard`, "document.querySelectorAll('#panels > article').length > 0"); await tab.sleep(700);
  console.log('produk', p, JSON.stringify(await tab.ev(`(() => { const R = (e) => e.getBoundingClientRect(); const g = (s) => { const e = document.querySelector(s); return e ? Math.round(R(e).height) : null; };
    return { rows: document.querySelectorAll('#matrix .rw').length, dashboard: g('#dashboard'), header: g('#dashboard header'), main: g('#dashboard main'), left: g('#leftCard'), right: g('#rightCard'), panels: g('#panels'), split: g('.split'), width: Math.round(R(document.getElementById('dashboard')).width), pw: Math.round(R(document.getElementById('panels')).width) }; })()`)));
}
await tab.close(); process.exit(0);
