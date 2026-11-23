// Model dashboard (murni, dapat diuji di Node). Semua angka f2/statistik berasal dari udtBridge (fungsi asli Langkah 4).
import { profileOfRun, f2Between } from './udtBridge.js';

export const SLOTS = ['Release', '1,2', '4,5', '6,8'];
export const PALETTE = ['#0072B2', '#C4500B', '#00795A', '#B5448C', '#8A6100', '#5B3FA5', '#2F7F9E', '#7A7A00'];
export const SHAPES = ['circle', 'square', 'triangle', 'diamond', 'cross', 'star', 'wye'];

export const runLabel = (r) => `${r.batch_no}${r.variant ? ` (${r.variant})` : ''}`;

// Peran diturunkan dari perbandingan (B3-3): run yang dirujuk sebagai pembanding = pembanding; selain itu ikut kolom batch.role.
export function deriveRoles(data) {
  const refIds = new Set(data.comparisons.map((c) => c.ref_run_id));
  const m = new Map();
  for (const r of data.runs) m.set(r.run_id, refIds.has(r.run_id) || r.role === 'reference' ? 'pembanding' : 'uji');
  return m;
}

// Satu kuadran per medium: Release, pH 1,2, pH 4,5, pH 6,8. Tanpa Release (mis. Vastrol): kuadran itu diisi medium
// non-baku dengan run terbanyak; bila tak ada, kosong. Medium non-baku lain tetap ditampilkan (data tidak disembunyikan).
export function arrangeMediums(mediums, runs) {
  const count = new Map();
  for (const r of runs) count.set(r.medium_id, (count.get(r.medium_id) || 0) + 1);
  const n = (m) => count.get(m.medium_id) || 0;
  const used = new Set();
  const quads = [];
  for (const code of SLOTS) {
    const cands = mediums.filter((m) => m.code === code).sort((a, b) => n(b) - n(a));
    quads.push({ slot: code, medium: cands[0] || null, substituted: false });
    if (cands[0]) used.add(cands[0].medium_id);
  }
  const extras = mediums.filter((m) => !used.has(m.medium_id)).sort((a, b) => n(b) - n(a));
  if (!quads[0].medium && extras.length) quads[0] = { slot: 'Release', medium: extras.shift(), substituted: true };
  for (const m of extras) quads.push({ slot: m.code, medium: m, substituted: false, extra: true });
  const withMedium = quads.filter((q) => q.medium);
  const def = quads[0].medium && !quads[0].substituted
    ? quads[0].medium
    : ([...withMedium].sort((a, b) => n(b.medium) - n(a.medium))[0] || {}).medium || null;
  return { quads, defaultMedium: def, count };
}

// Pembanding aktif bawaan: run pembanding valid yang paling sering dirujuk perbandingan; seri -> terbaru.
export function defaultRef(mediumId, data, roles) {
  const refs = data.runs.filter((r) => r.medium_id === mediumId && r.is_valid && roles.get(r.run_id) === 'pembanding');
  if (!refs.length) return null;
  const used = new Map();
  for (const c of data.comparisons) if (c.medium_id === mediumId) used.set(c.ref_run_id, (used.get(c.ref_run_id) || 0) + 1);
  refs.sort((a, b) => (used.get(b.run_id) || 0) - (used.get(a.run_id) || 0)
    || String(b.test_date || '').localeCompare(String(a.test_date || '')) || b.run_id - a.run_id);
  return refs[0].run_id;
}

// Gaya titik: satu run = satu warna + satu bentuk (kombinasi unik sampai 56 run).
export function styleFor(index) {
  return { color: PALETTE[index % PALETTE.length], shape: SHAPES[(Math.floor(index / PALETTE.length) + index) % SHAPES.length] };
}

export function buildProfiles(host, data) {
  const m = new Map();
  for (const r of data.runs) m.set(r.run_id, profileOfRun(host, r));
  return m;
}

// f2 terhadap pembanding (lewat modul asli).
export function compareWithRef(host, profiles, refId, testId) {
  if (refId == null || refId === testId) return null;
  return f2Between(host, profiles.get(refId), profiles.get(testId));
}
export function firstAtLeast85(profile) {
  if (!profile || profile.error) return null;
  const i = profile.means.findIndex((x) => x >= 85);
  return i < 0 ? null : profile.times[i];
}
export function maxRsd(profile) { return !profile || profile.error ? NaN : Math.max(...profile.stats.map((s) => s.rsd)); }

// Data grafik satu kuadran: seri per run terpilih + pembanding aktif (garis hitam tebal).
export function chartSeries(profiles, runs, selectedIds, refId) {
  const ok = (id) => profiles.get(id) && !profiles.get(id).error;
  const toPts = (p) => p.times.map((t, i) => ({ t, y: p.means[i], sd: p.stats[i].sd, rsd: p.stats[i].rsd })).filter((q) => Number.isFinite(q.y));
  return {
    ref: refId != null && ok(refId) ? toPts(profiles.get(refId)) : null,
    series: runs.filter((r) => selectedIds.has(r.run_id) && r.run_id !== refId && ok(r.run_id)).map((r) => ({ run: r, pts: toPts(profiles.get(r.run_id)) })),
  };
}
