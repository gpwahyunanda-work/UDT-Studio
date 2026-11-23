// Adaptor udtBridge (Sprint 2). Memanggil fungsi ASLI Langkah 4 yang sudah ada di halaman
// (calcBatchProfile, evalSimilarityF2, classifyF2Outcome). TIDAK ada rumus f2, mean, SD, atau RSD di sini.
// Data basis data sudah berupa persen terlepas, jadi calcBatchProfile diberi "standar identitas" (semua faktor = 1)
// sehingga keluarannya = nilai masukan; statistik per titik (rata-rata, SD, RSD, min, maks) dihitung oleh fungsi aslinya.
const NEED = ['calcBatchProfile', 'evalSimilarityF2', 'classifyF2Outcome'];
const IDENT = { ws: 1, lc: 1, dilStd: 1, dilSample: 1, volMedia: 1, volRep: 0, pctWS: 1, mrCa: 1, mr: 1 };
const STD = { id: 'identitas', std: [1, 1, 1] };

export function bridgeStatus(host = globalThis) {
  const missing = NEED.filter((n) => typeof host[n] !== 'function');
  return { ok: missing.length === 0, missing };
}
function need(host) {
  const s = bridgeStatus(host);
  if (!s.ok) throw new Error('Modul Langkah 4 tidak ditemukan di halaman: ' + s.missing.join(', '));
  return host;
}

// vessels: { "1": [pct|null,...], "2": [...] }, minutes: [5,10,...]
export function runProfile(host, minutes, vessels) {
  need(host);
  const ids = Object.keys(vessels || {}).map(Number).filter((n) => n >= 1).sort((a, b) => a - b);
  const cells = {};
  for (const v of ids) minutes.forEach((t, i) => { const x = vessels[v][i]; if (typeof x === 'number' && isFinite(x)) cells[v + '|' + t] = { area: x }; });
  const out = host.calcBatchProfile({ times: minutes }, { vessels: ids, cells }, IDENT, STD);
  if (out.error) return { error: out.error, times: minutes, stats: [], means: [], vesselIds: ids, res: [] };
  return { times: out.times, stats: out.stats, means: out.stats.map((s) => s.avg), vesselIds: ids, res: out.res, error: null };
}

// Titik waktu bersama (urutan pembanding). Beda titik waktu = f2 dihitung pada irisan dan ditandai.
function align(ref, test) {
  const idxT = new Map(test.times.map((t, i) => [t, i]));
  const times = [], ri = [], ti = [];
  ref.times.forEach((t, i) => { if (idxT.has(t)) { times.push(t); ri.push(i); ti.push(idxT.get(t)); } });
  return { times, ri, ti, mismatch: !(ref.times.length === test.times.length && times.length === ref.times.length) };
}

export function f2Between(host, refProfile, testProfile) {
  need(host);
  if (refProfile.error || testProfile.error) return { f2: NaN, n: 0, error: refProfile.error || testProfile.error, outcome: host.classifyF2Outcome(null) };
  const a = align(refProfile, testProfile);
  const pick = (arr, ix) => ix.map((i) => arr[i]);
  const r = host.evalSimilarityF2(a.times, pick(refProfile.means, a.ri), pick(testProfile.means, a.ti), pick(refProfile.stats, a.ri), pick(testProfile.stats, a.ti));
  return { ...r, outcome: host.classifyF2Outcome(r), timesMismatch: a.mismatch, error: null };
}

export function profileOfRun(host, run) { return runProfile(host, run.minutes, run.vessels); }
