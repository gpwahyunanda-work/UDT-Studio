// F22 (masukan Pak Yonathan 26 Nov): pustaka PDF self-host tanpa melonggarkan CSP, panel Google Sheets disembunyikan, gerbang stepper, peringatan data belum terkirim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { REPO } from './helpers/fixtures.js';
import { CSP, CSP_ARCH, PAGE_HEADERS, STUDIO_FRAME_HEADERS, ARCH_FRAME_HEADERS } from '../server/pageHeaders.js';
import { PUBLIC_PATTERNS, GATED_PATTERNS } from '../scripts/public_manifest.mjs';

const rd = (f) => readFileSync(join(REPO, f), 'utf8');
const HTMLS = ['index.html', 'UDT Studio.html'];
const VENDOR = { 'pdf.min.js': '5b5799e6f8c680663207ac5b42ee14eed2a406fa7af48f50c154f0c0b1566946', 'pdf.worker.min.js': 'feabdf309770ed24bba31a5467836cdc8cf639c705af27d52b585b041bb8527b', 'jspdf.umd.min.js': '98ccf17aa10c20bb1301762618fcc9b6ab3a4e7f26b6071d64d0b41154df3875', 'jspdf.plugin.autotable.min.js': '27a9c3b61843c6312b87f142d40fe77c0f0f054c9f3cdeccc4bfd5f3322859c8' };

test('A1 tanpa referensi cdnjs/CDN luar di kedua HTML; tag skrip dan workerSrc menunjuk /vendor/', () => {
  for (const f of HTMLS) {
    const t = rd(f);
    assert.doesNotMatch(t, /cdnjs\.cloudflare\.com|accounts\.google\.com\/gsi|cdn\.jsdelivr|unpkg\.com/, f);
    assert.doesNotMatch(t, /<script[^>]+src="https?:/, f);
    for (const v of ['pdf.min.js', 'jspdf.umd.min.js', 'jspdf.plugin.autotable.min.js']) assert.ok(t.includes(`<script src="/vendor/${v}" defer></script>`), `${f} ${v}`);
    assert.ok(t.includes("workerSrc = '/vendor/pdf.worker.min.js'"), f);
  }
  assert.equal(rd('index.html'), rd('UDT Studio.html'));
});

test('A2 berkas vendor ada, hash persis (pdf.js 3.11.174, jsPDF 2.5.1, autotable 3.8.2), lisensi ada, masuk daftar publik', () => {
  for (const [f, h] of Object.entries(VENDOR)) {
    assert.ok(existsSync(join(REPO, 'vendor', f)), f);
    assert.equal(createHash('sha256').update(readFileSync(join(REPO, 'vendor', f))).digest('hex'), h, f);
    assert.ok(PUBLIC_PATTERNS.some((re) => re.test('vendor/' + f)) && !GATED_PATTERNS.some((re) => re.test('vendor/' + f)), f);
  }
  for (const l of ['LICENSE-pdfjs-dist.txt', 'LICENSE-jspdf.txt', 'LICENSE-jspdf-autotable.txt']) assert.ok(existsSync(join(REPO, 'vendor', l)), l);
  assert.match(rd('vendor/pdf.min.js'), /3\.11\.174/);
  assert.match(rd('vendor/jspdf.umd.min.js').slice(0, 400), /2\.5\.1/);
  assert.match(rd('vendor/jspdf.plugin.autotable.min.js').slice(0, 400), /3\.8\.2/);
  assert.match(rd('NOTES_F22.md'), /sha256/);
});

test('A3 CSP tanpa host eksternal; data: pada font-src HANYA untuk /architecture/*.html; vercel.json = server', () => {
  for (const c of [CSP, PAGE_HEADERS['content-security-policy'], STUDIO_FRAME_HEADERS['content-security-policy'], CSP_ARCH]) assert.doesNotMatch(c, /https?:|\*/);
  assert.match(CSP, /font-src 'self';/);
  assert.doesNotMatch(STUDIO_FRAME_HEADERS['content-security-policy'], /font-src[^;]*data:/);
  assert.match(CSP_ARCH, /font-src 'self' data:;/);
  assert.equal(ARCH_FRAME_HEADERS['content-security-policy'], CSP_ARCH);
  const v = JSON.parse(rd('vercel.json'));
  const val = (src) => Object.fromEntries(v.headers.find((h) => h.source === src).headers.map((h) => [h.key.toLowerCase(), h.value]))['content-security-policy'];
  assert.equal(val('/architecture/(.*)\\.html'), CSP_ARCH);
  assert.equal(val('/studio-app'), STUDIO_FRAME_HEADERS['content-security-policy']);
  for (const s of ['/', '/studio', '/record', '/architecture', '/compiler']) assert.equal(val(s), CSP, s);
  assert.ok(!v.rewrites.some((r) => /vendor/.test(r.source)), 'vendor tersaji statis dari public/, tanpa rute fungsi');
});

test('B panel Google Sheets disembunyikan lewat satu bendera CSS; kode tetap ada; petunjuk analis di kartu Kirim', () => {
  const t = rd('index.html'), k = rd('studio-ext/kirim.js');
  assert.ok(t.includes('html:not(.sheets-ui) #p5 > .section-header, html:not(.sheets-ui) #p5 > .card:not(#udtSendCard) { display: none !important; }'));
  for (const id of ['id="testBtn"', 'Uji Koneksi & Template', 'id="calcBtn"', 'id="reportBtn"']) assert.ok(t.includes(id), id);
  assert.ok(k.includes('Hasil dikirim ke Compiler. Unduh Excel/CSV dari Compiler.'));
  assert.ok(k.includes("text: 'Kirim ke Compiler'"));
  assert.doesNotMatch(t, /<html[^>]*sheets-ui/);
});

test('C gerbang stepper memakai aturan yang sudah ada di Studio; dipasang di go() dan tab; alasan ditampilkan', () => {
  const t = rd('index.html');
  assert.match(t, /function stepBlockReason\(n\)/);
  assert.match(t, /checkMediumValidation\(S\.model\.media\[id\]/);
  assert.match(t, /calcBatchWithStdMapping\(id, M, b, role, P\)/);
  assert.match(t, /if \(!opts\.silent && !opts\.skipGate && n > S\.step\)/);
  assert.match(t, /const ok=S\.step>i\+1 && !stepBlockReason\(i\+2\)/);
  assert.match(t, /id="f22Gate"[^>]*role="alert"/);
  for (const m of ['Langkah 1 belum selesai', 'Langkah 2 belum valid', 'Langkah 3 belum valid']) assert.ok(t.includes(m), m);
});

test('D peringatan Belum dikirim ke Compiler: indikator, beforeunload, hilang setelah kirim sukses', () => {
  const t = rd('index.html'), k = rd('studio-ext/kirim.js');
  assert.match(t, /id="f22Unsent"[^>]*>Belum dikirim ke Compiler</);
  assert.ok(k.includes("addEventListener('beforeunload'"));
  assert.ok(k.includes('e.preventDefault()'));
  assert.ok(k.includes('busy = false; markSent(st.sig);'));
  assert.doesNotMatch(k.replace(/\/\/.*$/gm, ''), /log10|Math\.log|Math\.pow|\(Rt/);
});

test('E rumus dan bagian Langkah 1-5 tidak berubah (modules.lock tetap)', async () => {
  const { computeLock } = await import('../scripts/modules_lock.mjs');
  const lock = JSON.parse(rd('modules.lock')), c = computeLock(rd('index.html'));
  assert.deepEqual(c.sections, lock.sections);
  assert.deepEqual(c.functions, lock.functions);
});
