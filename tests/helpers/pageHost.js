// "Halaman" uji untuk udtBridge: memuat sumber ASLI fungsi Langkah 4 dari index.html ke konteks vm (tanpa DOM).
// Tidak ada salinan rumus; sumber diambil dengan pengekstrak yang sama dengan modules.lock.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './fixtures.js';
import { extractFunction, extractConst } from '../../scripts/modules_lock.mjs';

export function loadPageHost(file = 'index.html') {
  const html = readFileSync(join(REPO, file), 'utf8');
  const parts = [
    ...['mean', 'sdev', 'fmt', 'fin'].map((n) => extractConst(html, n)),
    ...['toNum', 'formatVesselRanges', 'calcBatchProfile', 'evalSimilarityF2', 'classifyF2Outcome'].map((n) => extractFunction(html, n)),
  ];
  const ctx = vm.createContext({});
  vm.runInContext(parts.join('\n'), ctx);
  return ctx;
}
