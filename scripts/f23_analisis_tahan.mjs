// F23: analisis penyebab penahanan impor per sheet (baca saja). Keluaran: JSON + tabel markdown ke stdout.
// Pakai: node scripts/f23_analisis_tahan.mjs <folder xlsx> [keluaran.json]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readXlsxTabs } from '../server/import/xlsxReader.js';
import { readWorkbook, readTab } from '../server/import/sheetReader.js';

const dir = process.argv[2], out = process.argv[3];
const num = (s) => s !== '' && Number.isFinite(Number(s));
const res = [];
for (const name of readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.xlsx')).sort()) {
  const tabs = await readXlsxTabs(readFileSync(join(dir, name)));
  const raw = readWorkbook({ fileName: name, tabs });
  const r = { berkas: name, tab: tabs.map((t) => t.name), run: raw.runs.length, w19: 0, w19_semua_nol: 0, w19_lain: 0, r11: 0, r11_nilai_tanpa_rumus: 0, r11_lain: 0, sum_lewat_sel: 0, sum_total: 0, stat_mismatch: 0, tab_tahan_nama: 0, contoh: {} };
  for (const t of tabs) {
    const rt = readTab(t);
    if (rt.held) { r.tab_tahan_nama += 1; continue; }
    for (const b of rt.blocks || []) {
      const g = t.values, fg = t.formulas;
      const cell = (rr, c) => String((g[rr - 1] || [])[c] ?? '').trim();
      if (b.import_outcome === 'ditahan') {
        r.w19 += 1;
        // kolom statistik atas kosong: apakah semua vessel bernilai 0 persis pada kolom itu?
        const miss = b.times.filter((tp) => cell(b.avg_row, tp.col) === '' || !num(cell(b.avg_row, tp.col)));
        const allZero = miss.every((tp) => b.vessels.every((v) => v.values[b.times.indexOf(tp)] === 0 || v.values[b.times.indexOf(tp)] === null));
        if (allZero) r.w19_semua_nol += 1; else { r.w19_lain += 1; r.contoh.w19_lain ??= `${t.name} baris ${b.avg_row} kolom ${miss.map((x) => x.minute).join(',')}`; }
      }
      if (b.role === 'uji' && !b.f2area) {
        r.r11 += 1;
        const hasFormula = [13, 14, 15, 16, 17, 18, 19].some((c) => String((fg[b.avg_row - 1] || [])[c] ?? '').startsWith('='));
        if (!hasFormula && num(cell(b.avg_row, 13))) r.r11_nilai_tanpa_rumus += 1; else { r.r11_lain += 1; r.contoh.r11_lain ??= `${t.name} baris ${b.avg_row}`; }
      }
      if (b.f2area || b.role === 'uji') {
        const f = String((fg[b.avg_row] || [])[13] ?? '');
        const m = /SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)/.exec(f);
        if (m) { r.sum_total += 1; if (m[1] !== 'N') { r.sum_lewat_sel += 1; r.contoh.sum ??= `${t.name}!N${b.avg_row + 1} ${f}`; } }
      }
    }
  }
  // rumus statistik bawah (Average/Min/Max/RSD) yang rentangnya tidak mencakup SEMUA baris vessel blok (melewatkan sel)
  r.rumus_lewat = 0; r.rumus_total = 0; r.rumus_kolom = {};
  for (const t of tabs) {
    const rt = readTab(t); if (rt.held) continue;
    for (const b of rt.blocks || []) {
      const first = b.avg_row + 7, last = b.avg_row + 6 + Math.max(...b.vessels.map((v) => v.no));   // baris vessel TERISI terakhir
      for (let rr = b.avg_row + 19; rr <= b.avg_row + 22; rr++) for (const tp of b.times) {
        const f = String(((t.formulas[rr - 1]) || [])[tp.col] ?? ''); const m = /\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)/.exec(f); if (!m) continue;
        r.rumus_total += 1;
        if (Number(m[2]) > first || Number(m[4]) < last) { r.rumus_lewat += 1; const k = `${tp.minute}'`; r.rumus_kolom[k] = (r.rumus_kolom[k] || 0) + 1; r.contoh.rumus ??= `${t.name}!${m[0] ? String.fromCharCode(65 + tp.col) : ''}${rr} ${f} (seharusnya ${first}:${last})`; }
      }
    }
  }
  r.stat_mismatch = raw.notes.filter((n) => n.kind === 'stat_mismatch').length;
  r.contoh.stat = raw.notes.find((n) => n.kind === 'stat_mismatch')?.message?.slice(0, 160) ?? null;
  r.sheet_diff = raw.notes.filter((n) => n.kind === 'sheet_diff').length;
  r.api_mismatch = raw.notes.filter((n) => n.kind === 'api_mismatch').map((n) => n.message.slice(0, 120));
  res.push(r);
}
if (out) writeFileSync(out, JSON.stringify(res, null, 1));
for (const r of res) console.log(`${r.berkas.replace(/^Development of /, '').replace('.xlsx', '')}: run=${r.run} W19=${r.w19} (semua-nol=${r.w19_semua_nol}, lain=${r.w19_lain}) R11=${r.r11} (nilai tanpa rumus=${r.r11_nilai_tanpa_rumus}, lain=${r.r11_lain}) SUM-lewat-sel=${r.sum_lewat_sel}/${r.sum_total} stat_mismatch=${r.stat_mismatch} sheet_diff=${r.sheet_diff} rumus_lewat=${r.rumus_lewat}/${r.rumus_total} kolom=${JSON.stringify(r.rumus_kolom)} tab_tahan_nama=${r.tab_tahan_nama}`);
