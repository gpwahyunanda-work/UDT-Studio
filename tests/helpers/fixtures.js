import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCSV } from '../../server/import/sheetReader.js';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Fixture: data/sheets/csv di folder proyek (satu tingkat di atas repo/), atau env UDT_FIXTURE_DIR.
export const CSV_DIR = process.env.UDT_FIXTURE_DIR || join(REPO, '..', 'data', 'sheets', 'csv');
export const hasFixtures = existsSync(CSV_DIR);

const TABS = [['Release', 'Release'], ['pH_1_2', 'pH 1,2'], ['pH_4_5', 'pH 4,5'], ['pH_6_8', 'pH 6,8']];
const tabName = (f) => { const prefix = f.startsWith('UDT_') ? 'UDT ' : ''; const x = f.replace(/^UDT_/, ''); return prefix + x.replace(/^pH_/, 'pH ').replaceAll('_', ','); };
export function loadWorkbook(prefix, fileName, tabFiles = TABS, extra = {}) {
  if (!Array.isArray(tabFiles)) { extra = tabFiles; tabFiles = TABS; }
  const tabs = tabFiles.map((entry) => {
    const [f, name] = Array.isArray(entry) ? entry : [entry, tabName(entry)];
    return { name, values: parseCSV(readFileSync(join(CSV_DIR, `${prefix}__${f}__nilai.csv`), 'utf8')), formulas: parseCSV(readFileSync(join(CSV_DIR, `${prefix}__${f}__rumus.csv`), 'utf8')), comments: (extra.comments || {})[name] || {} };
  });
  return { fileName, tabs };
}
