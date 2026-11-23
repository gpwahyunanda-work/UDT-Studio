// modules.lock: sha256 sumber fungsi Langkah 4 (+ helper) dan bagian halaman Langkah 1-5 (DS-08, IQ-01..IQ-03).
// Berubah = ada yang menyentuh Langkah 1-5 atau rumus: perlu kontrol perubahan, bukan sekadar memperbarui kunci.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const sha = (s) => createHash('sha256').update(s.replace(/\r\n/g, '\n')).digest('hex');
export const FUNCTIONS = ['calcBatchWithStdMapping', 'calcBatchProfile', 'evalSimilarityF2', 'classifyF2Outcome', 'buildCalcStdSpec', 'toNum'];
export const ONE_LINERS = ['mean', 'sdev', 'fmt'];

export function extractFunction(html, name) {
  const lines = html.replace(/\r\n/g, '\n').split('\n');
  const i = lines.findIndex(l => new RegExp(`^(async )?function ${name}\\b`).test(l));
  if (i < 0) throw new Error(`fungsi ${name} tidak ditemukan`);
  const j = lines.findIndex((l, k) => k > i && l === '}');
  return lines.slice(i, j + 1).join('\n');
}
export function extractConst(html, name) {
  const l = html.replace(/\r\n/g, '\n').split('\n').find(x => new RegExp(`^const ${name}\\s*=`).test(x));
  if (!l) throw new Error(`const ${name} tidak ditemukan`);
  return l;
}
export function extractSection(html, id) {
  const t = html.replace(/\r\n/g, '\n');
  const i = t.indexOf(`<section class="panel" id="${id}">`);
  if (i < 0) throw new Error(`bagian ${id} tidak ditemukan`);
  return t.slice(i, t.indexOf('\n  </section>', i) + 13);
}
export function computeLock(html) {
  const lock = { note: 'sha256; CRLF dinormalkan ke LF', functions: {}, sections: {} };
  for (const f of FUNCTIONS) lock.functions[f] = sha(extractFunction(html, f));
  for (const f of ONE_LINERS) lock.functions[f] = sha(extractConst(html, f));
  for (const s of ['p1', 'p2', 'p3', 'p4', 'p5']) lock.sections[s] = sha(extractSection(html, s));
  return lock;
}
if (process.argv[1]?.endsWith('modules_lock.mjs')) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const src = process.argv[2] || join(root, 'index.html');
  writeFileSync(join(root, 'modules.lock'), JSON.stringify(computeLock(readFileSync(src, 'utf8')), null, 2) + '\n');
  console.log('modules.lock ditulis dari', src);
}
