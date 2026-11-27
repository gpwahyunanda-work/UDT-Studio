// F22: empat skenario demo (CSV) harus lolos gerbang stepper sampai Langkah 5, dan hasil f2 Langkah 4 dicatat (bukti tidak berubah).
// Pakai: node scripts/f22_serve.mjs 19222  lalu  node scripts/f22_scenarios.mjs [--out evidence/f22]
import { writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { openTab } from './f14_visual.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base', 'http://127.0.0.1:19222'), out = resolve(arg('out', 'evidence/f22')); mkdirSync(out, { recursive: true });
const DEMO = resolve('sample-data/demo-package'), hasil = [];
const tab = await openTab();
await tab.send('Page.enable'); await tab.send('DOM.enable');
for (const dir of readdirSync(DEMO).filter((d) => /^\d\d_/.test(d)).sort()) {
  const csv = readdirSync(join(DEMO, dir, 'csv')).filter((f) => !/AllMedia/.test(f));
  await tab.goto(base + '/studio-app'); await tab.sleep(1200);
  const up = async (sel, files) => { const { root } = await tab.send('DOM.getDocument'); const { nodeId } = await tab.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel }); await tab.send('DOM.setFileInputFiles', { files: files.map((f) => join(DEMO, dir, 'csv', f)), nodeId }); };
  await up('#fiTest', csv.filter((f) => /_Test_/.test(f))); await up('#fiRef', csv.filter((f) => /_Ref_/.test(f)));
  for (let i = 0; i < 40; i++) { await tab.sleep(400); if (await tab.ev(`window.__udt.S.testFiles.length + window.__udt.S.refFiles.length`) >= csv.length) break; }
  await tab.sleep(800);
  const r = JSON.parse(await tab.ev(`(() => {
    const U = window.__udt.S; const rows = { dir: ${JSON.stringify(dir)} };
    rows.media = U.model ? Object.keys(U.model.media) : [];
    rows.gate2 = stepBlockReason(2); rows.gate3 = stepBlockReason(3); rows.gate4 = stepBlockReason(4);
    for (const P of [U.testParams, U.refParams]) Object.assign(P, { lc: 25, dilStd: 100, dilSample: 1, volMedia: 900, volRep: 0, pctWS: 99.5, wsDefault: 25 });
    window.__udt.rebuild();
    rows.gate4b = stepBlockReason(4); rows.gate5 = stepBlockReason(5);
    return JSON.stringify(rows); })()`));
  const bersih = !r.gate2 && !r.gate3 && !r.gate5;
  console.log((bersih ? 'LULUS ' : 'GAGAL ') + JSON.stringify(r)); hasil.push({ ...r, lolosGerbang: bersih });
}
writeFileSync(join(out, 'f22_skenario_demo_gerbang.json'), JSON.stringify(hasil, null, 1));
await tab.close(); process.exit(hasil.every((h) => h.lolosGerbang) ? 0 : 1);
