// F15: selisih temuan "RSD di atas batas" aturan LAMA (README/mockup: 20% untuk titik <= 10 menit, 10% lainnya; dipakai F6-F14) vs aturan BARU (Langkah 4 lewat udtBridge).
// Pakai: UDT_TEST_PG_PASSWORD=... node scripts/f15_rsd_diff.mjs > evidence/f15/rsd_selisih.md   (basis data uji sementara; tidak menyentuh data produksi)
import { createTestDb } from '../tests/helpers/db.js';
import { adminLoggedIn } from '../tests/helpers/http.js';
import { loadWorkbook } from '../tests/helpers/fixtures.js';
import { readWorkbook } from '../server/import/sheetReader.js';
import { query } from '../server/db.js';
import { loadCompileData } from '../server/compileData.js';
import * as step4 from '../server/step4.js';
import { runProfile, rsdOutOfLimit } from '../server/lib/udtBridge.js';

const SHEETS = [['Vastrol20', 'Development of Vastrol 20 mg Tablet.xlsx', ['pH_1_2', 'pH_4_5', 'pH_6_8']], ['Empagliflozin10', 'Development of Empagliflozin 10 mg Tablet.xlsx'], ['Empagliflozin25', 'Development of Empagliflozin 25 mg Tablet.xlsx', ['UDT_Release', 'UDT_pH_1_2', 'UDT_pH_4_5', 'UDT_pH_6_8']], ['Zemyc150', 'Development of Zemyc 150 mg Kapsul.xlsx'], ['Gionix16', 'Development of Gionix 16 mg Tab.xlsx']];
const oldLim = (t) => (t <= 10 ? 20 : 10);   // aturan lama, hanya untuk pembanding laporan ini
const db = await createTestDb('f15rsd'); const c = await adminLoggedIn('10.15.7.1');
const out = ['# Selisih temuan RSD: aturan lama vs Langkah 4 (F15)', '', 'Lama = 20% untuk titik <= 10 menit, 10% lainnya (semua titik). Baru = evalSimilarityF2 Studio: 20% hanya titik pertama profil run, 10% titik berikutnya, hanya titik yang ikut f2 (sampai pemotongan 85%).', ''];
let totOld = 0, totNew = 0;
for (const x of SHEETS) {
  const r = await c.post('/api/imports', readWorkbook(loadWorkbook(...x))); if (r.status !== 201) throw new Error('impor ' + x[0] + ' ' + r.status);
}
for (const p of (await c.get('/api/products')).json.products) {
  const data = await loadCompileData(query, p.id); const rows = []; let runOld = 0, runNew = 0; const medOf = (r) => data.mediums.find((m) => m.medium_id === r.medium_id)?.code;
  for (const r of data.runs.filter((q) => q.is_valid)) {
    const prof = runProfile(step4, r.minutes, r.vessels); if (prof.error) continue;
    const o = prof.times.map((t, i) => ({ t, v: prof.stats[i].rsd })).filter((q) => Number.isFinite(q.v) && q.v > oldLim(q.t));
    const n = rsdOutOfLimit(step4, prof);
    totOld += o.length; totNew += n.length; runOld += o.length ? 1 : 0; runNew += n.length ? 1 : 0;
    const fo = o.map((q) => `${q.t}':${q.v.toFixed(1)}>${oldLim(q.t)}`).join(' '), fn = n.map((q) => `${q.t}':${q.v.toFixed(1)}>${q.lim}`).join(' ');
    if (fo !== fn) rows.push(`| ${r.batch_no}${r.variant ? ' ' + r.variant : ''} | ${medOf(r)} | ${fo || '-'} | ${fn || '-'} |`);
  }
  out.push(`## ${p.name} (${data.runs.filter((q) => q.is_valid).length} run valid; run ditandai RSD: lama ${runOld}, baru ${runNew})`, '', rows.length ? '| Batch | Medium | Lama (menit:RSD>batas) | Baru (Langkah 4) |\n|---|---|---|---|\n' + rows.join('\n') : 'Tidak ada selisih: temuan RSD identik.', '');
}
out.push(`Total titik RSD di atas batas: lama ${totOld}, baru ${totNew}.`);
console.log(out.join('\n'));
await db.drop(); process.exit(0);
