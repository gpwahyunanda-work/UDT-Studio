// F24: empat paket sample-data/demo-package dikirim sebagai data Studio baru (cara yang sama dengan tests/22), untuk uji ekspor.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { REPO } from './fixtures.js';
import { loadPageHost } from './pageHost.js';
import { runProfile, f2Between } from '../../server/lib/udtBridge.js';

export const DEMO = join(REPO, 'sample-data', 'demo-package');
export const hasDemo = existsSync(DEMO);
export const SCEN = [
  { dir: '01_Empagliflozin_HPLC_Similar_and_VeryRapid', name: 'Empagliflozin', strength: '25 mg', times: [5, 10, 15, 20, 30, 45, 60], std: 12500, tabs: [['1,2', 'pH_1.2'], ['4,5', 'pH_4.5'], ['6,8', 'pH_6.8'], ['Air', 'pH_Air']], test: (t) => `Empagliflozin_Test_${t}.csv`, ref: (t) => `Jardiance_Ref_${t}.csv`, tb: 'F0048J26A', rb: 'F0006H26A' },
  { dir: '02_Candesartan_HPLC_NotSimilar', name: 'Candesartan', strength: '16 mg', times: [5, 10, 15, 30, 45, 60], std: 15200, tabs: [['6,8', 'pH_6.8']], test: () => 'Candesartan_Test_pH_6.8_NotSimilar.csv', ref: () => 'Blopress_Ref_pH_6.8.csv', tb: 'F0091L26B', rb: 'B8014K26A' },
  { dir: '03_Metformin_UV_Cary60_Rapid', name: 'Metformin', strength: '500 mg', times: [5, 10, 15, 20, 30, 45], std: 0.525, tabs: [['6,8', 'pH_6.8']], test: () => 'Metformin_Test_pH_6.8_Cary60.csv', ref: () => 'Glucophage_Ref_pH_6.8_Cary60.csv', tb: 'F0012A26A', rb: 'G0088F26A' },
  { dir: '04_Atorvastatin_HPLC_HighRSD_Warning', name: 'Atorvastatin', strength: '20 mg', times: [5, 10, 15, 20, 30, 45, 60], std: 18500, tabs: [['4,5', 'pH_4.5']], test: () => 'Atorvastatin_Test_pH_4.5_HighRSD.csv', ref: () => 'Lipitor_Ref_pH_4.5.csv', tb: 'F0077C26A', rb: 'L0042D26A' },
];
// pembaca CSV demo: nilai % = area / rerata standar x 100 (cara yang sama dengan verify_scenarios.py); BUKAN rumus f2.
function pctOf(file, times, stdNom) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/), samples = new Map(), stds = [];
  const hi = lines.findIndex((l) => l.includes('Sample Name')); assert.ok(hi >= 0, file);
  for (const l of lines.slice(hi + 1)) {
    if (!l.trim()) continue;
    const p = l.split(',').map((x) => x.replace(/^"|"$/g, '')), name = p[0], area = Number(p.length > 2 ? p[2] : p[1]);
    if (!Number.isFinite(area)) continue;
    if (/Std|Standar/.test(name)) { stds.push(area); continue; }
    const tok = name.split(/\s+/); let t = null, v = null;
    tok.forEach((x, i) => { if (x.includes("'")) { t = parseInt(x.replace("'", ''), 10); if (i + 1 < tok.length) v = parseInt(tok[i + 1], 10); } });
    if (t !== null && v !== null) samples.set(`${t}|${v}`, area);
  }
  const std = stds.length ? stds.reduce((a, x) => a + x, 0) / stds.length : stdNom, out = [];
  for (let v = 1; v <= 12; v++) { const vals = times.map((t) => (samples.has(`${t}|${v}`) ? samples.get(`${t}|${v}`) / std * 100 : null)); if (vals.some((x) => x !== null)) out.push({ no: v, values: vals }); }
  return out;
}


// Mengirim keempat paket; mengembalikan [{ name, product_id }]. extra(scen, runs) boleh mengubah run (mis. uji injeksi rumus).
export async function importDemoPackages(W, extra = (s, r) => r) {
  const host = loadPageHost('UDT Studio.html'), out = [];
  for (const s of SCEN) {
    const cid = (await W.post('/api/compiles', { product_name: s.name, strength: s.strength, dosage_form: 'Tablet Demo', project_code: 'F24-' + s.name })).json.compile_id;
    const runs = [], cmp = [];
    for (const [code, tab] of s.tabs) {
      const f = (fn) => join(DEMO, s.dir, 'csv', fn);
      const ref = pctOf(f(s.ref(tab)), s.times, s.std), tst = pctOf(f(s.test(tab)), s.times, s.std);
      runs.push({ key: 'r' + code, medium_code: code, brand_name: s.ref(tab).split('_')[0], batch_no: s.rb, role: 'reference', variant: '', test_date: '2026-11-04', timepoints: s.times, values: ref });
      runs.push({ key: 'u' + code, medium_code: code, brand_name: s.name, batch_no: s.tb, role: 'uji', variant: '', test_date: '2026-11-04', timepoints: s.times, values: tst });
      const P = (v) => runProfile(host, s.times, Object.fromEntries(v.map((x) => [x.no, x.values])));
      const o = f2Between(host, P(ref), P(tst));
      cmp.push({ testKey: 'u' + code, refKey: 'r' + code, f2: o.f2, n_points: o.n, total_sq: 0, conclusion_code: o.outcome.code });
    }
    const pkg = { compile_id: cid, mediums: s.tabs.map(([code]) => ({ code, full_name: code === 'Air' ? 'Air' : `Buffer pH ${code}` })), runs: extra(s, runs), comparisons: cmp };
    const c = await W.post('/api/ingest/commit', { push_id: randomUUID(), decisions: {}, package: pkg }); assert.ok([200, 201].includes(c.status), `${s.dir} ${JSON.stringify(c.json)}`);
    out.push({ name: s.name, cid });
  }
  return out;
}

// f2 resmi Studio (fungsi halaman, bukan modul server) untuk pasangan nilai; dipakai paket uji buatan sendiri.
export function studioCmp(times, ref, tst, testKey = 'u', refKey = 'r') {
  const host = loadPageHost('UDT Studio.html'), P = (v) => runProfile(host, times, Object.fromEntries(v.map((x) => [x.no, x.values])));
  const o = f2Between(host, P(ref), P(tst));
  return { testKey, refKey, f2: o.f2, n_points: o.n, total_sq: 0, conclusion_code: o.outcome.code };
}
