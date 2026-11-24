// Data dashboard Compiler (F6): satu pembacaan, semua angka dihitung di server. Klien HANYA menampilkan.
// - rata-rata dan RSD per titik: fungsi asli Langkah 4 (calcBatchProfile lewat udtBridge)
// - f2_sheet: aturan tim (server/f2tim.js); f2_langkah4: evalSimilarityF2 asli (aturan pemotongan 85% dan n)
import * as step4 from './step4.js';
import { runProfile, f2Between, rsdOutOfLimit } from './lib/udtBridge.js';
import { deriveRoles } from './lib/model.js';
import { loadCompileData } from './compileData.js';
import { f2Tim, KIND_OF_L4 } from './f2tim.js';

const STD = ['1,2', '4,5', '6,8', 'Air'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const fin = (x) => typeof x === 'number' && Number.isFinite(x);
export const fmt1 = (x) => (fin(x) ? x.toFixed(1).replace('.', ',') : '–');
export const labelOfCode = (c) => (c === 'Release' ? 'Release' : c === 'Air' ? 'Air' : `pH ${c}`);
export const shortBrand = (b) => String(b || '').replace(/\s+(tablet|tab|kapsul|kaplet|capsule|fc tablet)\s*$/i, '').trim();
const fdate = (s) => { if (!s) return ''; const p = s.split('-'); return `${Number(p[2])} ${MON[Number(p[1]) - 1]}`; };
const TOL = 1e-9;
export const F2_BEDA = 1;   // selisih f2 sheet vs Langkah 4 di atas ini ditandai

// Nama baku medium untuk produk yang belum punya medium itu (disalin dari sheet UDT yang ada).
export const MEDIUM_BAKU = {
  'Release': 'Release (HCl 0,1 N)',
  '1,2': 'Simulated Gastric Fluid Without Enzyme (Buffer pH 1,2)', '4,5': 'Buffer Acetate pH 4,5', '6,8': 'Buffer Phosphate pH 6,8', 'Air': 'Air',
};

export function alignedAvg(profile, TM) {   // TM = [0, ...menit positif]; hasil sejajar dengan TM, 0 di awal, null bila titik tidak ada
  const m = new Map(profile.times.map((t, i) => [t, i]));
  const avg = TM.map((t) => (t === 0 ? 0 : (m.has(t) && fin(profile.means[m.get(t)]) ? profile.means[m.get(t)] : null)));
  const rsd = TM.map((t) => (t === 0 ? 0 : (m.has(t) && fin(profile.stats[m.get(t)].rsd) ? profile.stats[m.get(t)].rsd : null)));
  return { avg, rsd };
}

const printedCategory = (text) => {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return null;
  if (t.includes('not similar')) return 'not';
  if (t.includes('rapid')) return 'rap';
  if (t.includes('similar')) return 'sim';
  return null;
};
const KT = { sim: 'Similar', rap: 'Similar (sangat cepat, f2 hanya informasi)', not: 'Not Similar' };

// Penyebab selisih (hanya yang dapat dibuktikan dari data): n berbeda, rumus sheet tidak konsisten dengan Total/n tercetak, titik/nilai berbeda, hanya status berbeda.
export function causeOf(c, l4, pts) {
  const A = (tot, n) => (fin(tot) && n > 0 ? 50 * Math.log10(100 / Math.sqrt(1 + tot / n)) : null);
  if (c.sheet) {
    const s = c.sheet;
    if (s.n != null && s.n !== c.n) return `n berbeda (sheet ${s.n} titik, Langkah 4 ${c.n} titik: aturan pemotongan 85% / titik yang dipakai)`;
    const re = A(s.total, s.n);
    if (re !== null && Math.abs(re - s.f2) > 0.1) return `f2 tercetak sheet (${fmt1(s.f2)}) tidak cocok dengan Total dan n tercetaknya sendiri (hitung ${fmt1(re)}): rumus sheet tidak konsisten`;
    if (s.total != null && Math.abs(s.total - c.total) > 1e-6) {
      const sq = l4.usedRef.map((x, i) => (x - l4.usedTest[i]) ** 2), diff = [];
      (pts || []).forEach((p, i) => { if (i < sq.length && Math.abs(p.sq - sq[i]) > 1e-3) diff.push(`menit ${l4.usedTimes[i]} (kuadrat selisih sheet ${fmt1(p.sq)}, Langkah 4 ${fmt1(sq[i])})`); });
      return `n sama (${c.n}) tetapi Total berbeda (sheet ${fmt1(s.total)}, Langkah 4 ${fmt1(c.total)})` + (diff.length ? `; titik yang berbeda: ${diff.join(', ')}. Rerata titik di sheet tidak sama dengan rerata dari nilai per vessel` : `; sheet tidak menyimpan selisih per titik. Kuadrat selisih Langkah 4 per titik: ${sq.map((x, i) => `${l4.usedTimes[i]}' ${fmt1(x)}`).join(', ')}. Rerata titik di sheet tidak sama dengan rerata dari nilai per vessel`);
    }
    return 'angka sama dari Total dan n tetapi status tercetak berbeda dari aturan Langkah 4';
  }
  return c.n !== 3 ? `n Langkah 4 = ${c.n}, tim memakai n = 3 (aturan pemotongan 85%)` : 'aturan sama (n = 3) tetapi status berbeda (sangat cepat)';
}

export async function buildDashboard(query, id) {
  const data = await loadCompileData(query, id, { withPoints: true });   // titik tercetak sheet dipakai hanya untuk menjelaskan penyebab selisih
  if (!data) return null;
  const roles = deriveRoles(data);
  const medById = new Map(data.mediums.map((m) => [m.medium_id, m]));
  const codeOf = (r) => medById.get(r.medium_id)?.code;

  // titik waktu: gabungan menit positif seluruh run, 0 di depan
  const TM = [0, ...[...new Set(data.runs.flatMap((r) => r.minutes))].sort((a, b) => a - b)];

  // media: empat baku (pH 1,2 / 4,5 / 6,8 / Air); Release bila ada; lain-lain bila ada data
  const codesWithRuns = new Set(data.runs.filter((r) => r.is_valid).map(codeOf));
  const codes = [...STD];
  if (data.mediums.some((m) => m.code === 'Release')) codes.push('Release');
  for (const m of data.mediums) if (!codes.includes(m.code)) codes.push(m.code);
  const media = codes.map((c) => {
    const m = data.mediums.find((x) => x.code === c);
    return { id: c, name: labelOfCode(c), desc: m ? m.full_name : (c === 'Air' ? 'Medium air' : (MEDIUM_BAKU[c] || labelOfCode(c))), has: codesWithRuns.has(c), medium_id: m ? m.medium_id : null,
      volume_text: m?.volume_text ?? null, apparatus: m?.apparatus ?? null, rpm_text: m?.rpm_text ?? null, method: m?.method ?? null };
  });

  // profil tiap run
  const prof = new Map();
  for (const r of data.runs) prof.set(r.run_id, runProfile(step4, r.minutes, r.vessels));
  const newer = (a, b) => (b.test_date || '').localeCompare(a.test_date || '') || b.run_id - a.run_id;

  // baris = (batch, varian); satu run valid terbaru per medium dipakai sel, sisanya dihitung sebagai "ulang"
  const rows = new Map();
  for (const r of data.runs) {
    const key = r.variant ? `${r.batch_no} ${r.variant}` : r.batch_no;
    const e = rows.get(key) || rows.set(key, { key, code: r.batch_no, variant: r.variant || '', product: shortBrand(r.brand_name), brand_name: r.brand_name, date: '', entered_at: '', comp: false, role: null, site: r.manufacturer_site || null, prof: {}, invalid: {}, held: {}, run_ids: {}, notes: [], extra: 0, _runs: [] }).get(key);
    e._runs.push(r);
    if (r.entered_at && (!e.entered_at || r.entered_at < e.entered_at)) e.entered_at = r.entered_at;   // F14: waktu data PERTAMA masuk ke Compiler (run.created_at; impor = waktu transaksi impor, Studio = waktu push)
    if (r.test_date && (!e.date || r.test_date < e.date)) e.date = r.test_date;   // tanggal baris = yang tertua di antara medium (cocok HTML tim)
    if (r.manufacturer_site && !e.site) e.site = r.manufacturer_site;
  }
  for (const e of rows.values()) {
    for (const code of new Set(e._runs.map(codeOf))) {
      const cand = e._runs.filter((r) => codeOf(r) === code).sort((a, b) => (b.is_valid - a.is_valid) || newer(a, b));
      const r = cand[0], p = prof.get(r.run_id);
      if (!p || p.error) continue;
      const sb = r.source_blocks || [], held = sb.length && sb.every((b) => b.import_outcome === 'ditahan') ? (sb[0].hold_reason || 'Ditahan saat impor') : null;   // F8 (e): blok yang ditahan pembaca impor ditandai di payload
      e.prof[code] = { ...alignedAvg(p, TM), run_id: r.run_id, valid: r.is_valid, vessels: Object.keys(r.vessels).length, date: r.test_date || null, note: r.note || null, held };
      if (held) e.held[code] = held;
      if (!r.is_valid) e.invalid[code] = r.invalid_reason || 'Tidak valid';
      e.run_ids[code] = r.run_id; e.extra += cand.length - 1;
    }
    e.comp = e._runs.some((r) => roles.get(r.run_id) === 'pembanding');
  }

  // pembanding: urut menurut seberapa sering dirujuk perbandingan, lalu terbaru
  const used = new Map();
  for (const c of data.comparisons) used.set(c.ref_run_id, (used.get(c.ref_run_id) || 0) + 1);
  const compRows = [...rows.values()].filter((e) => e.comp).map((e) => ({ e, used: e._runs.reduce((s, r) => s + (used.get(r.run_id) || 0), 0) }))
    .sort((a, b) => b.used - a.used || b.e.date.localeCompare(a.e.date));
  const comps = {}, compOrder = [];
  for (const { e } of compRows) {
    comps[e.key] = { key: e.key, name: e.product, lot: e.code, maker: e.site || '' };
    compOrder.push(e.key);
  }

  // sel f2: cells[pembanding][baris][medium] = { f2s, ks, f2l, kl, n_l, beda }
  const cells = {};
  const pairs = [], noL4 = [];
  const stored = new Map(data.comparisons.map((c) => [`${c.test_run_id}|${c.ref_run_id}`, c]));
  for (const ck of compOrder) {
    cells[ck] = {};
    const cRow = rows.get(ck);
    for (const e of rows.values()) {
      if (e.key === ck) continue;
      for (const code of Object.keys(e.prof)) {
        const cp = cRow.prof[code]; if (!cp) continue;
        const t = f2Tim(cp.avg.slice(1), e.prof[code].avg.slice(1));
        const st = stored.get(`${e.prof[code].run_id}|${cp.run_id}`);
        const printedOk = st && st.f2_source === 'sheet' && fin(st.f2);
        const l4 = f2Between(step4, prof.get(cp.run_id), prof.get(e.prof[code].run_id));
        const kl = l4.error ? 'na' : KIND_OF_L4[l4.outcome.code];
        const f2l = l4.error ? null : (fin(l4.f2) ? l4.f2 : null);
        // F17 (jawaban tim P-1, mengganti S-2): angka RESMI = Langkah 4 (aturan pemotongan 85%, n, rapid), dihitung di sini dari nilai per vessel lewat udtBridge. Angka tercetak sheet lama dan hitung ulang tim (n=3) hanya PEMBANDING.
        if (f2l === null) { if (printedOk || fin(t.f2)) noL4.push({ ck, key: e.key, code, printed: printedOk ? st.f2 : null }); continue; }
        const l4tot = l4.usedRef.reduce((a, x, i) => a + (x - l4.usedTest[i]) ** 2, 0);
        const sheet = printedOk ? { f2: st.f2, k: printedCategory(st.conclusion_printed) || (t.kind !== 'na' ? t.kind : (st.f2 >= 50 ? 'sim' : 'not')), n: st.n_points, total: fin(st.total_sq) ? st.total_sq : null } : null;
        const kk = (a, b) => a !== b;
        const diffF2 = (x, k) => k !== 'rap' && Math.abs(f2l - x) > F2_BEDA;
        const cell = { f2: f2l, k: kl, n: l4.n, total: l4tot, src: 'langkah4', sheet, f2s: fin(t.f2) ? t.f2 : null, ks: t.kind,
          beda_sheet: !!sheet && (kk(kl, sheet.k) || diffF2(sheet.f2, kl)),
          beda_tim: !sheet && fin(t.f2) && (kk(kl, t.kind) || diffF2(t.f2, kl)) };
        cell.cause = (cell.beda_sheet || cell.beda_tim) ? causeOf(cell, l4, st?.points) : null;
        ((cells[ck][e.key] ||= {})[code]) = cell;
        pairs.push({ ck, key: e.key, code, cell });
      }
    }
  }

  // ---------- temuan "Perlu dicek" ----------
  const findings = [], warn = {};
  const tag = (key, text) => { (warn[key] ||= []).includes(text) || warn[key].push(text); };
  const nameOfRow = (e) => (e.comp ? `${e.product} (${e.code})` : e.key);
  // F14: kunci urutan tampil dan penanda grafik: entered_at (run.created_at pertama) menurun; sama (satu impor) -> tanggal uji menurun; lalu kunci batch. Deterministik, tidak bergantung urutan klik.
  const byEntry = (a, b) => b.entered_at.localeCompare(a.entered_at) || b.date.localeCompare(a.date) || a.key.localeCompare(b.key);
  const rowsList = [...rows.values()].sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
  const order = (code) => codes.indexOf(code);

  // 1. Beda dengan sheet lama: lihat bagian 5 (F17: angka resmi = Langkah 4; sheet lama dan hitung ulang tim hanya pembanding)
  const runKey = new Map(); for (const e of rows.values()) for (const r of e._runs) runKey.set(r.run_id, e);

  // 2. Data identik (rata-rata sama persis)
  const sameAvg = (a, b) => a.every((x, i) => (x === null ? b[i] === null : b[i] !== null && Math.abs(x - b[i]) < TOL));
  const headComp = compOrder[0] ? comps[compOrder[0]] : null;
  for (const code of codes) {
    const groups = [];
    for (const e of rowsList) {
      const p = e.prof[code]; if (!p || !p.valid) continue;
      const g = groups.find((x) => sameAvg(x.avg, p.avg)); if (g) g.members.push(e); else groups.push({ avg: p.avg, members: [e] });
    }
    for (const g of groups) {
      if (g.members.length < 2) continue;
      const cm = g.members.find((e) => e.comp), others = g.members.filter((e) => !e.comp);
      if (cm && others.length) {
        for (const e of others) { findings.push({ kind: 'identik', batch: e.key, medium: labelOfCode(code), type: 'Data identik', tone: 'warn', order: 2, text: `Profil rerata sama persis dengan ${cm.product} ${cm.code} (f2 terhadap ${firstWord(cm.product)} 100,0). Hanya ditandai.` }); tag(e.key, `Profil identik dengan ${firstWord(cm.product)} (${labelOfCode(code)})`); }
      } else if (others.length >= 2) {
        const hc = headComp ? rows.get(headComp.key) : null; let f = '';
        if (hc?.prof[code]) { const t = f2Tim(hc.prof[code].avg.slice(1), g.avg.slice(1)); if (fin(t.f2)) f = ` (f2 ${fmt1(t.f2)} terhadap ${firstWord(hc.product)})`; }
        findings.push({ kind: 'identik', batch: others.map((e) => e.key).join(' dan '), medium: labelOfCode(code), type: 'Data identik', tone: 'warn', order: 2, text: `${others.length === 2 ? 'Kedua batch memiliki' : 'Batch-batch ini memiliki'} profil yang sama${f}. Hanya ditandai.` });
        for (const e of others) tag(e.key, `Data identik dengan ${others.filter((x) => x !== e).map((x) => x.key).join(', ')} (${labelOfCode(code)})`);
      }
    }
  }

  // 3. RSD di atas batas (F15, jawaban tim P-2): aturan Langkah 4 yang asli, lewat udtBridge (evalSimilarityF2). Hanya titik yang ikut hitungan f2 (sampai pemotongan 85%); batas titik pertama dan titik berikutnya dari Studio, bukan angka di sini.
  for (const e of rowsList) for (const code of codes) {
    const p = e.prof[code]; if (!p || !p.valid) continue;
    const bad = rsdOutOfLimit(step4, prof.get(p.run_id));
    if (!bad.length) continue;
    const grp = [true, false].map((first) => bad.filter((b) => b.first === first)).filter((g) => g.length);
    const txt = grp.map((g) => `${joinId(g.map((b) => `${fmt1(b.v)}% pada ${b.t} menit`))} (batas ${g[0].lim}%${g[0].first ? ' untuk titik pertama' : grp.length > 1 ? ' untuk titik berikutnya' : ''})`).join(' dan ');
    findings.push({ kind: 'rsd', batch: nameOfRow(e).replace(/^(.+?) \((.+)\)$/, (m, a, b) => (e.comp ? `${a} (${b})` : m)), medium: labelOfCode(code), type: 'RSD di atas batas', tone: 'bad', order: 3, text: `RSD ${txt}. Aturan Langkah 4 (PerBPOM 11/2022).` });
    tag(e.key, `RSD di atas batas (${labelOfCode(code)})`);
  }

  // 4. Catatan impor: tidak valid, blok ganda, zat aktif belum pasti
  const byText = new Map();
  const addNote = (e, med, text) => { const k = `${med}|${text}`; (byText.get(k) || byText.set(k, { text, med, rows: [] }).get(k)).rows.push(e); };
  for (const e of rowsList) {
    for (const code of Object.keys(e.invalid)) addNote(e, labelOfCode(code), `Ditandai Tidak valid: ${e.invalid[code]}`);
    const multi = e._runs.filter((r) => r.is_valid && new Set((r.source_blocks || []).map((b) => b.block_date).filter(Boolean)).size > 1);
    if (multi.length) {
      const sb = multi[0].source_blocks, dates = sb.map((b) => b.block_date).filter(Boolean).map((d) => fdate(d));
      addNote(e, 'Semua', `Muncul di ${sb.length === 2 ? 'dua' : sb.length} blok sheet${dates.length ? ` (tanggal ${dates.join(' dan ')})` : ''} dengan data yang sama, sehingga digabung menjadi satu run bertanggal ${fdateFull(multi[0].test_date)}.`);
    }
  }
  for (const e of rowsList) for (const code of Object.keys(e.held)) { findings.push({ kind: 'ditahan', batch: e.key, medium: labelOfCode(code), type: 'Ditahan saat impor', tone: 'warn', order: 4, text: `Blok ini ditahan oleh pembaca impor: ${e.held[code]}. Run tetap tersimpan; hasilnya perlu diperiksa manusia sebelum dipakai.` }); tag(e.key, `Ditahan saat impor (${labelOfCode(code)})`); }
  for (const v of byText.values()) findings.push({ kind: 'catatan', batch: v.rows.map((e) => e.key).join(' dan '), medium: v.med, type: 'Catatan impor', tone: 'info', order: 4, text: v.text });
  if (data.compile.api_uncertain) findings.push({ kind: 'catatan', batch: 'Semua', medium: 'Semua', type: 'Catatan impor', tone: 'info', order: 4, text: 'Zat aktif belum pasti: isi sel D5 bertentangan dengan acuan metode di D10; D5 tidak ditampilkan sebagai fakta.' });

  // 5. Beda dengan sheet lama (F17): per pembanding aktif, satu baris per batch; angka resmi (Langkah 4), angka sheet atau hitung ulang tim, dan penyebab bila diketahui
  const l4 = new Map();
  for (const p of pairs) if ((p.cell.beda_sheet || (p.cell.beda_tim && !rows.get(p.key).comp)) && rows.get(p.key).prof[p.code]?.valid) { const k = `${p.ck}|${p.key}`; (l4.get(k) || l4.set(k, { ck: p.ck, key: p.key, items: [] }).get(k)).items.push(p); }
  for (const g of l4.values()) {
    g.items.sort((a, b) => order(a.code) - order(b.code));
    const nn = (c) => (c.n ? `, n ${c.n}` : '');
    findings.push({ kind: 'beda_sheet', comp: g.ck, batch: g.key, medium: g.items.map((p) => labelOfCode(p.code)).join(', '), type: 'Beda dengan sheet lama', tone: 'warn', order: 1,
      text: g.items.map((p) => { const c = p.cell, s = c.sheet; return `${labelOfCode(p.code)}: resmi (Langkah 4) ${fmt1(c.f2)} (${KT[c.k] || '–'}${nn(c)}), ${s ? `sheet lama ${fmt1(s.f2)} (${KT[s.k] || '–'}${nn(s)})` : `hitung ulang tim ${fmt1(c.f2s)} (${KT[c.ks] || '–'}, n 3)`}${c.cause ? `. Penyebab: ${c.cause}` : ''}`; }).join('; ') + '. Tampilan memakai angka resmi Langkah 4; angka lain hanya pembanding.' });
    for (const p of g.items) tag(g.key, `Selisih dengan sheet lama (${labelOfCode(p.code)})`);
  }
  for (const x of noL4) if (x.printed !== null) { findings.push({ kind: 'beda_sheet', comp: x.ck, batch: x.key, medium: labelOfCode(x.code), type: 'Beda dengan sheet lama', tone: 'warn', order: 1, text: `Sheet lama mencetak f2 ${fmt1(x.printed)}, tetapi Langkah 4 belum dapat menghitung f2 resmi (titik waktu terisi kurang). Tidak ada angka resmi untuk sel ini.` }); tag(x.key, `Selisih dengan sheet lama (${labelOfCode(x.code)})`); }
  const medOrder = (f) => Math.min(...String(f.medium).split(', ').map((m) => { const c = codes.find((k) => labelOfCode(k) === m); return c ? order(c) : 99; }));
  findings.sort((a, b) => a.order - b.order || medOrder(a) - medOrder(b));

  const dates = rowsList.map((e) => e.date).filter(Boolean).sort();
  const months = [...new Set(dates.map((d) => d.slice(0, 7)))];
  return {
    product: { id, name: productLabel(data.compile), title: data.compile.title, api: data.compile.api, api_uncertain: !!data.compile.api_uncertain, project_code: data.compile.project_code, date_min: dates[0] || null, date_max: dates[dates.length - 1] || null, months },
    times: TM, media, comps, comp_order: compOrder,
    runs: [...rowsList].sort(byEntry).map(({ _runs, ...e }) => e), /* F14: urutan tampil = waktu masuk, terbaru di atas */ cells, findings, warn: Object.fromEntries(Object.entries(warn).map(([k, v]) => [k, v.join('; ')])),
    mediums_all: data.mediums.map((m) => ({ code: m.code, medium_id: m.medium_id, full_name: m.full_name })),
  };
}

const fdateFull = (s) => { if (!s) return 'kosong'; const p = s.split('-'); return `${Number(p[2])} ${MON[Number(p[1]) - 1]} ${p[0]}`; };
const joinId = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} dan ${a[a.length - 1]}`);
const firstWord = (s) => String(s || '').split(' ')[0];
export const productLabel = (c) => [c.product_name, c.strength, c.dosage_form].filter(Boolean).join(' ');
