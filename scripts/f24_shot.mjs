// F24: tangkapan layar menu "Unduh hasil" di /compiler (peladen scripts/f24_serve.mjs). node scripts/f24_shot.mjs BASE OUT.png
import { writeFileSync } from 'node:fs';
import { openTab } from './f14_visual.mjs';
const [base, out] = process.argv.slice(2);
const tab = await openTab(); await tab.send('Page.enable');
await tab.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await tab.goto(`${base}/compiler`, "!!document.getElementById('expBtn')"); await tab.sleep(2500);
await tab.ev("document.getElementById('expBtn').click()"); await tab.sleep(600);
console.log(await tab.ev("document.getElementById('expMenu').innerText"));
const shot = await tab.send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.data, 'base64')); await tab.close();
