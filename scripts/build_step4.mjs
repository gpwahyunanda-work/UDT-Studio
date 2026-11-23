// Membangun server/step4.js (modul ES untuk server; F6): salinan HARAFIAH fungsi Langkah 4 dari index.html (satu sumber kebenaran; tidak ada rumus ditulis ulang).
// Hash tiap fungsi dicocokkan dengan modules.lock oleh tests/01. Jalankan: npm run build:step4
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFunction, extractConst } from './modules_lock.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CONSTS = ['mean', 'sdev', 'fmt', 'fin'], FUNCS = ['toNum', 'formatVesselRanges', 'calcBatchProfile', 'evalSimilarityF2', 'classifyF2Outcome'];
export function step4Source(html) {
  return `// GENERATED oleh scripts/build_step4.mjs dari index.html (Langkah 4). JANGAN diedit; ubah sumbernya lewat kontrol perubahan.\n`
    + [...CONSTS.map((n) => extractConst(html, n)), ...FUNCS.map((n) => extractFunction(html, n))].join('\n') + '\n'
    + `export { ${[...CONSTS, ...FUNCS].join(', ')} };\n`;   // hanya baris ekspor; sumber fungsi tidak berubah
}
if (process.argv[1]?.endsWith('build_step4.mjs')) writeFileSync(join(root, 'server/step4.js'), step4Source(readFileSync(join(root, 'index.html'), 'utf8')));
