// F17: SATU sumber angka f2 RESMI = Langkah 4 (dihitung dari nilai per vessel lewat udtBridge; fungsi Studio, tanpa rumus baru).
// Dipakai dashboard (matriks, chip, KPI, cetak, PNG) dan ekspor (xlsx/csv/tsv) supaya semua keluaran SAMA (parity). Blok ditahan (W-19) tidak pernah membawa angka.
import * as step4 from './step4.js';
import { runProfile, f2Between } from './lib/udtBridge.js';

const fin = (x) => typeof x === 'number' && Number.isFinite(x);
export const KIND_OF = { very_rapid: 'rap', similar: 'sim', not_similar: 'not', na: 'na' };

// Alasan blok ditahan bila SEMUA blok sumber run ditahan pembaca impor; selain itu null.
export function heldReason(run) {
  const sb = run.source_blocks || [];
  return sb.length && sb.every((b) => b.import_outcome === 'ditahan') ? (sb[0].hold_reason || 'Ditahan saat impor') : null;
}
export const profileOf = (run) => runProfile(step4, run.minutes, run.vessels);

// Nilai resmi satu pasangan (pembanding, uji): f2, status, n, Total, kuadrat selisih per titik. Tidak ada f2 bila belum dapat dihitung.
export function officialPair(refProfile, testProfile) {
  const l4 = f2Between(step4, refProfile, testProfile);
  const f2 = l4.error || !fin(l4.f2) ? null : l4.f2;
  const sq = l4.error || !l4.usedRef ? [] : l4.usedRef.map((x, i) => (x - l4.usedTest[i]) ** 2);
  return { ...l4, f2, kind: l4.error ? 'na' : KIND_OF[l4.outcome.code], n: l4.error ? null : l4.n, sq, total: f2 === null ? null : sq.reduce((a, x) => a + x, 0) };
}

// Ekspor: himpunan perbandingan = himpunan sel matriks (dash.cells). Nilai tersimpan (tercetak sheet) hanya menentukan penanda 'dihitung'.
export function withOfficialF2(data, dash) {
  const byId = new Map(data.runs.map((r) => [r.run_id, r]));
  const prof = new Map(); const P = (r) => prof.get(r.run_id) || prof.set(r.run_id, profileOf(r)).get(r.run_id);
  const stored = new Set(data.comparisons.map((c) => `${c.test_run_id}|${c.ref_run_id}`));
  const medId = new Map(dash ? dash.media.map((m) => [m.id, m.medium_id]) : []);
  const pairs = [];
  if (dash) {
    const row = new Map(dash.runs.map((r) => [r.key, r]));
    for (const ck of dash.comp_order) for (const [key, byMed] of Object.entries(dash.cells[ck] || {})) for (const [code, cell] of Object.entries(byMed)) {
      const tr = row.get(key)?.prof[code]?.run_id, rr = row.get(ck)?.prof[code]?.run_id; if (!tr || !rr || !medId.get(code)) continue;
      pairs.push({ test: tr, ref: rr, medium_id: medId.get(code), held: cell.held || null });
    }
  } else for (const c of data.comparisons) pairs.push({ test: c.test_run_id, ref: c.ref_run_id, medium_id: c.medium_id, held: null });
  const comparisons = pairs.map((p, i) => {
    const t = byId.get(p.test), r = byId.get(p.ref); if (!t || !r) return null;
    const base = { comparison_id: i + 1, medium_id: p.medium_id, test_run_id: p.test, ref_run_id: p.ref, computed: !stored.has(`${p.test}|${p.ref}`) };
    if (p.held || heldReason(t) || heldReason(r)) return { ...base, held: p.held || heldReason(t) || heldReason(r), f2: null, n_points: 0, total_sq: null, conclusion_code: 'ditahan', conclusion_printed: null, points: [] };
    const o = officialPair(P(r), P(t));
    if (o.f2 === null) return { ...base, f2: null, n_points: 0, total_sq: null, conclusion_code: 'na', conclusion_printed: null, points: [] };
    return { ...base, f2: o.f2, n_points: o.n, total_sq: o.total, conclusion_code: o.outcome.code, conclusion_printed: o.outcome.statusText, points: o.sq.map((x, k) => ({ seq: k + 1, sq: x })) };
  }).filter(Boolean);
  // blok ditahan: nilai terukur dikosongkan di semua keluaran (xlsx/csv/tsv); alasan dibawa di run.held
  const runs = data.runs.map((r) => { const h = heldReason(r); return h ? { ...r, held: h, vessels: Object.fromEntries(Object.entries(r.vessels).map(([k, v]) => [k, v.map(() => null)])) } : r; });
  return { ...data, runs, comparisons };
}
