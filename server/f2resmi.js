// F17: angka f2 RESMI untuk ekspor = Langkah 4, dihitung dari nilai per vessel lewat udtBridge (fungsi Studio). Perbandingan tersimpan (tercetak sheet) hanya menentukan PASANGAN; angkanya diganti.
import * as step4 from './step4.js';
import { runProfile, f2Between } from './lib/udtBridge.js';

export function withOfficialF2(data) {
  const byId = new Map(data.runs.map((r) => [r.run_id, r]));
  const prof = new Map();
  const P = (r) => prof.get(r.run_id) || prof.set(r.run_id, runProfile(step4, r.minutes, r.vessels)).get(r.run_id);
  const comparisons = data.comparisons.map((c) => {
    const t = byId.get(c.test_run_id), r = byId.get(c.ref_run_id);
    if (!t || !r) return c;
    const l4 = f2Between(step4, P(r), P(t));
    const sheet = { f2: c.f2, n_points: c.n_points, total_sq: c.total_sq, conclusion_printed: c.conclusion_printed, f2_source: c.f2_source };
    if (l4.error || !Number.isFinite(l4.f2)) return { ...c, f2: null, n_points: 0, total_sq: null, conclusion_code: 'na', conclusion_printed: null, points: [], f2_source: 'langkah4', sheet };
    const sq = l4.usedRef.map((x, i) => (x - l4.usedTest[i]) ** 2);
    return { ...c, f2: l4.f2, n_points: l4.n, total_sq: sq.reduce((a, x) => a + x, 0), conclusion_code: l4.outcome.code, conclusion_printed: l4.outcome.statusText, points: sq.map((x, i) => ({ seq: i + 1, sq: x })), f2_source: 'langkah4', sheet };
  });
  return { ...data, comparisons };
}
