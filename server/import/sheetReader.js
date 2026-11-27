// Pembaca sheet UDT lama (baca saja; aturan R-01..R-22 di F1b v0.2). Masukan = grid nilai (+ grid rumus + komentar sel).
// Tidak ada rumus Langkah 4 di sini: hanya pemeriksaan hitung ulang sheet (f2 rumus sheet lama) untuk laporan pencocokan.

export const MEDIUM_CODES = ['Release', '1,2', '4,5', '6,8', 'Air', '1,0', '7,2', '7,5'];
export const F2_TOLERANCE = 1;

export function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows;
}

export const colLetter = (i) => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
const cell = (g, r, c) => String((g[r - 1] || [])[c] ?? '').trim();   // r 1-based, c 0-based
const isNum = (s) => s !== '' && Number.isFinite(Number(s));
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sdev = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };

export function mediumCodeFromTab(tabName) {
  const t = tabName.trim().replace(/^udt[\s_-]*/i, '').replace(/_/g, ' ');
  if (/^release$/i.test(t)) return 'Release';
  let m = /^ph\s*([0-9]+)[.,]([0-9]+)$/i.exec(t);
  if (m) { const code = `${m[1]},${m[2]}`; return MEDIUM_CODES.includes(code) ? code : null; }
  if (/^(air|water)$/i.test(t)) return 'Air';
  return null;
}

// F23: kekuatan boleh kombinasi ("20/10 mg", "20-10 mg" karena "/" tidak boleh ada di nama berkas, "20 mg/10 mg") dan dinormalkan memakai "/".
const NUM = String.raw`\d+(?:[.,]\d+)?`, UNIT = '(?:mg|mcg|µg|g|iu|%)';
const STRENGTH_RE = new RegExp(String.raw`(${NUM}(?:\s*${UNIT})?(?:\s*[/-]\s*${NUM}(?:\s*${UNIT})?)*\s*${UNIT}(?:\s*/\s*\d*\s*(?:ml|mg|g))?)`, 'i');
export function parseCompileFromFileName(fileName) {
  const base = fileName.replace(/\.[^.]+$/, '').replace(/^.*[\/]/, '');
  const m = /^development of\s+(.+)$/i.exec(base);
  if (!m) return null;
  const rest = m[1].trim();
  const s = STRENGTH_RE.exec(rest);
  if (!s) return null;
  const product_name = rest.slice(0, s.index).trim().replace(/\s+/g, ' '), dosage_form = rest.slice(s.index + s[0].length).trim().replace(/\s+/g, ' ');
  const strength = s[1].replace(/\s+/g, ' ').replace(/\s*-\s*(?=\d)/g, '/').replace(/\s*\/\s*(?=\d)/g, '/').trim();
  if (!product_name || !dosage_form) return null;
  return { product_name, strength, dosage_form, title: `Development of ${product_name} ${strength} ${dosage_form}` };
}

function parseBlockHeader(text) {
  // B3-5: varian boleh sesudah kurung penutup; produk tertulis disimpan persis di SumberBlok.
  const raw = text.trim(), m = /^(.*?)\(([^()]*)\)\s*(.*)$/s.exec(raw);
  if (!m) return null;
  const inner = m[2].trim().split(/\s+/).filter(Boolean), brand = m[1].replace(/\s+/g, ' ').trim();
  if (!brand || !inner.length) return null;
  return { brand_name: brand, batch_no: inner[0], variant: [...inner.slice(1), m[3].trim()].filter(Boolean).join(' '), product_printed: raw };
}

const parseDate = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };

