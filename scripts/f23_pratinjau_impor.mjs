// F23: pratinjau impor sheet TANPA database dan TANPA server (jalur yang sama dengan POST /api/imports/xlsx?dry=1: readXlsxTabs -> readWorkbook -> validatePackage).
// Pakai:  node scripts/f23_pratinjau_impor.mjs <folder xlsx> [keluaran.json]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readXlsxTabs } from '../server/import/xlsxReader.js';
import { readWorkbook } from '../server/import/sheetReader.js';
import { validatePackage, qualityWarnings, resolveImportCompile } from '../server/ingest.js';

const dir = process.argv[2], out = process.argv[3];
if (!dir) { console.error('pakai: node scripts/f23_pratinjau_impor.mjs <folder> [keluaran.json]'); process.exit(2); }
const rows = [];
for (const name of readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.xlsx')).sort()) {
  const r = { berkas: name };
  try {
    const raw = readWorkbook({ fileName: name, tabs: await readXlsxTabs(readFileSync(join(dir, name))) });
    r.compile = raw.compile ? `${raw.compile.product_name} | ${raw.compile.strength} | ${raw.compile.dosage_form}` : null;
    r.run = raw.runs.length; r.perbandingan = raw.comparisons.length; r.run_reference = raw.runs.filter((x) => x.role === 'reference').length;
    const held = (x) => (x.sourceBlocks || []).length > 0 && x.sourceBlocks.every((b) => b.import_outcome === 'ditahan');
    r.run_ditahan = raw.runs.filter(held).length;
    r.alasan_tahan = [...new Set(raw.runs.flatMap((x) => (x.sourceBlocks || []).filter((b) => b.import_outcome === 'ditahan').map((b) => b.hold_reason)))];
    r.catatan = {}; for (const n of raw.notes) r.catatan[n.kind] = (r.catatan[n.kind] || 0) + 1;
    r.catatan_hold = raw.notes.filter((n) => n.kind === 'hold').map((n) => `${n.sheet_tab || '-'}!${n.cell_range || ''}: ${n.message}`);
    r.stat_mismatch = raw.notes.filter((n) => n.kind === 'stat_mismatch').map((n) => `${n.sheet_tab}!${n.cell_range}: ${n.message}`);
    try { resolveImportCompile(raw, new Headers(), name); const pkg = validatePackage(raw, { kind: 'sheet' }); r.peringatan = qualityWarnings(pkg).map((w) => w.message || JSON.stringify(w)); r.diterima = true; }
    catch (e) { r.diterima = false; r.galat = e.message + (e.extra?.details ? ': ' + e.extra.details.join('; ') : ''); r.galat_pesan = e.message; r.galat_rinci = e.extra?.details || null; }
  } catch (e) { r.galat_baca = String(e.message || e); }
  rows.push(r);
}
if (out) writeFileSync(out, JSON.stringify(rows, null, 1));
for (const r of rows) console.log(`${r.berkas}\n  compile=${r.compile} run=${r.run} reference=${r.run_reference} perbandingan=${r.perbandingan} ditahan=${r.run_ditahan} diterima=${r.diterima} peringatan=${(r.peringatan || []).length} catatan=${JSON.stringify(r.catatan)}${r.galat ? '\n  GALAT: ' + r.galat : ''}${r.galat_baca ? '\n  GALAT_BACA: ' + r.galat_baca : ''}`);
