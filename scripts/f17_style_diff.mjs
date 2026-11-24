// F17: bandingkan gaya terhitung bilah atas/stepper/judul Studio vs halaman lain. node scripts/f17_style_diff.mjs --base ... --email ... (F17_PW)
import { openTab, login } from './f14_visual.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base'), theme = arg('theme', 'light');
const sid = await login(base, arg('email'), process.env.F17_PW);
const tab = await openTab(); await tab.send('Page.enable'); await tab.send('Network.enable');
await tab.send('Network.setCookie', { name: 'udt_session', value: sid, url: base, httpOnly: true });
await tab.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 900, deviceScaleFactor: 1, mobile: false });
const P = ['height', 'padding', 'margin', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight', 'color', 'backgroundColor', 'borderTop', 'borderBottom', 'borderLeft', 'borderRadius', 'display', 'gap', 'width', 'maxWidth', 'boxShadow', 'fontFamily'];
const JS = `(() => { const P = ${JSON.stringify(P)}; const pick = (ss) => { for (const s of ss) { const e = [...document.querySelectorAll(s)].find((x) => x.getBoundingClientRect().width > 0); if (e) return e; } return null; };
 const els = { topbar: pick(['header.topbar','header.udt-topbar']), brandImg: pick(['header .topbar-brand img']), brandH1: pick(['header .topbar-brand h1']), sub: pick(['header .topbar-brand .sub']), themeBtn: pick(['header button']), stepper: pick(['nav#steps','nav.udt-steps']), stepBtn: pick(['nav#steps button','nav.udt-steps a']), stepOn: pick(['nav#steps button.active','nav.udt-steps a.on']), stepN: pick(['nav#steps button .n','nav.udt-steps .n']), stepWrap: pick(['.stepper-wrap','.udt-stepper-wrap']) };
 const o = {}; for (const [k, e] of Object.entries(els)) { if (!e) { o[k] = null; continue; } const c = getComputedStyle(e), r = e.getBoundingClientRect(); o[k] = Object.fromEntries(P.map((p) => [p, c[p]]).concat([['_h', Math.round(r.height * 10) / 10], ['_w', Math.round(r.width * 10) / 10]])); } return o; })()`;
const out = {};
for (const [path, name] of [['/studio-app', 'studio'], ['/compiler', 'compiler'], ['/', 'beranda'], ['/record', 'record'], ['/architecture', 'architecture']]) {
  await tab.goto(base + path, 'document.readyState==="complete"');
  await tab.ev(`(() => { localStorage.setItem('udt_theme','${theme}'); localStorage.setItem('udt-theme','${theme}'); document.documentElement.setAttribute('data-theme','${theme}'); })()`); await tab.sleep(1000);
  out[name] = await tab.ev(JS);
}
await tab.close();
for (const name of Object.keys(out)) { if (name === 'studio') continue; console.log('=== ' + name + ' vs studio (' + theme + ')');
  for (const el of Object.keys(out.studio)) { const a = out.studio[el], b = out[name][el]; if (!a || !b) { if (a && !b) console.log(`  ${el}: tidak ada di ${name}`); continue; } for (const p of Object.keys(a)) if (a[p] !== b[p] && !['width', 'maxWidth', 'margin', '_w'].includes(p)) console.log(`  ${el}.${p}: studio=${a[p]} | ${name}=${b[p]}`); } }
