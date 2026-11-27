// F24: ekspor ke Master Template resmi (Calculation, Report, Summary) dari data compile.
// Nilai = data yang sama dengan matriks Compiler: masukan `data` berasal dari withOfficialF2 (f2 resmi = Langkah 4, blok ditahan tanpa angka).
// Modul ini TIDAK menghitung f2; angka f2/Total/n hanya hasil rumus Excel asli di template dari % terlarut yang sama.
// Catatan jujur: Compiler tidak menyimpan Area/standar mentah, jadi sel Area diisi % terlarut dengan parameter netral (lihat NOTES_F24.md).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { Pkg, colName, safeName } from './lib/xlsxTemplate.js';
import { recalcPkg } from './lib/xlsxEval.js';
import { productLabel } from './dashboard.js';
import { safeText } from './export.js';

const TPL = (n) => fileURLToPath(new URL(`./templates/${n}`, import.meta.url));
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtDateEN = (iso) => { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(iso || ''); return m ? `${Number(m[3])} ${MON[Number(m[2]) - 1]} ${m[1]}` : ''; };
const serial = (iso) => { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(iso || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 + 25569 : null; };
const num = (x) => typeof x === 'number' && Number.isFinite(x);
const maxV = (run) => Math.max(0, ...Object.keys(run.vessels).map(Number));
const runLabel = (r) => `${r.brand_name} (${r.batch_no}${r.variant ? ' ' + r.variant : ''})`;
const byDate = (a, b) => (a.test_date || '9').localeCompare(b.test_date || '9') || a.run_id - b.run_id;
const fileSafe = (s) => String(s).replace(/[^\w .,()-]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 110);
const txt = (v) => safeText(v == null ? '' : v);   // teks masukan pengguna: awalan ' pada = + - @ (injeksi rumus)

// Alasan sebuah run tidak muat di template (null = muat). maxT: Calculation 9, Report/Summary 7.
export function runIssue(run, maxT) {
  const V = maxV(run);
  if (V > 12) return `lebih dari 12 vessel (${V})`;
  if (!run.minutes.length) return 'tanpa titik waktu';
  if (run.minutes.length > maxT) return `${run.minutes.length} titik waktu (template memuat ${maxT})`;
  return null;
}
const sameMinutes = (a, b) => a.minutes.length === b.minutes.length && a.minutes.every((x, i) => x === b.minutes[i]);

function groupsOf(data) {   // satu kelompok per kode medium (beberapa nama lengkap dengan kode sama berbagi satu berkas)
  const g = new Map();
  for (const m of data.mediums) (g.get(m.code) || g.set(m.code, { code: m.code, label: m.label, mediums: [], ids: new Set() }).get(m.code)).mediums.push(m);
  for (const x of g.values()) x.mediums.forEach((m) => x.ids.add(m.medium_id));
  return [...g.values()];
}
const mediumOf = (data, run) => data.mediums.find((m) => m.medium_id === run.medium_id);
const loadPkg = async (name) => Pkg.load(await readFile(TPL(name)));
const dedupe = (names, n) => { n = safeName(n); let x = n, i = 2; while (names.has(x)) x = `${n.slice(0, 27)} (${i++})`; names.add(x); return x; };

// ---------------------------------------------------------------- Calculation
function fillCalc(sh, run, med, data, isRef) {
  const T = run.minutes.length, V = maxV(run), colL = (k) => colName(4 + k);
  for (const [c1, r1, c2, r2] of [[4, 21, 12, 33], [4, 38, 12, 38], [4, 39, 12, 50], [4, 54, 12, 54], [4, 55, 12, 66], [4, 67, 12, 71], [13, 22, 13, 26], [14, 25, 15, 26]]) sh.clearRange(c1, r1, c2, r2);
  const dateStr = fmtDateEN(run.test_date);
  const hdr = (ref, v) => sh.set(ref, txt(': ' + (v ?? '')));
  hdr('E3', run.brand_name); hdr('E4', run.batch_no + ' '); hdr('E5', data.compile.api); hdr('E6', med.full_name); hdr('E7', med.apparatus);
  sh.set('E8', ': NA'); hdr('E9', isRef ? 'Reference Product' : 'Test Product'); sh.set('E10', ': '); sh.set('E11', ': ' + dateStr); hdr('E12', med.method);
  sh.set('N8', ': ' + dateStr); sh.set('N11', ': ' + dateStr);
  // parameter netral: Area = % terlarut (lihat NOTES_F24). Rumus template tetap hidup.
  for (const [r, v] of [['E14', 1], ['E15', 1], ['E16', 1], ['M14', 0], ['M15', 1], ['M16', 100], ['M17', 1], ['M18', 1], ['N22', 1], ['M22', 100], ['M23', 100], ['M24', 100], ['M25', 100], ['M26', 100], ['N25', 100], ['N26', 100], ['O25', 100], ['O26', 100]]) sh.set(r, v);
  sh.set('B34', 'Catatan: Compiler tidak menyimpan Area/standar mentah. Sel Area diisi nilai % terlarut; parameter dibuat netral (Label Claim, pengenceran, MR = 1; % WS dan Area WS = 100; volume ganti = 0) sehingga rumus template tetap hidup dan hasilnya = % terlarut Compiler.');
  const notes = [];
  if (run.held) notes.push(`DITAHAN saat impor (angka tidak ditampilkan): ${run.held}`);
  if (!run.is_valid) notes.push(`TIDAK VALID: ${run.invalid_reason || ''}`);
  if (run.note) notes.push(run.note);
  sh.set('B35', txt(notes.join(' | ')));
  for (let k = 0; k < T; k++) sh.set(`${colL(k)}21`, `${run.minutes[k]}'`);
  if (run.held) return;
  for (let k = 0; k < T; k++) {
    const c = colL(k);
    sh.set(`${c}38`, { f: `${c}21` }); sh.set(`${c}54`, { f: `${c}38` });
    for (let i = 1; i <= V; i++) {
      const x = run.vessels[i]?.[k]; if (!num(x)) continue;
      sh.set(`${c}${21 + i}`, x);
      sh.set(`${c}${38 + i}`, { f: `(${c}${21 + i}/$M$27)*($N$22/$E$14)*($E$16/$E$15)*($M$18/$M$17)*($M$16)` });
      sh.set(`${c}${54 + i}`, { f: k === 0 ? `${c}${38 + i}` : (k === 1 ? `${c}${38 + i}+($M$14/$M$15)*D${54 + i}` : `${c}${38 + i}+($M$14/$M$15)*SUM(D${54 + i}:${colL(k - 1)}${54 + i})`) });
    }
    if (V > 0) {
      const rg = `${c}55:${c}${54 + V}`;
      sh.set(`${c}67`, { f: `MIN(${rg})` }); sh.set(`${c}68`, { f: `MAX(${rg})` }); sh.set(`${c}69`, { f: `AVERAGE(${rg})` }); sh.set(`${c}70`, { f: `STDEV(${rg})` }); sh.set(`${c}71`, { f: `${c}70/${c}69*100` });
    }
  }
}

export async function buildCalculationBook(data, g, notes) {
  const runs = data.runs.filter((r) => g.ids.has(r.medium_id));
  const refIds = new Set(data.comparisons.filter((c) => g.ids.has(c.medium_id)).map((c) => c.ref_run_id));
  const ok = [];
  for (const r of runs.slice().sort(byDate)) { const why = runIssue(r, 9); if (why) notes.push(`Calculation ${g.label}: ${runLabel(r)} dilewati, ${why}`); else ok.push(r); }
  const isRef = (r) => refIds.has(r.run_id) || r.role === 'reference';
  const ordered = [...ok.filter(isRef), ...ok.filter((r) => !isRef(r))];
  if (!ordered.length) return null;
  const pkg = await loadPkg('Master_Calculation.xlsx'), src = pkg.names()[0];
  await pkg.rename(src, '__tpl');
  const used = new Set(), tabs = [];
  for (const r of ordered) { const n = dedupe(used, `${isRef(r) ? 'REF ' : ''}${r.batch_no}${r.variant ? ' ' + r.variant : ''}`); tabs.push([n, r]); await pkg.clone('__tpl', n); }
  await pkg.remove('__tpl');
  for (const [n, r] of tabs) fillCalc(await pkg.sheet(n), r, mediumOf(data, r), data, isRef(r));
  await recalcPkg(pkg);
  const tests = ordered.filter((r) => !isRef(r)).map((r) => r.batch_no);
  const name = fileSafe(`UDT ${data.compile.product_name} ${tests.length > 3 ? tests.length + ' batch uji' : [...new Set(tests)].join('_')} ${g.label} - Calculation`) + '.xlsx';
  return { name, buffer: await pkg.toBuffer(tabs.map((t) => t[0])), tabs: tabs.length };
}

// ---------------------------------------------------------------- Report
function fillReport(sh, ref, test, cm, med, data) {
  const T = ref.minutes.length, colG = (k) => colName(7 + k), Vr = maxV(ref), Vt = maxV(test), n = cm.n_points || 0;
  const hasF2 = cm.f2 != null && n >= 1;
  sh.clearRange(7, 19, 13, 19); sh.clearRange(7, 20, 13, 27); sh.clearRange(7, 46, 13, 47); sh.clearRange(7, 54, 13, 54); sh.clearRange(7, 62, 13, 78); sh.clearRange(7, 83, 13, 99);
  sh.clearRange(7, 48, 7, 57);
  const E = (r, v) => sh.set(`E${r}`, txt(v));
  E(8, ref.brand_name); E(9, test.brand_name); E(10, med.full_name); E(11, med.volume_text); E(12, med.apparatus); E(13, med.rpm_text); E(14, med.method); E(15, med.method_ref);
  sh.set('C20', txt(`${ref.brand_name} (${ref.batch_no})`)); sh.set('D20', null); sh.set('C23', txt(ref.manufacturer_site));
  sh.set('C24', txt(`${test.brand_name} (${test.batch_no})`)); sh.set('D24', null); sh.set('C27', txt(test.manufacturer_site));
  sh.set('C70', { f: 'C23' }); sh.set('C91', { f: 'C27' });   // C70 di template menunjuk C27 (produk uji); yang benar = manufaktur Reference
  for (let k = 0; k < T; k++) {
    const c = colG(k);
    sh.set(`${c}19`, ref.minutes[k]); sh.set(`${c}62`, { f: `${c}19` }); sh.set(`${c}83`, ref.minutes[k]);
    [75, 76, 77, 78].forEach((r, i) => sh.set(`${c}${20 + i}`, { f: `${c}${r}` })); [96, 97, 98, 99].forEach((r, i) => sh.set(`${c}${24 + i}`, { f: `${c}${r}` }));
    for (let i = 1; i <= Vr; i++) if (num(ref.vessels[i]?.[k])) sh.set(`${c}${62 + i}`, ref.vessels[i][k]);
    for (let i = 1; i <= Vt; i++) if (num(test.vessels[i]?.[k])) sh.set(`${c}${83 + i}`, test.vessels[i][k]);
    const R = (a, b) => `${c}${a}:${c}${b}`, rr = R(63, 62 + Vr), tr = R(84, 83 + Vt);
    sh.set(`${c}75`, { f: `AVERAGE(${rr})` }); sh.set(`${c}76`, { f: `MIN(${rr})` }); sh.set(`${c}77`, { f: `MAX(${rr})` }); sh.set(`${c}78`, { f: `STDEV(${rr})/AVERAGE(${rr})*100` });
    sh.set(`${c}96`, { f: `AVERAGE(${tr})` }); sh.set(`${c}97`, { f: `MIN(${tr})` }); sh.set(`${c}98`, { f: `MAX(${tr})` }); sh.set(`${c}99`, { f: `STDEV(${tr})/AVERAGE(${tr})*100` });
    sh.set(`${c}46`, { f: `${c}19` }); sh.set(`${c}47`, { f: `(${c}20-${c}24)^2` }); sh.set(`${c}54`, { f: `ABS(${c}20-${c}24)` });
  }
  if (!hasF2) { sh.set('G53', 'f2 belum dapat dihitung (titik terisi kurang)'); return; }
  const end = colG(n - 1);
  sh.set('G48', { f: `SUM(G47:${end}47)` }); sh.set('G49', n); sh.set('G50', { f: '(1+(1/G49*G48))^-0.5' }); sh.set('G51', { f: '50*LOG(G50*100)' }); sh.set('G52', '50 - 100');
  sh.set('G53', { very_rapid: 'Similar, both products rapidly dissolved (≥85% in 15 minutes).\nF2 calculation for information only', similar: 'Similar', not_similar: 'Not Similar' }[cm.conclusion_code] || '');
  sh.set('G55', { f: `SUM(G54:${end}54)` }); sh.set('G56', { f: `SUM(G20:${end}20)` }); sh.set('G57', { f: 'G55/G56*100' });
}

export async function buildReportBook(data, g, notes) {
  const byId = new Map(data.runs.map((r) => [r.run_id, r]));
  const pairs = [];
  for (const cm of data.comparisons.filter((c) => g.ids.has(c.medium_id)).slice().sort((a, b) => byDate(byId.get(a.test_run_id), byId.get(b.test_run_id)))) {
    const ref = byId.get(cm.ref_run_id), test = byId.get(cm.test_run_id); if (!ref || !test) continue;
    const label = `${runLabel(test)} vs ${runLabel(ref)}`;
    if (cm.held) { notes.push(`Report ${g.label}: ${label} dilewati, ditahan saat impor (${cm.held})`); continue; }
    const why = runIssue(ref, 7) || runIssue(test, 7);
    if (why) { notes.push(`Report ${g.label}: ${label} dilewati, ${why}`); continue; }
    if (!sameMinutes(ref, test)) { notes.push(`Report ${g.label}: ${label} dilewati, titik waktu uji dan pembanding berbeda`); continue; }
    pairs.push({ ref, test, cm });
  }
  if (!pairs.length) return null;
  const pkg = await loadPkg('Master_Report.xlsx'), src = pkg.names()[0];
  await pkg.rename(src, '__tpl');
  const used = new Set(), tabs = [];
  for (const p of pairs) {
    let base = pairs.length === 1 ? 'Report' : `Report ${p.test.batch_no}`;
    if (used.has(base.slice(0, 31))) base = `${base} vs ${p.ref.batch_no}`;
    const n = dedupe(used, base); tabs.push([n, p]); await pkg.clone('__tpl', n);
  }
  await pkg.remove('__tpl');
  for (const [n, p] of tabs) fillReport(await pkg.sheet(n), p.ref, p.test, p.cm, mediumOf(data, p.test), data);
  await recalcPkg(pkg);
  const tests = [...new Set(pairs.map((p) => p.test.batch_no))];
  const name = fileSafe(`UDT ${data.compile.product_name} ${tests.length > 3 ? tests.length + ' batch uji' : tests.join('_')} ${g.label} - Report`) + '.xlsx';
  return { name, buffer: await pkg.toBuffer(tabs.map((t) => t[0])), tabs: tabs.length };
}

// ---------------------------------------------------------------- Summary
const BLOCKS = 12, TESTS_PER_PAGE = BLOCKS - 1;
function writeBlock(sh, s, run, T, V, labels) {
  for (const [c1, r1, c2, r2] of [[1, s, 2, s + 1], [5, s, 11, s + 3], [5, s + 7, 11, s + 22], [13, s, 21, s + 4], [13, s + 22, 20, s + 22]]) sh.clearRange(c1, r1, c2, r2);
  const d = serial(run.test_date); if (d !== null) sh.set(`A${s}`, d);
  sh.set(`B${s}`, txt(runLabel({ ...run, variant: '' }))); sh.set(`B${s + 1}`, txt(run.manufacturer_site));
  sh.set(`M${s + 22}`, 'Minutes');
  for (let k = 0; k < T; k++) {
    const c = colName(5 + k);
    sh.set(`${c}${s}`, { f: `${c}${s + 19}` }); sh.set(`${c}${s + 1}`, { f: `${c}${s + 20}` }); sh.set(`${c}${s + 2}`, { f: `${c}${s + 21}` }); sh.set(`${c}${s + 3}`, { f: `${c}${s + 22}` });
    sh.set(`${colName(14 + k)}${s + 22}`, labels[k]);
    if (run.held) continue;
    for (let i = 1; i <= V; i++) if (num(run.vessels[i]?.[k])) sh.set(`${c}${s + 6 + i}`, run.vessels[i][k]);
    const rg = `${c}${s + 7}:${c}${s + 6 + Math.max(1, V)}`;
    sh.set(`${c}${s + 19}`, { f: `AVERAGE(${rg})` }); sh.set(`${c}${s + 20}`, { f: `MIN(${rg})` }); sh.set(`${c}${s + 21}`, { f: `MAX(${rg})` }); sh.set(`${c}${s + 22}`, { f: `(STDEV(${rg})/${c}${s + 19})*100` });
  }
}
const f2txt = (x) => (Math.round(x * 10) / 10).toFixed(1);

export async function buildSummaryBook(data, notes) {
  const byId = new Map(data.runs.map((r) => [r.run_id, r]));
  const pages = [];
  for (const g of groupsOf(data)) {
    const mine = data.comparisons.filter((c) => g.ids.has(c.medium_id));
    const refIds = [...new Set(mine.map((c) => c.ref_run_id))].map((id) => byId.get(id)).filter(Boolean).sort(byDate);
    if (!refIds.length) { notes.push(`Summary ${g.label}: tidak ada perbandingan (tanpa Produk Pembanding tertaut), tab tidak dibuat`); continue; }
    const gp = [];
    for (const ref of refIds) {
      const why = runIssue(ref, 7);
      if (why) { notes.push(`Summary ${g.label}: pembanding ${runLabel(ref)} dilewati, ${why}`); continue; }
      const tests = [];
      for (const cm of mine.filter((c) => c.ref_run_id === ref.run_id).sort((a, b) => byDate(byId.get(a.test_run_id), byId.get(b.test_run_id)))) {
        const t = byId.get(cm.test_run_id), w2 = t && (runIssue(t, 7) || (!sameMinutes(ref, t) && 'titik waktu berbeda dari pembanding'));
        if (!t || w2) { notes.push(`Summary ${g.label}: ${t ? runLabel(t) : 'run'} dilewati, ${w2 || 'tidak ditemukan'}`); continue; }
        tests.push({ run: t, cm });
      }
      for (let i = 0; i < Math.max(1, tests.length); i += TESTS_PER_PAGE) gp.push({ g, ref, tests: tests.slice(i, i + TESTS_PER_PAGE) });
    }
    gp.forEach((p, i) => { p.name = gp.length === 1 ? g.label : `${g.label} (${i + 1})`; pages.push(p); });
  }
  if (!pages.length) return null;
  const pkg = await loadPkg('Master_Summary.xlsx');
  await pkg.rename('pH 1,2', '__tpl');
  for (const n of ['pH 4,5', 'pH 6,8']) await pkg.remove(n);   // tab contoh lain tidak dipakai; semua halaman disalin dari satu tab bersih
  const used = new Set();
  for (const p of pages) { p.tab = dedupe(used, p.name); await pkg.clone('__tpl', p.tab); }
  await pkg.remove('__tpl');
  for (const p of pages) {
    const sh = await pkg.sheet(p.tab), med = mediumOf(data, p.ref), T = p.ref.minutes.length, labels = p.ref.minutes.map((m) => `${m}'`);
    sh.set('A2', txt(productLabel(data.compile).toUpperCase()));
    [['D4', med.full_name], ['D5', data.compile.api], ['D6', med.volume_text], ['D7', med.apparatus], ['D8', med.rpm_text], ['D9', med.method], ['D10', med.method_ref]].forEach(([r, v]) => sh.set(r, txt(v)));
    for (let k = 0; k < 7; k++) sh.set(`${colName(5 + k)}13`, k < T ? labels[k] : null);
    const blocks = [{ run: p.ref }, ...p.tests];
    blocks.forEach((b, k) => {
      const s = 14 + 23 * k, V = maxV(b.run);
      writeBlock(sh, s, b.run, T, V, labels);
      if (k === 0) return;
      const cm = b.cm, n = cm.n_points || 0;
      if (cm.held || b.run.held) { sh.set(`U${s}`, `DITAHAN saat impor (tanpa angka f2): ${cm.held || b.run.held}`); return; }
      if (cm.f2 == null || n < 1) { sh.set(`U${s}`, 'f2 belum dapat dihitung (titik terisi kurang)'); return; }
      sh.set(`M${s}`, '(Rt- Tt)2');
      for (let j = 0; j < T; j++) { const c = colName(5 + j); sh.set(`${colName(14 + j)}${s}`, { f: `(${c}$14-${c}${s})^2` }); }
      sh.set(`M${s + 1}`, 'Total'); sh.set(`N${s + 1}`, { f: `SUM(N${s}:${colName(14 + n - 1)}${s})` });
      sh.set(`M${s + 2}`, 'n'); sh.set(`N${s + 2}`, n);
      sh.set(`M${s + 3}`, 'A'); sh.set(`N${s + 3}`, { f: `(1+(1/N${s + 2}*N${s + 1}))^-0.5` });
      sh.set(`M${s + 4}`, 'F2'); sh.set(`N${s + 4}`, { f: `50*LOG(N${s + 3}*100)` });
      const who = `${runLabel({ ...b.run, variant: '' })}`, rf = runLabel({ ...p.ref, variant: '' });
      sh.set(`U${s}`, txt({
        very_rapid: `Profil disolusi ${who} similar terhadap produk pembanding ${rf}, both products rapidly dissolved (≥85% in 15 minutes).`,
        similar: `Profil disolusi ${who} similar terhadap produk pembanding ${rf} dengan nilai f2 = ${f2txt(cm.f2)} (≥ 50).`,
        not_similar: `Profil disolusi ${who} not similar terhadap produk pembanding ${rf} dengan nilai f2 = ${f2txt(cm.f2)} (< 50).`,
      }[cm.conclusion_code] || ''));
    });
    for (let k = blocks.length; k < BLOCKS; k++) sh.clearRange(1, 14 + 23 * k, 21, 14 + 23 * k + 22);
    const first = 14 + 23 * blocks.length, last = Math.max(first, ...sh.rows.keys());
    sh.hideRows(first, last);
    await pkg.pruneAnchors(p.tab, (row0) => row0 + 1 < first);
    const mine = notes.filter((x) => x.startsWith(`Summary ${p.g.label}:`));
    if (mine.length) sh.set('A11', 'Catatan: ' + mine.map((x) => x.replace(/^Summary [^:]*: /, '')).join(' | ').slice(0, 800));
  }
  await recalcPkg(pkg);
  const name = fileSafe(`SUMMARY UDT ${data.compile.product_name}`) + '.xlsx';
  return { name, buffer: await pkg.toBuffer(pages.map((p) => p.tab)), tabs: pages.length };
}

// ---------------------------------------------------------------- publik
// Tiga unduhan: 'calcreport' (zip: per medium satu Calculation + satu Report), 'summary' (satu xlsx). notes = hal yang tidak muat di template.
export async function buildCalcReportZip(data) {
  const notes = [], zip = new JSZip(); let count = 0;
  for (const g of groupsOf(data)) {
    for (const book of [await buildCalculationBook(data, g, notes), await buildReportBook(data, g, notes)]) if (book) { zip.file(book.name, book.buffer); count++; }
  }
  if (!count) return { buffer: null, notes, count };
  if (notes.length) zip.file('CATATAN.txt', 'Hal yang tidak muat di Master Template dan dilewati:\r\n\r\n' + notes.map((x) => '- ' + x).join('\r\n') + '\r\n');
  return { buffer: Buffer.from(await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })), notes, count };
}
export async function buildSummaryXlsx(data) {
  const notes = [], book = await buildSummaryBook(data, notes);
  return { buffer: book ? book.buffer : null, notes, name: book?.name, tabs: book?.tabs || 0 };
}
