// F8/S-4: paket Studio uji harus membawa f2 yang koheren dengan nilai vessel (server menghitung ulang; selisih > 1 ditolak 400).
import * as step4 from '../../server/step4.js';
import { runProfile, f2Between } from '../../server/lib/udtBridge.js';

const prof = (r) => runProfile(step4, r.timepoints, Object.fromEntries(r.values.map((v) => [v.no, v.values])));
export function coherentF2(pkg) {
  for (const c of pkg.comparisons || []) {
    const t = pkg.runs.find((r) => r.key === c.testKey), f = pkg.runs.find((r) => r.key === c.refKey);
    const l4 = f2Between(step4, prof(f), prof(t));
    if (Number.isFinite(l4.f2)) c.f2 = l4.f2;
  }
  return pkg;
}
