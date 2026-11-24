// F17: membuat tiga berkas .xlsx kecil (format sheet lama "Development of ...") sebagai fixture di dalam repo, agar tes impor .xlsx tidak dilewati
// di lingkungan tanpa ../data/sheets. Data sintetis (bukan data Pharos). Jalankan: node tests/fixtures/make_mini_xlsx.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildXlsx } from '../../server/export.js';
const HERE = dirname(fileURLToPath(import.meta.url));
const mkRun = (id, mid, brand, batch, role, date, base, minutes) => ({ run_id: id, medium_id: mid, brand_name: brand, batch_no: batch, role, role_context: role, source_blocks: [], variant: '', test_date: date, manufacturer_site: 'PT Contoh', note: null, is_valid: true, invalid_reason: null, source: 'fixture', entered_at: '2026-01-01T00:00:00Z', minutes, vessels: Object.fromEntries([1, 2, 3].map((v) => [v, minutes.map((_, i) => Math.min(100, base[i] + (v - 2) * 1.5))])) });
function make(name, strength, form, mediums, minutes, ref, test) {
  const med = mediums.map((c, i) => ({ medium_id: i + 1, code: c, label: c === 'Release' ? 'Release' : `pH ${c}`, full_name: c === 'Release' ? 'Release (HCl 0,1 N)' : `Buffer pH ${c}`, volume_text: '900 mL', apparatus: '2 (Paddle)', rpm_text: '50 rpm', method: 'HPLC', method_ref: 'M-001' }));
  const runs = [], comparisons = []; let id = 1;
  med.forEach((m) => { const r = mkRun(id++, m.medium_id, `${name} Ref`, 'R0001', 'reference', '2026-01-10', ref, minutes); const t = mkRun(id++, m.medium_id, name, 'F0001A26A', 'uji', '2026-02-10', test, minutes); runs.push(r, t); comparisons.push({ comparison_id: id, medium_id: m.medium_id, test_run_id: t.run_id, ref_run_id: r.run_id, f2: 60, n_points: minutes.length, total_sq: 100, conclusion_code: 'similar', conclusion_printed: 'Similar', f2_source: 'sheet', points: minutes.map((_, i) => ({ seq: i + 1, sq: 100 / minutes.length })) }); });
  return buildXlsx({ compile: { title: `Development of ${name} ${strength} ${form}`, product_name: name, strength, dosage_form: form, api: 'Zat contoh' }, mediums: med, runs, comparisons });
}
const defs = [
  ['Minia', '10 mg', 'Tablet', ['1,2', '4,5', '6,8', 'Release'], [5, 10, 15, 30], [30, 50, 70, 90], [28, 47, 66, 88]],
  ['Minib', '20 mg', 'Tablet', ['1,2', '6,8'], [5, 10, 15, 30, 45], [20, 40, 60, 80, 90], [18, 38, 57, 78, 88]],
  ['Minic', '5 mg', 'Kapsul', ['4,5', '6,8', 'Release'], [10, 20, 30], [40, 70, 95], [35, 66, 92]],
];
for (const [n, s, f, m, t, r, x] of defs) { const buf = await make(n, s, f, m, t, r, x); writeFileSync(join(HERE, `Development of ${n} ${s} ${f}.xlsx`), buf); console.log(n, buf.length); }
