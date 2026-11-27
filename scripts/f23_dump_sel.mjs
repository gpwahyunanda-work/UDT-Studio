// F23: cetak sel xlsx (diagnosis): node scripts/f23_dump_sel.mjs <berkas> [tab baris1 baris2 kol1 kol2 [rumus]]  (kolom indeks 0 = A)
import { readFileSync } from 'node:fs';
import { readXlsxTabs } from '../server/import/xlsxReader.js';
const [f, tabName, r1, r2, c1, c2, wantF] = process.argv.slice(2);
const tabs = await readXlsxTabs(readFileSync(f));
if (!tabName) { for (const t of tabs) console.log(JSON.stringify(t.name), t.values.length, 'baris'); process.exit(0); }
const t = tabs.find((x) => x.name === tabName);
for (let r = +r1; r <= +r2; r++) { const row = ((wantF ? t.formulas : t.values)[r - 1] || []); const cells = []; for (let c = +c1; c <= +c2; c++) if (row[c] !== undefined && row[c] !== '') cells.push(`${String.fromCharCode(65 + c)}${r}=${String(row[c]).slice(0, 38)}`); console.log(cells.join(' | ')); }
