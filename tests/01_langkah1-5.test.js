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

test('Arah baru: Studio TIDAK memuat tab 6 (tanpa p6, STEPS asli 5 nama, tanpa skrip compile/)', () => {
  assert.match(html, /const STEPS=\['Unggah','Verifikasi & Standar','Parameter & Perhitungan','Hasil & f2','Export ke Sheets'\]/);
  assert.equal((html.match(/id="p6"/g) || []).length, 0);
  assert.doesNotMatch(html, /compile\/app\.js|udt-compile/);
});

test('Studio hanya punya SATU kait baru: skrip studio-ext/kirim.js (tombol Kirim ke Compiler) di luar bagian p1..p5', () => {
  assert.equal((html.match(/<script src="studio-ext\/kirim\.js" defer><\/script>/g) || []).length, 1);
  assert.ok(html.indexOf('studio-ext/kirim.js') > html.indexOf('id="p5"'));
});

test('IQ-03 tidak ada rumus f2 di kode Compiler/Studio-ext (rumus Langkah 4 dipakai ulang, bukan disalin)', () => {
  for (const f of ['compiler/app.js', 'studio-ext/kirim.js']) {
    const app = readFileSync(join(REPO, f), 'utf8');
    assert.doesNotMatch(app.replace(/\/\/.*$/gm, ''), /log10|Math\.log|Math\.pow|\(Rt/, f);
  }
});

test('server/step4.js = salinan harfiah fungsi Langkah 4 (hash sama dengan modules.lock; sumber tunggal index.html)', async () => {
  const { step4Source } = await import('../scripts/build_step4.mjs');
  assert.equal(readFileSync(join(REPO, 'server', 'step4.js'), 'utf8').split('\r\n').join('\n'), step4Source(html));
});

test('Compiler dan Studio-ext tanpa CDN atau domain lain', () => {
  for (const f of ['compiler/app.js', 'compiler/index.html', 'studio-ext/kirim.js']) assert.doesNotMatch(readFileSync(join(REPO, f), 'utf8').replace(/http:\/\/www\.w3\.org\/[0-9a-z\/]+/g, ''), /https?:\/\//, f);
});
