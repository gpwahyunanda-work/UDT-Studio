// Peringatan mutu data (REQ-032) dan peringatan n cetak vs Langkah 4 (delta v0.2 butir 6). Tidak menolak atau menghapus apa pun.
import { runLabel } from './model.js';
import { fmtNum } from './format.js';

const idOf = (r) => `${r.brand_name} ${runLabel(r)}`;
export const F2_TOLERANCE = 1;   // sama dengan import_run.f2_tolerance bawaan

export function dataWarnings(data, roles) {
  const w = [];
  const seen = new Map();
  const hasCmp = new Set(data.comparisons.map((c) => c.test_run_id));
  const medName = new Map(data.mediums.map((m) => [m.medium_id, m.label]));
  for (const r of data.runs) {
    if (!r.is_valid) continue;
    const id = `${idOf(r)} · ${medName.get(r.medium_id)}`;
    const nv = Object.keys(r.vessels).length;
    if (nv > 12) w.push({ code: 'W-vessel>12', run_id: r.run_id, text: `${id}: ${nv} vessel (lebih dari 12).` });
    if (r.minutes.length > 9) w.push({ code: 'W-titik>9', run_id: r.run_id, text: `${id}: ${r.minutes.length} titik waktu (lebih dari 9).` });
    if (Object.values(r.vessels).some((a) => a.some((x) => x !== null && (x < 0 || x > 120)))) w.push({ code: 'W-nilai', run_id: r.run_id, text: `${id}: ada nilai di luar 0 sampai 120%.` });
    if (roles.get(r.run_id) === 'uji' && data.comparisons.length && !hasCmp.has(r.run_id)) w.push({ code: 'W-tanpa-reference', run_id: r.run_id, text: `${id}: run Uji tanpa pembanding tertaut.` });
    if (!r.test_date) w.push({ code: 'W-tanggal', run_id: r.run_id, text: `${id}: tanggal kosong.` });
    const key = `${r.medium_id}|${JSON.stringify([r.minutes, r.vessels])}`;
    if (seen.has(key) && seen.get(key).batch_no !== r.batch_no) w.push({ code: 'W-identik', run_id: r.run_id, text: `${id} dan ${seen.get(key).label}: seluruh nilai vessel identik (kemungkinan salin-tempel atau salah label).` });
    seen.set(key, { label: id, batch_no: r.batch_no });
  }
  return w;
}

// Dibanding hasil modul Langkah 4 (lewat adaptor): n cetak vs n hitung, f2 cetak vs f2 hitung.
export function printedVsStep4(data, byCmp) {
  const w = [];
  const medName = new Map(data.mediums.map((m) => [m.medium_id, m.label]));
  const runs = new Map(data.runs.map((r) => [r.run_id, r]));
  for (const c of data.comparisons) {
    const t = runs.get(c.test_run_id);
    const r = byCmp.get(c.comparison_id);
    if (!t || !r || r.error) continue;
    const id = `${idOf(t)} · ${medName.get(c.medium_id)}`;
    if (r.n !== c.n_points) w.push({ code: 'W-n-langkah4', run_id: c.test_run_id, comparison_id: c.comparison_id, text: `${id}: n cetak di sheet = ${c.n_points}, n menurut Langkah 4 = ${r.n}. Nilai cetak tetap dicatat; angka Langkah 4 ditampilkan terpisah.` });
    if (Number.isFinite(c.f2) && Number.isFinite(r.f2) && Math.abs(c.f2 - r.f2) > F2_TOLERANCE) w.push({ code: 'W-f2-selisih', run_id: c.test_run_id, comparison_id: c.comparison_id, text: `${id}: f2 cetak ${fmtNum(c.f2, 2)} berbeda dari hitung ulang Langkah 4 ${fmtNum(r.f2, 2)} (selisih lebih dari ${F2_TOLERANCE}).` });
  }
  return w;
}

// Perbandingan cetak sheet yang dihitung ulang terhadap pembanding yang sama (untuk peringatan di atas).
export function recomputePrinted(host, profiles, data, f2Between) {
  const out = new Map();
  for (const c of data.comparisons) out.set(c.comparison_id, f2Between(host, profiles.get(c.ref_run_id), profiles.get(c.test_run_id)));
  return out;
}
