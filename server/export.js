// Ekspor SATU ARAH (REQ-038): data tersimpan -> CSV/TSV/Excel. Tidak ada baca-balik dari Google Sheets.
// Tata letak Excel mengikuti sheet lama "Development of ...": tab per medium, blok 23 baris mulai baris 14, rumus hidup + nilai cache.
// Nilai cache f2/Total/n/(Rt-Tt)^2 diambil dari perbandingan TERSIMPAN (hasil Langkah 4); modul ini tidak menghitung ulang f2.
import ExcelJS from 'exceljs';

const col = (n) => { let s = ''; for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s; return s; };   // 1 -> A
const nums = (a) => a.filter((x) => typeof x === 'number' && Number.isFinite(x));
const avg = (a) => { const v = nums(a); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const sd = (a) => { const v = nums(a); if (v.length < 2) return null; const m = avg(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)); };
const FIRST = 14, BLOCK = 23, E = 5, N = 14;

// Teks yang dimulai = + - @ ditandai agar Excel tidak menjalankannya sebagai rumus (injeksi rumus).
export const safeText = (v) => { const s = v == null ? '' : String(v); return /^[=+\-@\t\r]/.test(s) ? "'" + s : s; };
const esc = (v, sep) => { const s = safeText(v); return s.includes(sep) || /["\r\n]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s; };

export function buildDelimited(data, sep = ',') {
  const head = ['compile', 'medium', 'produk', 'batch', 'varian', 'peran', 'tanggal_uji', 'status', 'alasan_tidak_valid', 'catatan', 'vessel', 'menit', 'persen_terlepas'];
  const med = new Map(data.mediums.map((m) => [m.medium_id, m]));
  const lines = [head.join(sep)];
  for (const r of data.runs) {
    const m = med.get(r.medium_id);
    for (const [vn, vals] of Object.entries(r.vessels)) r.minutes.forEach((t, i) => {
      if (vals[i] === null || vals[i] === undefined) return;   // sel kosong bukan 0
      lines.push([data.compile.title, m.label, r.brand_name, r.batch_no, r.variant, r.role === 'uji' ? 'Uji' : 'Pembanding', r.test_date, r.is_valid ? 'Valid' : 'Tidak valid', r.invalid_reason, r.note, vn, t, vals[i]].map((x, k) => (k >= 10 ? (x ?? '') : esc(x, sep))).join(sep));
    });
  }
  return lines.join('\r\n') + '\r\n';
}

function planMedium(data, medium) {
  const runs = data.runs.filter((r) => r.medium_id === medium.medium_id);
  const byId = new Map(runs.map((r) => [r.run_id, r]));
  const cmps = data.comparisons.filter((c) => c.medium_id === medium.medium_id && byId.has(c.test_run_id) && byId.has(c.ref_run_id));
  const order = (a, b) => (a.test_date || '9').localeCompare(b.test_date || '9') || a.run_id - b.run_id;
  const refIds = new Set(cmps.map((c) => c.ref_run_id));
  const blocks = [];
  for (const r of runs.filter((x) => refIds.has(x.run_id) || x.role === 'reference').sort(order)) blocks.push({ run: r, ref: true });
  for (const r of runs.slice().sort(order)) {
    const mine = cmps.filter((c) => c.test_run_id === r.run_id);
    if (mine.length) mine.forEach((c) => blocks.push({ run: r, cmp: c }));
    else if (!refIds.has(r.run_id) && r.role !== 'reference') blocks.push({ run: r });
  }
  let row = FIRST;
  for (const b of blocks) { b.row = row; b.vessels = Math.max(12, ...Object.keys(b.run.vessels).map(Number)); b.height = BLOCK + (b.vessels - 12); row += b.height; }
  return { blocks, refRow: new Map(blocks.filter((b) => b.ref).map((b) => [b.run.run_id, b.row])) };
}

export async function buildXlsx(data) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'UDT Studio'; wb.title = data.compile.title;
  for (const medium of data.mediums) {
    const ws = wb.addWorksheet(medium.label.slice(0, 31));
    const { blocks, refRow } = planMedium(data, medium);
    ws.getCell('A2').value = `${data.compile.product_name} ${data.compile.strength} ${data.compile.dosage_form}`.toUpperCase();
    ws.getCell('A2').font = { bold: true, size: 14 };
    [['Medium', medium.full_name], ['API', data.compile.api], ['Volume', medium.volume_text], ['Apparatus', medium.apparatus], ['Rotation speed', medium.rpm_text], ['Analytical method', medium.method], ['Method reference', medium.method_ref]]
      .forEach(([k, v], i) => { ws.getCell(`B${4 + i}`).value = k; ws.getCell(`D${4 + i}`).value = v == null ? null : safeText(v); });
    ws.getColumn(1).width = 13; ws.getColumn(2).width = 44; ws.getColumn(3).width = 18;
    for (const b of blocks) {
      const r = b.row, run = b.run, T = run.minutes.length, vn = b.vessels;
      const cell = (ref, v) => { ws.getCell(ref).value = v; return ws.getCell(ref); };
      if (run.test_date) { const d = cell(`A${r}`, new Date(run.test_date + 'T00:00:00Z')); d.numFmt = 'dd mmm yyyy'; }
      cell(`B${r}`, safeText(`${run.brand_name} (${run.batch_no}${run.variant ? ' ' + run.variant : ''})`));
      const noteLine = [run.is_valid ? '' : `TIDAK VALID: ${run.invalid_reason}`, run.note || ''].filter(Boolean).join('\n');
      cell(`B${r + 1}`, safeText([run.manufacturer_site || '', noteLine].filter(Boolean).join('\n')));
      ws.getCell(`B${r + 1}`).alignment = { wrapText: true, vertical: 'top' };
      if (b.ref) cell(`L${r}`, 'Reference Product');
      ['AVG', 'Min', 'Max', 'RSD'].forEach((t, i) => cell(`C${r + i}`, t));
      for (let k = 1; k <= vn; k++) cell(`C${r + 6 + k}`, k);
      cell(`C${r + 4}`, 'Result of Analysis'); cell(`C${r + 5}`, 'Vessel / Minutes');
      ['Average', 'Min', 'Max', 'RSD'].forEach((t, i) => cell(`C${r + vn + 7 + i}`, t));
      const v0 = r + 7, vL = r + 6 + vn, sA = vL + 1;   // baris vessel pertama/terakhir, baris Average
      run.minutes.forEach((t, j) => {
        const c = col(E + j), colVals = [];
        cell(`${c}${r + 6}`, `${t}'`);
        for (let k = 1; k <= vn; k++) { const x = run.vessels[k]?.[j]; colVals.push(x ?? null); if (x !== undefined && x !== null) cell(`${c}${v0 + k - 1}`, x); }
        const a = avg(colVals), s = sd(colVals), mn = nums(colVals).length ? Math.min(...nums(colVals)) : null, mx = nums(colVals).length ? Math.max(...nums(colVals)) : null;
        const rng = `${c}${v0}:${c}${vL}`;
        cell(`${c}${sA}`, { formula: `IF(COUNT(${rng})=0,"",AVERAGE(${rng}))`, result: a ?? '' });
        cell(`${c}${sA + 1}`, { formula: `IF(COUNT(${rng})=0,"",MIN(${rng}))`, result: mn ?? '' });
        cell(`${c}${sA + 2}`, { formula: `IF(COUNT(${rng})=0,"",MAX(${rng}))`, result: mx ?? '' });
        cell(`${c}${sA + 3}`, { formula: `IF(COUNT(${rng})<2,"",STDEV(${rng})/AVERAGE(${rng})*100)`, result: s !== null && a ? (s / a) * 100 : '' });
        [[0, a], [1, mn], [2, mx], [3, s !== null && a ? (s / a) * 100 : null]].forEach(([i, res]) => cell(`${c}${r + i}`, { formula: `${c}${sA + i}`, result: res ?? '' }));
        ws.getCell(`${c}${r}`).numFmt = '0.0';
      });
      if (b.cmp) {
        const cm = b.cmp, rr = refRow.get(cm.ref_run_id), n = cm.n_points, pts = new Map((cm.points || []).map((p) => [p.seq, p.sq]));
        for (let i = 0; i < n; i++) {
          const c = col(E + i), t = col(N + i), sq = pts.get(i + 1);
          cell(`${t}${r}`, { formula: `($${c}$${rr}-${c}${r})^2`, ...(sq !== undefined ? { result: sq } : {}) });
        }
        const last = col(N + Math.max(n, 1) - 1);
        const A = cm.total_sq !== null && cm.total_sq !== undefined ? (1 + cm.total_sq / n) ** -0.5 : undefined;   // cache A dari Total tersimpan
        cell(`${col(N)}${r + 1}`, { formula: `SUM(${col(N)}${r}:${last}${r})`, ...(cm.total_sq != null ? { result: cm.total_sq } : {}) });
        cell(`${col(N)}${r + 2}`, n);
        cell(`${col(N)}${r + 3}`, { formula: `(1+${col(N)}${r + 1}/${col(N)}${r + 2})^-0.5`, ...(A !== undefined ? { result: A } : {}) });
        cell(`${col(N)}${r + 4}`, { formula: `50*LOG10(${col(N)}${r + 3}*100)`, ...(cm.f2 != null ? { result: cm.f2 } : {}) });
        cell(`${col(Math.max(21, N + n + 1))}${r}`, cm.conclusion_printed || { similar: 'Similar', not_similar: 'Not Similar', very_rapid: 'Similar, both products rapidly dissolved (>=85% in 15 minutes). F2 calculation for information only' }[cm.conclusion_code] || '');
      }
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
