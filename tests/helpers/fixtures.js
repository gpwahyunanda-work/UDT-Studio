import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCSV } from '../../server/import/sheetReader.js';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Fixture: data/sheets/csv di folder proyek (satu tingkat di atas repo/), atau env UDT_FIXTURE_DIR.
export const CSV_DIR = process.env.UDT_FIXTURE_DIR || join(REPO, '..', 'data', 'sheets', 'csv');
export const hasFixtures = existsSync(CSV_DIR);

const TABS = [['Release', 'Release'], ['pH_1_2', 'pH 1,2'], ['pH_4_5', 'pH 4,5'], ['pH_6_8', 'pH 6,8']];
export function loadWorkbook(prefix, fileName, extra = {}) {
  const tabs = TABS.map(([f, name]) => ({
    name,
    values: parseCSV(readFileSync(join(CSV_DIR, `${prefix}__${f}__nilai.csv`), 'utf8')),
    formulas: parseCSV(readFileSync(join(CSV_DIR, `${prefix}__${f}__rumus.csv`), 'utf8')),
    comments: (extra.comments || {})[name] || {},
  }));
  return { fileName, tabs };
}
