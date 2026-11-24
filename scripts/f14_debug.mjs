// F14: pembantu pengembangan: buka halaman lewat Chrome agen (CDP 9222), cetak galat konsol dan hasil ekspresi.
// Pakai: F14_PW=... node scripts/f14_debug.mjs --base URL --email E --path /compiler#dashboard --eval "ekspresi"
import { openTab, login } from './f14_visual.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base'), sid = await login(base, arg('email'), process.env.F14_PW);
const tab = await openTab();
await tab.send('Page.enable'); await tab.send('Runtime.enable'); await tab.send('Network.enable');
await tab.send('Network.setCookie', { name: 'udt_session', value: sid, url: base, httpOnly: true });
await tab.send('Emulation.setDeviceMetricsOverride', { width: Number(arg('w', 1920)), height: Number(arg('h', 1080)), deviceScaleFactor: 1, mobile: false });
await tab.goto(base + arg('path', '/'));
await tab.sleep(Number(arg('wait', 1800)));
for (const e of tab.events) if (e.method === 'Runtime.exceptionThrown') console.log('EXC', JSON.stringify(e.params.exceptionDetails).slice(0, 500)); else if (e.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(e.params.type)) console.log('CON', e.params.type, JSON.stringify(e.params.args.map((a) => a.value || a.description)).slice(0, 300));
if (arg('eval')) console.log(JSON.stringify(await tab.ev(arg('eval')), null, 1));
await tab.close();
process.exit(0);
