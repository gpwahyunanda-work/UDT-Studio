// F7: tema Pharos bersama untuk Studio (Langkah 1-5) dan Compiler. Hanya lapisan tampilan; rumus tetap dijaga tests/01 + modules.lock. [LAPTOP]
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './helpers/fixtures.js';

const rd = (f) => readFileSync(join(REPO, f), 'utf8').replace(/\r\n/g, '\n');
const theme = rd('theme/pharos-theme.css'), studio = rd('index.html'), html = rd('compiler/index.html'), css = rd('compiler/compiler.css'), app = rd('compiler/app.js');
const tok = (n) => { const m = theme.match(new RegExp('--pharos-' + n + ':\\s*(#[0-9A-Fa-f]{6})')); assert.ok(m, 'token ' + n); return m[1]; };
const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('Token merek sesuai PHAROS_BRAND_SPEC dan huruf Google Sans lokal (woff2, tanpa CDN)', () => {
  const spec = { blue: '#0064A2', green: '#009042', ink: '#202729', muted: '#666666', gray: '#EFEFEF', navy: '#0C132B', slate: '#353744', mint: '#63D297', yellow: '#FFE239', red: '#980000', orange: '#FF9900' };
  for (const [k, v] of Object.entries(spec)) assert.equal(tok(k).toUpperCase(), v, k);
  assert.match(theme, /font-family:'Google Sans'[^}]*fonts\/GoogleSans-var\.woff2/);
  assert.match(theme, /--pharos-font:'Google Sans',Arial,sans-serif/);
  for (const f of ['theme/fonts/GoogleSans-var.woff2', 'theme/fonts/GoogleSans-Italic-var.woff2']) assert.equal(readFileSync(join(REPO, f)).subarray(0, 4).toString(), 'wOF2', f);
  assert.ok(existsSync(join(REPO, 'theme/fonts/OFL-GoogleSans.txt')) && existsSync(join(REPO, 'theme/pharos-logo.png')));
  assert.doesNotMatch(theme.replace(/http:\/\/www\.w3\.org\/[0-9a-z/]+/g, ''), /https?:\/\//);
});

test('Kontras teks WCAG AA (>= 4.5) dan kontrol/garis fokus (>= 3) pada pasangan yang dipakai', () => {
  const T = [['ink', 'white'], ['muted', 'white'], ['muted', 'gray'], ['muted', 'gray-soft'], ['blue', 'white'], ['white', 'blue'], ['blue', 'blue-tint'], ['blue-dark', 'blue-tint'],
    ['green-text', 'white'], ['green-text', 'green-tint'], ['red', 'white'], ['red', 'red-tint'], ['warn-ink', 'yellow-tint'], ['white', 'navy'], ['mint', 'navy'], ['on-navy', 'navy'],
    ['white', 'slate'], ['ink', 'yellow']];
  for (const [a, b] of T) assert.ok(cr(tok(a), tok(b)) >= 4.5, `${a}/${b} = ${cr(tok(a), tok(b)).toFixed(2)}`);
  for (const [a, b] of [['control', 'white'], ['focus', 'white'], ['mint', 'navy'], ['s1', 'white'], ['s2', 'white'], ['s3', 'white'], ['s4', 'white']]) assert.ok(cr(tok(a), tok(b)) >= 3, `${a}/${b}`);
  assert.match(theme, /:focus-visible\s*\{[^}]*outline:\s*2px solid/);
});

test('Studio: memuat tema, logo Pharos, tanpa emoji hias, tanpa gradien/bayangan di variabel, rumus tidak disentuh (index.html = UDT Studio.html)', () => {
  assert.match(studio, /<link rel="stylesheet" href="theme\/pharos-theme\.css">\s*<\/head>/);
  assert.match(studio, /<img class="brand-logo-pharos" src="theme\/pharos-logo\.png"/);
  assert.doesNotMatch(studio, /⏳|🐴|linearGradient id="hdrbg"|'✨ Rapikan/);   // satu ✨ di teks bantuan p1 sengaja dibiarkan: bagian halaman p1 dikunci modules.lock (IQ-01)
  assert.equal((studio.match(/✨/g) || []).length, 1);
  assert.match(theme, /--shadow-subtle:\s*none/);
  assert.equal(studio, rd('UDT Studio.html'));
});

test('Compiler: tanpa palet lama (biru stok, Inter, Space Grotesk, ungu/teal), warna lewat token --pharos-*, logo Pharos di header', () => {
  const old = /#(0B4FA8|1D63D6|14181F|F3F5F8|C9D0DA|7C3AED|0F766E|C2410C|3B4452|556070|E7F0FD|8F3010)\b/i;
  for (const [n, s] of [['index.html', html], ['compiler.css', css], ['app.js', app]]) {
    assert.doesNotMatch(s, old, n); assert.doesNotMatch(s, /Space Grotesk|\bInter\b/, n);
  }
  assert.ok((html.match(/class="pharos-logo"/g) || []).length === 2)   // F10: tampilan masuk pindah ke halaman masuk server (server/pages.js), tema sama;
  assert.match(css, /var\(--pharos-blue\)/);
  assert.doesNotMatch(app + html, /box-shadow:0 (6|8)px/);
});

test('Grafik: seri dibedakan warna DAN bentuk penanda (aman buta warna); komparator tebal solid, lainnya putus-putus', () => {
  assert.match(app, /var SLOT = \['#0064A2', '#B85C00', '#4F8FB8', '#6E7387'\]/);
  assert.match(app, /function shapePath/);                  // bentuk penanda per seri tetap
  assert.match(app, /stroke-dasharray=\\?"6 4/);
  assert.match(studio, /marker: 'square'/); assert.match(studio, /marker: 'circle'/);
  for (const c of ['#0064A2', '#B85C00', '#4F8FB8', '#6E7387']) assert.ok(cr(c, '#FFFFFF') >= 3, c);
});

test('Server menyajikan /theme (css, woff2, png)', () => {
  const s = rd('server/node-server.mjs'), m = rd('scripts/public_manifest.mjs');   // F8: daftar publik satu sumber
  assert.match(m, /theme/); assert.match(s, /PUBLIC_PATTERNS/); assert.match(s, /'\.woff2': 'font\/woff2'/);
});
