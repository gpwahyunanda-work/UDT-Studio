// F6: HTML tim terpasang sebagai UI Compiler tanpa mengubah tampilan/teks/kelas; tanpa CDN; tanpa rumus di klien. [LAPTOP]
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './helpers/fixtures.js';

const rd = (f) => readFileSync(join(REPO, f), 'utf8').replace(/\r\n/g, '\n');
const tim = rd('tests/fixtures/Mockup_tim_v3.html'), html = rd('compiler/index.html'), css = rd('compiler/compiler.css'), app = rd('compiler/app.js');
const timMarkup = tim.slice(0, tim.indexOf('<script>'));
const idsOf = (s) => new Set([...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const classesOf = (s) => new Set([...s.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)));

test('CSS tim: aturan tata letak tim utuh; F7 hanya mengganti warna/huruf/radius ke token Pharos (tema bersama di /theme)', () => {
  const teamCss = tim.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\r\n/g, '\n');
  const sel = (s) => [...s.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(^|\})\s*([^{}@]+)\{/g)].map((m) => m[2].trim());
  assert.deepEqual(sel(css), sel(teamCss), 'daftar selektor CSS tim harus sama');
  assert.doesNotMatch(css, /@font-face|Inter|Space Grotesk/);
  assert.match(html, /<link rel="stylesheet" href="\/theme\/pharos-theme\.css">\s*<link rel="stylesheet" href="\/compiler\/compiler\.css">/);
});

test('Semua id dan kelas HTML tim masih ada (atau dibuat app.js yang sama); eyebrow diganti menjadi UDT Compiler', () => {
  const dynamicIds = new Set(['reset', 'f-prod', 'f-batch', 'f-var', 'f-med', 'f-cmp', 'f-date', 'f-ana', 'f-vol', 'f-app', 'f-met', 'anaWarn', 'saveBtn']);
  for (const id of idsOf(timMarkup)) assert.ok(idsOf(html).has(id) || app.includes(id), `id hilang: ${id}`);
  for (const id of dynamicIds) assert.ok(idsOf(html).has(id), id);
  for (const cl of classesOf(timMarkup)) assert.ok(classesOf(html).has(cl) || app.includes(cl) || css.includes('.' + cl), `kelas hilang: ${cl}`);
  assert.equal((html.match(/>UDT Compiler<\/div>/g) || []).length >= 3, true, 'eyebrow login, dashboard, formulir');
  assert.doesNotMatch(html, /Langkah 6|UDT Studio ·|Mockup \(data Vastrol\)/);
});

test('Teks statis tim dipertahankan (judul, label, tombol, catatan)', () => {
  for (const t of ['Pembanding aktif', 'Cari batch', 'Status run', 'Rentang tanggal uji', 'Valid saja', 'Semua, termasuk tidak valid', 'Ekspor ke sheet', 'Tambah data run', 'Centang sampai 4 batch untuk melihat profilnya di grafik. Terbaru di atas.',
    'Perlu dicek', 'Data dan kesimpulan tidak diubah. Aplikasi hanya menandai.', 'Identitas run', 'Nama analis (wajib)', 'Volume medium', 'Alat dan kecepatan', 'Metode analisis', 'Identitas run = produk + batch + varian + medium + data vessel. Tanggal tidak termasuk identitas.',
    '% terlarut per vessel', 'Maksimum 12 vessel dan 9 titik waktu', '+ Tambah titik waktu', 'Batas RSD: 20% untuk titik ≤ 10 menit, 10% untuk titik lainnya.', 'Pratinjau hasil', 'Pemeriksaan otomatis', 'Simpan ke database', 'Batal',
    'Isi manual', 'Tempel dari Excel', 'Impor sheet lama', 'Similar (f2 ≥ 50)', 'Sangat cepat: keduanya ≥ 85% di 15 menit, f2 hanya informasi', 'Not Similar', 'Dengan menekan Simpan ke database, Anda menyatakan data sudah diperiksa dan benar.']) {
    assert.ok(tim.includes(t), `bukan teks tim: ${t}`); assert.ok(html.includes(t), `teks tim hilang: ${t}`);
  }
});

test('Tanpa CDN atau domain luar; font lokal; tanpa data tertanam (var D) di klien', () => {
  for (const [n, s] of [['index.html', html], ['compiler.css', css], ['app.js', app]]) assert.doesNotMatch(s.replace(/http:\/\/www\.w3\.org\/[0-9a-z\/]+/g, ''), /https?:\/\//, n);
  assert.doesNotMatch(html, /fonts\.googleapis|gstatic|<link[^>]+preconnect/);
  assert.doesNotMatch(css + html + app, /Space Grotesk|\bInter\b/);
  assert.doesNotMatch(app, /var D\s*=\s*\{|"media":\s*\[/);
});

test('Tanpa rumus f2/statistik di klien: tidak ada log10/log/sqrt/pow, tidak ada fungsi f2 atau judge; semua angka dari API', () => {
  const code = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /Math\.(log|log10|sqrt|pow|LN10)|\bfunction f2\b|\bfunction judge\b|\bstdev\b|\bsdev\b/);
  for (const ep of ['/api/products', '/dashboard', '/runs/preview', '/api/me', '/api/imports/xlsx', '/api/auth/logout', '/api/admin/users', '/export?format=']) assert.ok(app.includes(ep), ep);
});

test('Penulisan: nama analis dikirim ke server, produk baru lewat konfirmasi, push_id idempoten, ringkasan konfirmasi sebelum simpan', () => {
  assert.match(app, /okAna\(\)/); assert.match(app, /ME\.analyst/);   // F10: nama analis = nama akun
  assert.match(app, /Produk serupa sudah ada/); assert.match(app, /Konfirmasi simpan/); assert.match(app, /push_id/);
  assert.match(app, /Timpa run lama/); assert.match(app, /Simpan sebagai run ulang/);
  assert.match(app, /isWriter\(\)/);   // peran pembaca tidak melihat formulir
});

test('Studio "Kirim ke Compiler" tetap (satu kait) dan memakai kontrak baru: /api/products, kunci produk, tautan ke produk di Compiler', () => {
  const k = rd('studio-ext/kirim.js');
  assert.match(k, /'\/api\/products\/match\?'/); assert.match(k, /api\('GET', '\/api\/products'\)/); assert.match(k, /api\('POST', '\/api\/products', \{ product_name/);
  assert.match(k, /\/api\/ingest\/commit/); assert.match(k, /'\/compiler\?p=' \+ sentTo \+ '#dashboard'/);
  assert.doesNotMatch(k, /'\/api\/compiles/);
});
