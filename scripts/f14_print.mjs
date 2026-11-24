// F14: cetak ke PDF lewat Chrome agen (CDP) lalu hitung halaman; bukti "satu halaman A4 lanskap" setelah tata letak 2x2.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openTab, login } from './f14_visual.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base'), out = arg('out', '.'), sid = await login(base, arg('email'), process.env.F14_PW);
const tab = await openTab(); await tab.send('Page.enable'); await tab.send('Network.enable');
await tab.send('Network.setCookie', { name: 'udt_session', value: sid, url: base, httpOnly: true });
await tab.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
const res = [];
for (const p of (arg('products', '1,2')).split(',')) {
  await tab.goto(`${base}/compiler?p=${p}#dashboard`, "document.querySelectorAll('#panels > article').length > 0"); await tab.sleep(700);
  await tab.ev("window.dispatchEvent(new Event('beforeprint')); true");   // printToPDF tidak selalu memicu beforeprint; pastikan zoom cetak terpasang
  const pdf = await tab.send('Page.printToPDF', { landscape: true, printBackground: true, preferCSSPageSize: true });
  await tab.ev("window.dispatchEvent(new Event('afterprint')); true");
  const buf = Buffer.from(pdf.data, 'base64'); const f = `cetak_produk${p}.pdf`; writeFileSync(join(out, f), buf);
  const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length; res.push({ produk: p, file: f, halaman: pages, bytes: buf.length });
}
console.log(JSON.stringify(res)); await tab.close(); process.exit(0);
