// IQ-01, IQ-02, IQ-03: Langkah 1-5 dan modul Langkah 4 tidak berubah oleh kait tab 6. [LAPTOP]
// Catatan batas: ini pemeriksaan hash teks (sumber fungsi dan bagian halaman); tangkapan layar sebelum/sesudah dikerjakan terpisah (bukti di evidence/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './helpers/fixtures.js';
import { computeLock } from '../scripts/modules_lock.mjs';

const html = readFileSync(join(REPO, 'index.html'), 'utf8');
const lock = JSON.parse(readFileSync(join(REPO, 'modules.lock'), 'utf8'));

test('IQ-02 index.html dan UDT Studio.html identik', () => {
  assert.equal(readFileSync(join(REPO, 'index.html')).compare(readFileSync(join(REPO, 'UDT Studio.html'))), 0);
});

test('IQ-03 modules.lock: sumber fungsi Langkah 4 dan helper sama dengan kunci (dibuat dari versi sebelum kait)', () => {
  const now = computeLock(html);
  assert.deepEqual(now.functions, lock.functions);
  assert.equal(Object.keys(lock.functions).length, 9);
});

test('IQ-01 bagian halaman Langkah 1-5 (p1..p5) sama dengan kunci', () => {
  assert.deepEqual(computeLock(html).sections, lock.sections);
});

test('Kait tab 6: satu nama langkah, satu bagian p6, satu skrip; bertanda AI Assisted', () => {
  assert.match(html, /const STEPS=\['Unggah','Verifikasi & Standar','Parameter & Perhitungan','Hasil & f2','Export ke Sheets','Compile Data UDT · AI Assisted'\]/);
  assert.equal((html.match(/id="p6"/g) || []).length, 1);
  assert.equal((html.match(/<script src="compile\/app\.js" defer><\/script>/g) || []).length, 1);
  const app = readFileSync(join(REPO, 'compile', 'app.js'), 'utf8');
  assert.match(app, /AI Assisted/);
});

test('IQ-03 tidak ada rumus f2 di kode tab 6 (rumus Langkah 4 dipakai ulang, bukan disalin)', () => {
  const app = readFileSync(join(REPO, 'compile', 'app.js'), 'utf8');
  assert.doesNotMatch(app, /log10|Math\.log|Math\.pow|evalSimilarityF2|\(Rt/);
});

test('Tab 6 tanpa CDN atau domain lain', () => {
  const app = readFileSync(join(REPO, 'compile', 'app.js'), 'utf8');
  assert.doesNotMatch(app, /https?:\/\//);
});
