// Logika tampilan Compiler (murni; angka f2/statistik hanya dari udtBridge = fungsi asli Langkah 4). Mengikuti docs/UI_SPEC_compiler_dari_mockup.md.
import { f2Between } from './udtBridge.js';
import { dataWarnings, recomputePrinted } from './warnings.js';
import { fmtNum } from './format.js';
import { runLabel } from './model.js';

export const MAX_CHECKED = 4;
const LABEL = (code) => (code === 'Release' ? 'Release' : code === 'Air' ? 'Air' : `pH ${code}`);
export const shortBrand = (b) => String(b || '').replace(/\s+(tablet|tab|kapsul|kaplet|capsule|fc tablet)\s*$/i, '').trim();

// Empat kuadran: pH 1,2 / pH 4,5 / pH 6,8 / (Release bila ada, kalau tidak Air). Medium lain tetap tampil sebagai kuadran tambahan (data tidak disembunyikan).
// Medium tanpa run = kuadran kosong, bukan disembunyikan.
export function layoutMediums(mediums, runs) {
  const byCode = new Map();
  for (const m of mediums) (byCode.get(m.code) || byCode.set(m.code, []).get(m.code)).push(m);
  const nRuns = (ids) => runs.filter((r) => ids.includes(r.medium_id)).length;
  const mk = (code) => { const ms = byCode.get(code) || []; const ids = ms.map((m) => m.medium_id); return { code, label: ms[0]?.label || LABEL(code), fullName: ms[0]?.full_name || null, mediumIds: ids, medium: ms[0] || null, empty: nRuns(ids) === 0 }; };
  const codes = ['1,2', '4,5', '6,8', byCode.has('Release') ? 'Release' : 'Air'];
  const extra = [...byCode.keys()].filter((c) => !codes.includes(c)).sort();
  return [...codes, ...extra].map(mk);
}

// Pembanding = produk+batch yang bertindak sebagai pembanding (peran diturunkan dari perbandingan, B3-3).
export function refCandidates(data, roles) {
  const refCount = new Map();
  for (const c of data.comparisons) refCount.set(c.ref_run_id, (refCount.get(c.ref_run_id) || 0) + 1);
  const g = new Map();
  for (const r of data.runs) {
    if (roles.get(r.run_id) !== 'pembanding') continue;
    const k = `${r.brand_name}|${r.batch_no}`;
    const e = g.get(k) || g.set(k, { key: k, brand: r.brand_name, batch: r.batch_no, runIds: [], used: 0, site: r.manufacturer_site, last: '' }).get(k);
    e.runIds.push(r.run_id); e.used += refCount.get(r.run_id) || 0; if (r.manufacturer_site && !e.site) e.site = r.manufacturer_site;
    if ((r.test_date || '') > e.last) e.last = r.test_date || '';
  }
  return [...g.values()].sort((a, b) => b.used - a.used || b.last.localeCompare(a.last));
}
const newer = (a, b) => (b.test_date || '').localeCompare(a.test_date || '') || b.run_id - a.run_id;
export function refRunFor(cand, slot, data) {
  if (!cand) return null;
  const ids = new Set(cand.runIds);
  return data.runs.filter((r) => ids.has(r.run_id) && r.is_valid && slot.mediumIds.includes(r.medium_id)).sort(newer)[0] || null;
}