// tab = { name, values: string[][], formulas?: string[][], comments?: {E83:'teks'} }
export function readTab(tab) {
  const g = tab.values, fg = tab.formulas || tab.values;
  const notes = [], blocks = [];
  const avgRows = [];
  for (let r = 1; r <= g.length; r++) if (cell(g, r, 2).toUpperCase() === 'AVG') avgRows.push(r);
  if (!avgRows.length) return { tab: tab.name, isUdt: false, notes: [{ kind: 'ignored', sheet_tab: tab.name, cell_range: null, message: `Tab "${tab.name}" tidak memuat penanda AVG: bukan tab UDT, diabaikan` }], blocks: [] };

  const code = mediumCodeFromTab(tab.name);
  const hdr = {};
  for (let r = 1; r <= 11; r++) {
    const lab = cell(g, r, 1).toLowerCase(), val = cell(g, r, 3);
    const v = val === '' || val.startsWith('[') ? null : val;
    if (lab.startsWith('method ref')) hdr.method_ref = v;
    else if (lab.startsWith('analytical')) hdr.method = v;
    else if (lab.startsWith('volume')) hdr.volume_text = v;
    else if (lab.startsWith('apparatus')) hdr.apparatus = v;
    else if (lab.startsWith('rotation')) hdr.rpm_text = v;
    else if (lab === 'api') hdr.api = v;
    else if (lab.startsWith('method ref')) hdr.method_ref = v;
    else if (lab === 'medium') hdr.full_name = v;
  }
  if (!code) {
    notes.push({ kind: 'hold', sheet_tab: tab.name, cell_range: null, message: `Kode medium dari nama tab "${tab.name}" tidak dikenali (diharapkan Release, pH x,y, Air): seluruh tab ditahan` });
    return { tab: tab.name, isUdt: true, held: true, notes, blocks: [] };
  }
  if (!hdr.full_name) hdr.full_name = tab.name;
  const medium = { code, full_name: hdr.full_name, volume_text: hdr.volume_text ?? null, apparatus: hdr.apparatus ?? null, rpm_text: hdr.rpm_text ?? null, method: hdr.method ?? null, method_ref: hdr.method_ref ?? null };

  const covered = new Set();
  for (const r of avgRows) {
    const rng = `C${r}:U${r + 22}`;
    const lab = (rr, c) => cell(g, rr, c).toLowerCase();
    const structOk = lab(r + 1, 2) === 'min' && lab(r + 2, 2) === 'max' && lab(r + 3, 2) === 'rsd' && lab(r + 4, 2).startsWith('result') && lab(r + 5, 2) === 'vessel' && lab(r + 19, 2) === 'average';
    for (let k = 0; k <= 22; k++) covered.add(r + k);
    if (!structOk) { notes.push({ kind: 'hold', sheet_tab: tab.name, cell_range: rng, message: `Blok AVG di baris ${r}: struktur 23 baris tidak sesuai (R-03), ditahan` }); continue; }
    const head = cell(g, r, 1);
    if (head.startsWith('[') || head === '') { notes.push({ kind: 'ignored', sheet_tab: tab.name, cell_range: rng, message: `Blok baris ${r}: placeholder atau tanpa nama produk (R-21), dilewati` }); continue; }
    const id = parseBlockHeader(head);
    if (!id) { notes.push({ kind: 'hold', sheet_tab: tab.name, cell_range: `B${r}`, message: `Blok baris ${r}: nama produk "${head}" tidak punya kurung batch (R-06), ditahan` }); continue; }

    // titik waktu (baris r+6) dari kolom E (indeks 4) sampai sel kosong
    const times = [];
    for (let c = 4; c < 12; c++) { const m = /^(\d+(?:[.,]\d+)?)\s*['′’]?$/.exec(cell(g, r + 6, c)); if (!m) break; times.push({ col: c, minute: Number(m[1].replace(',', '.')) }); }
    if (!times.length) { notes.push({ kind: 'hold', sheet_tab: tab.name, cell_range: `E${r + 6}`, message: `Blok baris ${r}: label menit tidak terbaca, ditahan` }); continue; }

    const vessels = [];
    for (let k = 0; k < 12; k++) {
      const rr = r + 7 + k, noRaw = cell(g, rr, 2);
      const no = isNum(noRaw) ? Number(noRaw) : k + 1;
      const vals = times.map(t => { const s = cell(g, rr, t.col); if (s === '') return null; if (!isNum(s)) { notes.push({ kind: 'info', sheet_tab: tab.name, cell_range: `${colLetter(t.col)}${rr}`, message: `Sel bukan angka "${s}" tidak disimpan (kosong bukan 0)` }); return null; } return Number(s); });
      if (vals.some(v => v !== null)) vessels.push({ no, values: vals });
    }
    if (!vessels.length) { notes.push({ kind: 'ignored', sheet_tab: tab.name, cell_range: rng, message: `Blok baris ${r}: tanpa nilai vessel, dilewati` }); continue; }

    // F23: sheet dengan kolom tambahan (mis. header 90' di kolom L pada Microlax) menggeser kolom peran dan area f2 satu kolom ke kanan; ditemukan dari label 'Total' pada baris r+1, bukan ditebak.
    let off = 0; for (const o of [0, 1, 2]) if (cell(g, r + 1, 12 + o).toLowerCase() === 'total') { off = o; break; }
    const role_raw = cell(g, r, 11) || (/reference/i.test(cell(g, r, 12)) ? cell(g, r, 12) : ''), role = role_raw.toLowerCase().includes('reference') ? 'reference' : 'uji';
    const topStatsMissing = times.some(t => cell(g, r, t.col) === '');
    const blk = { tab: tab.name, avg_row: r, date: parseDate(cell(g, r, 0)), brand_name: id.brand_name, batch_no: id.batch_no, variant: id.variant, product_printed: id.product_printed, manufacturer_site: (cell(g, r + 1, 1).split(/\r?\n/)[0] || '').trim() || null, note_text: cell(g, r + 1, 1).split(/\r?\n/).slice(1).join(' ').trim() || null, role, role_raw, times, vessels, import_outcome: topStatsMissing ? 'ditahan' : 'diimpor', hold_reason: topStatsMissing ? 'W-19: statistik atas kosong; nilai cetak diarsipkan, blok ditahan tanpa mengubah status Run' : null };
    if (!blk.date) notes.push({ kind: 'info', sheet_tab: tab.name, cell_range: `A${r}`, message: `Blok baris ${r}: tanggal kosong atau bukan tanggal` });
    if (blk.import_outcome === 'ditahan') notes.push({ kind: 'hold', sheet_tab: tab.name, cell_range: `E${r}:K${r + 3}`, message: blk.hold_reason });

    // statistik tercetak vs hitung ulang (rumus sheet lama bisa melewatkan vessel; data vessel tetap lengkap)
    const statCells = [['Average', r + 19], ['Min', r + 20], ['Max', r + 21], ['RSD', r + 22]];
    for (const t of times.entries()) {
      const [i, tp] = t; const arr = vessels.map(v => v.values[i]).filter(v => v !== null);
      const calc = { Average: mean(arr), Min: Math.min(...arr), Max: Math.max(...arr), RSD: arr.length > 1 && mean(arr) !== 0 ? sdev(arr) / mean(arr) * 100 : null };
      for (const [nm, rr] of statCells) {
        const s = cell(g, rr, tp.col); if (!isNum(s) || calc[nm] === null) continue;
        if (Math.abs(Number(s) - calc[nm]) > 1e-6 * Math.max(1, Math.abs(calc[nm]))) {
          notes.push({ kind: 'stat_mismatch', sheet_tab: tab.name, cell_range: `${colLetter(tp.col)}${rr}`, message: `Rumus sheet lama: ${nm} menit ${tp.minute} tercetak ${Number(s)} vs hitung ulang dari vessel terisi ${calc[nm]} (blok baris ${r}, ${id.batch_no})` });
        }
      }
    }
    blk.means = times.map((_, i) => { const a = vessels.map(v => v.values[i]).filter(v => v !== null); return a.length ? mean(a) : null; });

    // area f2 (kolom M..U): hanya blok uji
    if (role === 'uji') {
      const lbl = (rr) => cell(g, rr, 12 + off).toLowerCase();
      const okLbl = lbl(r + 1) === 'total' && lbl(r + 2) === 'n' && lbl(r + 3) === 'a' && lbl(r + 4) === 'f2';
      let refRow = null;
      for (let c = 13 + off; c < 20 + off && refRow === null; c++) {
        const fm = String((fg[r - 1] || [])[c] ?? '');
        if (!fm.startsWith('=')) continue;
        for (const m of fm.matchAll(/\$?[A-Z]{1,2}\$?(\d+)/g)) { if (Number(m[1]) !== r) { refRow = Number(m[1]); break; } }
      }
      const num = (rr) => (isNum(cell(g, rr, 13 + off)) ? Number(cell(g, rr, 13 + off)) : null);
      const points = [];
      for (const [i, tp] of times.entries()) { const c = 13 + off + i; if (c > 19 + off) break; const s = cell(g, r, c); if (isNum(s)) points.push({ seq: i + 1, sq_diff: Number(s) }); }
      if (!okLbl || refRow === null || num(r + 1) === null || num(r + 2) === null || num(r + 4) === null) {
        notes.push({ kind: 'hold', sheet_tab: tab.name, cell_range: `${colLetter(12 + off)}${r}:${colLetter(20 + off)}${r + 4}`, message: `Blok baris ${r} (${id.batch_no}): area f2 atau rujukan pembanding tidak terbaca; run diimpor, perbandingan ditahan (R-11)` });
      } else {
        blk.ref_avg_row = refRow;
        blk.f2area = { total_sq: num(r + 1), n_points: num(r + 2), f2: num(r + 4), conclusion_printed: cell(g, r, 20 + off) || null, conclusion_is_printed: cell(g, r, 20 + off) !== '', points, cells: { total: `${colLetter(13 + off)}${r + 1}`, n: `${colLetter(13 + off)}${r + 2}`, f2: `${colLetter(13 + off)}${r + 4}` } };
      }
    }
    blocks.push(blk);
  }

  // pecahan tanpa penanda AVG (baris "Vessel" yang tidak masuk blok mana pun) -> tahan, jangan ditebak (R-21, W-14)
  for (let r = 1; r <= g.length; r++) {
    if (cell(g, r, 2).toLowerCase() === 'vessel' && !covered.has(r) && !(r - 5 > 0 && covered.has(r - 5) && cell(g, r - 5, 2).toUpperCase() === 'AVG')) {
      let end = r; for (let k = r; k <= Math.min(g.length, r + 30); k++) { end = k; if (cell(g, k, 2).toLowerCase() === 'rsd') break; }
      let lastCol = 4; for (let k = r; k <= end; k++) for (let c = 4; c < 12; c++) if (cell(g, k, c) !== '') lastCol = Math.max(lastCol, c);
      const filled = []; for (let k = r + 2; k <= end; k++) if (isNum(cell(g, k, 2)) && Array.from({ length: 7 }, (_, i) => cell(g, k, 4 + i)).some(isNum)) filled.push(cell(g, k, 2));
      notes.push({ kind: 'hold', sheet_tab: tab.name, cell_range: `C${r}:${colLetter(lastCol)}${end}`, message: `Blok tanpa penanda AVG, tanpa tanggal/nama/peran (${filled.length} vessel berisi): ditahan, identitas tidak ditebak` });
    }
  }

  // komentar sel (catatan) pada rentang baris tab
  for (const [ref, text] of Object.entries(tab.comments || {})) notes.push({ kind: 'cell_comment', sheet_tab: tab.name, cell_range: ref, message: text });
  return { tab: tab.name, isUdt: true, medium, api: hdr.api ?? null, blocks, notes };
}

// f2 rumus sheet lama untuk PEMERIKSAAN (bukan rumus Langkah 4): A=(1+Total/n)^-0.5; F2=50*log10(A*100)
const sheetF2 = (total, n) => 50 * Math.log10(100 * Math.pow(1 + total / n, -0.5));

// workbook = { fileName, tabs:[tab] } -> paket impor (satu bentuk dengan paket Studio)
export function readWorkbook({ fileName, tabs }) {
  const compileGuess = parseCompileFromFileName(fileName);
  const notes = [], mediums = [], runs = [], comparisons = [], checks = [];
  const apis = new Set();
  for (const tab of tabs) {
    const t = readTab(tab);
    notes.push(...t.notes);
    if (!t.isUdt || t.held) continue;
    mediums.push(t.medium); if (t.api) apis.add(t.api);
    const keyOf = (b) => `${t.medium.code}|${b.brand_name}|${b.batch_no}|${b.variant}`;
    const byRow = new Map(); let lastAvgRow = null;
    for (const b of t.blocks) {
      // B3-4: lompatan 26 mengandung header bagian di dua baris sebelum blok berikutnya.
      b.section_header_row = lastAvgRow !== null && b.avg_row - lastAvgRow > 23 ? b.avg_row - 2 : null;
      lastAvgRow = b.avg_row;
      // blok identik (identitas + nilai sama) = satu run; tanggal terawal, semua blok jadi SumberBlok (R-14, Q-12)
      const sig = JSON.stringify([keyOf(b), b.times.map(x => x.minute), b.vessels.map(v => [v.no, v.values])]);
      let run = runs.find(x => x._sig === sig && x._tab === t.tab);
      if (!run) {
        run = { key: `${t.tab}#${b.avg_row}`, _sig: sig, _tab: t.tab, data_hash: sig, medium_code: t.medium.code, brand_name: b.brand_name, batch_no: b.batch_no, role: b.role, variant: b.variant, test_date: b.date, manufacturer_site: b.manufacturer_site, note: /wavelength/i.test(b.note_text || '') ? null : (b.note_text || null), is_valid: !/wavelength/i.test(b.note_text || ''), invalid_reason: /wavelength/i.test(b.note_text || '') ? b.note_text : null, timepoints: b.times.map(x => x.minute), values: b.vessels, sourceBlocks: [], means: b.means };
        runs.push(run);
      } else if (b.date && (!run.test_date || b.date < run.test_date)) run.test_date = b.date;
      run.sourceBlocks.push({ tab: t.tab, avg_row: b.avg_row, block_date: b.date, ref_avg_row: b.ref_avg_row ?? null, product_printed: b.product_printed, role_raw: b.role_raw, section_header_row: b.section_header_row, import_outcome: b.import_outcome, hold_reason: b.hold_reason });
      byRow.set(b.avg_row, run);
      b._run = run;
    }
    for (const b of t.blocks) {
      if (!b.f2area) continue;
      const ref = byRow.get(b.ref_avg_row);
      if (!ref || !t.blocks.find(x => x.avg_row === b.ref_avg_row)?.role_raw.toLowerCase().includes('reference')) { notes.push({ kind: 'hold', sheet_tab: t.tab, cell_range: `M${b.avg_row}:U${b.avg_row + 4}`, message: `Blok baris ${b.avg_row}: baris pembanding ${b.ref_avg_row} bukan blok Reference Product yang terbaca; perbandingan ditahan` }); continue; }
      const test = b._run, a = b.f2area;
      comparisons.push({ testKey: test.key, refKey: ref.key, medium_code: t.medium.code, source_avg_row: b.avg_row, total_sq: a.total_sq, n_points: a.n_points, f2: a.f2, conclusion_printed: a.conclusion_printed, conclusion_is_printed: a.conclusion_is_printed, conclusion_code: null, f2_source: 'sheet', points: a.points });
      // pemeriksaan: hitung ulang dari rerata vessel (n kolom pertama) dan dari Total/n tercetak
      const n = a.n_points; let tot = 0, usable = true;
      for (let i = 0; i < n; i++) { const x = ref.means[i], y = test.means[i]; if (x == null || y == null) { usable = false; break; } tot += (x - y) ** 2; }
      const fromTotal = sheetF2(a.total_sq, n);
      if (usable) {
        const raw = sheetF2(tot, n);
        checks.push({ testKey: test.key, refKey: ref.key, f2_recomputed: raw, f2_printed: a.f2, f2_from_total: fromTotal, ok: Math.abs(raw - a.f2) <= F2_TOLERANCE });
        if (Math.abs(raw - a.f2) > F2_TOLERANCE) notes.push({ kind: 'sheet_diff', sheet_tab: t.tab, cell_range: `${a.cells.total}:${a.cells.f2}`, message: `Selisih sheet: f2 tercetak ${a.f2.toFixed(2)} (n=${n}, Total ${a.total_sq.toFixed(2)}) vs hitung ulang dari rerata vessel ${raw.toFixed(2)}; tersimpan nilai tercetak (resmi), selisih dilaporkan, tidak disamakan` });
      } else notes.push({ kind: 'info', sheet_tab: t.tab, cell_range: a.cells.f2, message: `Hitung ulang f2 blok baris ${b.avg_row} tidak bisa dilakukan (titik rerata tidak lengkap)` });
      // n tercetak disimpan apa adanya; selisih terhadap n cut-off Langkah 4 dihitung di tampilan (modul asli), bukan di sini
    }
  }
  const compile = compileGuess ? { ...compileGuess, api: [...apis][0] ?? null } : null;
  // B3-8: hanya D10 yang memang menyebut produk pembanding dipakai sebagai pembanding D5.
  for (const tab of tabs) { const t = readTab(tab); const hit = t.medium?.method_ref?.match(/tablet\s+([^"(]+?)(?:"?\s*\(|$)/i); if (t.api && hit && !hit[1].toLowerCase().includes(t.api.toLowerCase())) notes.push({ kind: 'api_mismatch', sheet_tab: t.tab, cell_range: 'D5:D10', message: `API D5 "${t.api}" berbeda dengan teks D10 "${hit[1].trim()}"; disimpan apa adanya, tidak ditimpa` }); }
  if (apis.size > 1) notes.push({ kind: 'info', sheet_tab: null, cell_range: null, message: `API berbeda antar tab: ${[...apis].join(' | ')} (DS S-2 menunggu keputusan)` });
  if (!compile) notes.push({ kind: 'hold', sheet_tab: null, cell_range: null, message: `Nama berkas "${fileName}" tidak berpola "Development of <produk> <kekuatan> <bentuk>": compile harus diisi analis (Q-13)` });
  for (const r of runs) { delete r._sig; delete r._tab; }
  return { source_name: fileName, compile, api: [...apis][0] ?? null, mediums, runs, comparisons, checks, notes };
}
