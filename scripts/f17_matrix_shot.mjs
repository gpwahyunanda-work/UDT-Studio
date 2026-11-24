// F17: tangkapan layar Compiler per produk (sebelum/sesudah). node scripts/f17_matrix_shot.mjs --base B --email E --out DIR --label L --w 1920 [--theme dark] (F17_PW)
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openTab, login } from './f14_visual.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base'), w = Number(arg('w', 1920)), theme = arg('theme', 'light'), label = arg('label', 'x'), out = arg('out', '.');
const sid = await login(base, arg('email'), process.env.F17_PW);
const tab = await openTab(); await tab.send('Page.enable'); await tab.send('Network.enable');
await tab.send('Network.setCookie', { name: 'udt_session', value: sid, url: base, httpOnly: true });
await tab.send('Emulation.setDeviceMetricsOverride', { width: w, height: 1100, deviceScaleFactor: 1, mobile: false });
const prods = await (await fetch(base + '/api/products', { headers: { cookie: 'udt_session=' + sid } })).json();
for (const p of prods.products) {
  await tab.goto(`${base}/compiler?p=${p.id}#dashboard`, "document.querySelectorAll('#matrix .rw').length > 1");
  await tab.ev(`(() => { localStorage.setItem('udt_theme','${theme}'); document.documentElement.setAttribute('data-theme','${theme}'); })()`); await tab.sleep(900);
  const h = await tab.ev('Math.min(document.documentElement.scrollHeight, 2600)');
  await tab.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await tab.sleep(400);
  const shot = await tab.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(out, `${label}_${p.name.replace(/\W+/g, '_')}_${w}_${theme}.png`), Buffer.from(shot.data, 'base64'));
  await tab.send('Emulation.setDeviceMetricsOverride', { width: w, height: 1100, deviceScaleFactor: 1, mobile: false });
}
await tab.close();