// Baris batch: satu baris per (batch, varian); run ulang pada medium sama -> yang terbaru dipakai sel, sisanya dicatat.
export function batchRows(data, slots, candidates, { status = 'valid', q = '', month = '' } = {}) {
  const refKeys = new Set(candidates.map((c) => c.key));
  const rows = new Map();
  for (const r of data.runs) {
    if (refKeys.has(`${r.brand_name}|${r.batch_no}`)) continue;
    if (status === 'valid' && !r.is_valid) continue;
    if (status === 'tidak_valid' && r.is_valid) continue;
    if (month && !(r.test_date || '').startsWith(month)) continue;
    const key = `${r.batch_no}|${r.variant || ''}`;
    const e = rows.get(key) || rows.set(key, { key, batch: r.batch_no, variant: r.variant || '', brand: r.brand_name, runs: [], date: '' }).get(key);
    e.runs.push(r); if ((r.test_date || '') > e.date) e.date = r.test_date || '';
  }
  const needle = q.trim().toLowerCase();
  const out = [...rows.values()].filter((e) => !needle || `${e.batch} ${e.variant}`.toLowerCase().includes(needle));
  for (const e of out) {
    e.cells = new Map(); e.extra = 0;
    for (const s of slots) {
      const rs = e.runs.filter((r) => s.mediumIds.includes(r.medium_id)).sort(newer);
      if (rs.length) { e.cells.set(s.code, rs[0]); e.extra += rs.length - 1; }
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.batch.localeCompare(b.batch) || a.variant.localeCompare(b.variant));
}

export const MARK = { very_rapid: '»', similar: '✓', not_similar: '×' };
export function cellResult(host, profiles, refRun, run) {
  if (!refRun || !run || refRun.run_id === run.run_id) return null;
  const r = f2Between(host, profiles.get(refRun.run_id), profiles.get(run.run_id));
  if (r.error) return { error: r.error, mark: '—', code: 'na' };
  return { ...r, code: r.outcome.code, mark: MARK[r.outcome.code] || '—' };
}

export function computeCells(host, profiles, data, rows, slots, candidates, activeKey) {
  const active = candidates.find((c) => c.key === activeKey) || null;
  const refBySlot = new Map(slots.map((s) => [s.code, refRunFor(active, s, data)]));
  const cells = new Map();   // `${rowKey}|${code}` -> hasil
  for (const e of rows) for (const s of slots) { const run = e.cells.get(s.code); if (run) cells.set(`${e.key}|${s.code}`, cellResult(host, profiles, refBySlot.get(s.code), run)); }
  const others = candidates.filter((c) => c.key !== activeKey).map((c) => ({ cand: c, cells: new Map(slots.map((s) => { const rr = refRunFor(c, s, data); return [s.code, rr ? cellResult(host, profiles, refBySlot.get(s.code), rr) : null]; })) }));
  return { active, refBySlot, cells, others };
}

const TYPE_OF = { 'W-identik': 'Data identik', 'W-identik-keras': 'Data identik' };
// Kategori kesimpulan tercetak di sheet lama (teks apa adanya) -> kode Langkah 4.
export function printedCategory(text) {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return null;
  if (t.includes('not similar')) return 'not_similar';
  if (t.includes('rapid')) return 'very_rapid';
  if (t.includes('similar')) return 'similar';
  return null;
}
const CAT = { similar: 'Similar', very_rapid: 'Similar (sangat cepat, f2 hanya informasi)', not_similar: 'Not Similar' };
export const FINDING_TYPES = ['Beda dengan sheet lama', 'Data identik', 'RSD di atas batas', 'Peringatan data', 'Catatan impor'];
export function buildFindings({ host, profiles, data, roles, slots, rows, computed, candidates }) {
  const f = [];
  const med = new Map(data.mediums.map((m) => [m.medium_id, m.label]));
  const byRun = new Map(data.runs.map((r) => [r.run_id, r]));
  const lab = (r) => `${r.batch_no}${r.variant ? ' ' + r.variant : ''}`;
  const dw = dataWarnings(data, roles);
  const re = host ? recomputePrinted(host, profiles, data, f2Between) : new Map();
  const pr = [];
  for (const c of data.comparisons) {   // beda dengan sheet lama = KESIMPULAN berbeda (bukan sekadar n atau pembulatan f2)
    const t = byRun.get(c.test_run_id), r = re.get(c.comparison_id);
    if (!t || !r || r.error || !t.is_valid) continue;
    const printed = printedCategory(c.conclusion_printed);
    if (printed && printed !== r.outcome.code) pr.push({ code: 'W-beda-sheet', run_id: c.test_run_id, comparison_id: c.comparison_id, text: `${lab(t)}: Sheet lama menulis ${CAT[printed]}. Hitung ulang Langkah 4 terhadap pembanding yang sama menghasilkan f2 ${fmtNum(r.f2, 1)} dan ${CAT[r.outcome.code] || r.outcome.label}.` });
  }
  for (const w of [...pr, ...dw]) {
    const r = byRun.get(w.run_id);
    f.push({ key: `${w.code}|${w.run_id}|${w.comparison_id || ''}`, run_id: w.run_id, batch: r ? lab(r) : '–', medium: r ? med.get(r.medium_id) : '–', type: w.code === 'W-beda-sheet' ? 'Beda dengan sheet lama' : (TYPE_OF[w.code] || 'Peringatan data'), text: w.text.replace(/^.*?: /, '') });
  }
  const seen = new Set();
  const addRsd = (run, c) => { if (c && !c.error && c.rsdExceeded && !seen.has(run.run_id)) { seen.add(run.run_id); f.push({ key: `rsd|${run.run_id}`, run_id: run.run_id, batch: run.batch_no === undefined ? '–' : `${run.brand_name && candidates.some((x) => x.key === `${run.brand_name}|${run.batch_no}`) ? shortBrand(run.brand_name) + ' (' + run.batch_no + ')' : lab(run)}`, medium: med.get(run.medium_id), type: 'RSD di atas batas', text: `RSD ${c.rsdDetails.join('; ').replace(/Ref [\d,.]+%, /, '').replace(/\(Limit/g, '(batas')}.` }); } };
  for (const e of rows) for (const s of slots) { const run = e.cells.get(s.code); if (run) addRsd(run, computed.cells.get(`${e.key}|${s.code}`)); }
  for (const o of computed.others) for (const s of slots) { const rr = refRunFor(o.cand, s, data); if (rr) addRsd(rr, o.cells.get(s.code)); }
  for (const n of data.api_notes || []) f.push({ key: `api|${n.sheet_tab}`, run_id: null, batch: 'Semua', medium: n.sheet_tab || 'Semua', type: 'Catatan impor', text: 'Zat aktif belum pasti: isi sel D5 bertentangan dengan acuan metode di D10; D5 tidak ditampilkan sebagai fakta.' });
  const group = (runs, mk) => { const g = new Map(); for (const r of runs) (g.get(lab(r)) || g.set(lab(r), []).get(lab(r))).push(r); for (const [l, rs] of g) f.push(mk(l, rs)); };   // satu baris per batch, bukan per medium
  group(data.runs.filter((r) => !r.is_valid), (l, rs) => ({ key: `inv|${l}`, run_id: rs[0].run_id, batch: l, medium: rs.map((r) => med.get(r.medium_id)).join(', '), type: 'Catatan impor', text: `Ditandai Tidak valid: ${rs[0].invalid_reason}` }));
  group(data.runs.filter((r) => (r.source_blocks || []).length > 1), (l, rs) => ({ key: `mrg|${l}`, run_id: rs[0].run_id, batch: l, medium: rs.map((r) => med.get(r.medium_id)).join(', '), type: 'Catatan impor', text: `Muncul di ${rs[0].source_blocks.length} blok sheet dengan data yang sama, sehingga digabung menjadi satu run bertanggal ${rs[0].test_date || 'kosong'}.` }));
  return f;
}

export function kpis({ rows, slots, computed, findings, data, status }) {
  let notSimilar = 0;
  for (const c of computed.cells.values()) if (c && c.code === 'not_similar') notSimilar += 1;
  const withData = slots.filter((s) => !s.empty);
  const baseSlots = slots.slice(0, 4);
  return { batches: rows.length, mediumWith: baseSlots.filter((s) => !s.empty).length, mediumOf: baseSlots.length, emptyNames: baseSlots.filter((s) => s.empty).map((s) => s.label), notSimilar, findings: findings.length, withData: withData.length };
}

export const checkedDefault = (rows) => rows.filter((e) => [...e.cells.values()].some((r) => r.is_valid)).slice(0, 3).map((e) => e.key);
export const monthsOf = (data) => [...new Set(data.runs.map((r) => (r.test_date || '').slice(0, 7)).filter(Boolean))].sort();
export { runLabel };
