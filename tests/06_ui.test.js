// Sprint 2: pustaka tampilan (format, model, peringatan) dan bundel pulau (cakupan gaya, tanpa CDN, ukuran, hasil berulang) [LAPTOP]
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { REPO } from './helpers/fixtures.js';
import { fmtNum, fmtDate } from '../ui/src/lib/format.js';
import { arrangeMediums, deriveRoles, defaultRef, styleFor, SHAPES, PALETTE } from '../ui/src/lib/model.js';
import { dataWarnings } from '../ui/src/lib/warnings.js';
import { filterCompiles } from '../ui/src/lib/search.js';

test('Format Indonesia: koma desimal dan tanggal 20 Apr 2025', () => {
  assert.equal(fmtNum(85.456, 1), '85,5'); assert.equal(fmtNum(3, 2), '3,00'); assert.equal(fmtNum(NaN), '–'); assert.equal(fmtNum(null), '–');
  assert.equal(fmtDate('2025-04-20'), '20 Apr 2025'); assert.equal(fmtDate('2026-05-03'), '3 Mei 2026'); assert.equal(fmtDate('2026-12-01'), '1 Des 2026');
  assert.equal(fmtDate(null), 'Tanggal kosong');
});

const med = (id, code, name = code) => ({ medium_id: id, code, label: code === 'Release' ? 'Release' : `pH ${code}`, full_name: name });
const run = (id, medium_id, o = {}) => ({ run_id: id, medium_id, brand_name: 'P', batch_no: 'B' + id, role: 'uji', variant: '', test_date: '2026-01-02', is_valid: true, minutes: [5, 10], vessels: { 1: [10 + id, 20], 2: [11 + id, 21] }, ...o });

test('arrangeMediums: 4 kuadran baku; Vastrol tanpa Release memakai medium non-baku terbanyak, kalau tak ada kosong dan bawaan = medium terbanyak', () => {
  const full = arrangeMediums([med(1, 'Release'), med(2, '1,2'), med(3, '4,5'), med(4, '6,8')], [run(1, 1), run(2, 2), run(3, 2)]);
  assert.deepEqual(full.quads.map((q) => q.slot), ['Release', '1,2', '4,5', '6,8']); assert.equal(full.defaultMedium.medium_id, 1);
  const vastrol = arrangeMediums([med(2, '1,2'), med(3, '4,5'), med(4, '6,8')], [run(1, 2), run(2, 3), run(3, 3), run(4, 3), run(5, 4)]);
  assert.equal(vastrol.quads[0].medium, null); assert.equal(vastrol.defaultMedium.medium_id, 3);
  const air = arrangeMediums([med(2, '1,2'), med(5, 'Air'), med(6, '7,2')], [run(1, 2), run(2, 5), run(3, 5), run(4, 6)]);
  assert.equal(air.quads[0].medium.medium_id, 5); assert.equal(air.quads[0].substituted, true);
  assert.ok(air.quads.some((q) => q.medium && q.medium.medium_id === 6));      // medium lain tidak disembunyikan
});

test('Peran diturunkan dari perbandingan (B3-3) dan pembanding aktif bawaan = yang paling sering dirujuk', () => {
  const data = { runs: [run(1, 1, { batch_no: 'C1', test_date: '2026-03-01' }), run(2, 1), run(3, 1), run(4, 1, { role: 'reference', test_date: '2026-02-01' })],
    comparisons: [{ medium_id: 1, test_run_id: 2, ref_run_id: 1 }, { medium_id: 1, test_run_id: 3, ref_run_id: 1 }, { medium_id: 1, test_run_id: 2, ref_run_id: 4 }] };
  const roles = deriveRoles(data);
  assert.equal(roles.get(1), 'pembanding'); assert.equal(roles.get(4), 'pembanding'); assert.equal(roles.get(2), 'uji');
  assert.equal(defaultRef(1, data, roles), 1);
  data.runs[0].is_valid = false; assert.equal(defaultRef(1, data, roles), 4);   // Tidak valid tidak jadi pembanding aktif
});

test('Satu run = satu warna + satu bentuk: kombinasi unik untuk 56 run', () => {
  const s = new Set(Array.from({ length: 56 }, (_, i) => { const x = styleFor(i); return x.color + x.shape; }));
  assert.equal(s.size, 56); assert.ok(PALETTE.length * SHAPES.length >= 56);
});

test('Peringatan mutu data: tanggal kosong, vessel > 12, nilai di luar 0..120, identik; run Tidak valid dilewati', () => {
  const v13 = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [i + 1, [1, 2]]));
  const data = { mediums: [med(1, 'Release')], comparisons: [],
    runs: [run(1, 1, { test_date: null }), run(2, 1, { vessels: v13 }), run(3, 1, { vessels: { 1: [130, 5] } }), run(4, 1), run(5, 1, { vessels: run(4, 1).vessels }), run(6, 1, { is_valid: false, test_date: null })] };
  const codes = dataWarnings(data, deriveRoles(data)).map((w) => `${w.code}:${w.run_id}`).sort();
  assert.deepEqual(codes, ['W-identik:5', 'W-nilai:3', 'W-tanggal:1', 'W-vessel>12:2']);
});

test('Kotak cari daftar compile: cocok pada judul, produk, kekuatan, zat aktif; tanpa huruf besar-kecil', () => {
  const l = [{ title: 'Development of Zemyc 150 mg Kapsul', product_name: 'Zemyc', strength: '150 mg', dosage_form: 'Kapsul', api: 'Fluconazole' }, { title: 'Development of Vastrol 20 mg Tablet', product_name: 'Vastrol', strength: '20 mg', dosage_form: 'Tablet', api: null }];
  assert.equal(filterCompiles(l, 'FLUCON').length, 1); assert.equal(filterCompiles(l, 'tablet')[0].product_name, 'Vastrol'); assert.equal(filterCompiles(l, '').length, 2); assert.equal(filterCompiles(l, 'xyz').length, 0);
});

// ---- bundel ----
const read = (f) => readFileSync(join(REPO, f), 'utf8');
test('Bundel: ukuran terkompres <= 400 KB (jalan mundur ke Opsi A bila lebih)', () => {
  const total = gzipSync(readFileSync(join(REPO, 'compiler/island.js')), { level: 9 }).length + gzipSync(readFileSync(join(REPO, 'compiler/island.css')), { level: 9 }).length;
  assert.ok(total <= 400 * 1024, `bundel ${(total / 1024).toFixed(1)} KB`);
});

test('Bundel tanpa CDN: CSS tanpa url()/@import eksternal; JS hanya memuat URL namespace XML/pesan galat React', () => {
  const css = read('compiler/island.css'); assert.ok(!/url\(|@import/.test(css));
  const js = read('compiler/island.js'); const urls = [...new Set(js.match(/https?:\/\/[^"'`\s)]+/g))];
  const ok = (u) => /^https?:\/\/(www\.w3\.org\/|react\.dev\/errors)/.test(u);
  assert.deepEqual(urls.filter((u) => !ok(u)), []);
  assert.ok(!/importScripts|XMLHttpRequest|sendBeacon|WebSocket|fetch\(/.test(js), 'pulau tidak membuat permintaan sendiri');
});

test('Gaya pulau tidak bocor ke Langkah 1-5: semua selektor diawali #udt-compile atau .uc\\:, kecuali variabel (--uc-/--tw-)', () => {
  const css = read('compiler/island.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const sels = [...css.matchAll(/(?:^|[}{;])\s*([^{}@;]+)\{/g)].map((m) => m[1].trim());
  const bad = sels.filter((s) => !/^(#udt-compile|\.uc\\:)/.test(s) && !['*,:before,:after,::backdrop', ':root,:host'].includes(s) && !/^(from|to|\d+%)/.test(s));
  assert.deepEqual(bad, []);
  const decl = (sel) => [...css.matchAll(new RegExp(sel.replace(/[*,:.]/g, '\\$&') + '\\{([^}]*)\\}', 'g'))].map((m) => m[1]).join(';');
  assert.ok(!/(^|;)(?!--)[a-z-]+:/.test(decl(':root,:host') + decl('*,:before,:after,::backdrop')), 'hanya custom property');   // hanya custom property
});

test('Tema Pharos lewat token: biru #0064A2 dan hijau #009042 ada sebagai variabel; teks hijau memakai varian gelap', () => {
  const css = read('compiler/island.css');
  assert.match(css, /--uc-primary:#0064a2/i); assert.match(css, /--uc-green:#009042/i); assert.match(css, /Google Sans/);
});

test('Hasil build berulang identik (sha256) dan sumber memakai awalan uc: bukan kelas Tailwind telanjang', () => {
  const h = () => createHash('sha256').update(readFileSync(join(REPO, 'compiler/island.js'))).update(readFileSync(join(REPO, 'compiler/island.css'))).digest('hex');
  const a = h();
  execFileSync(process.execPath, [join(REPO, 'ui/build.mjs')], { cwd: REPO, stdio: 'pipe' });
  assert.equal(h(), a);
});

test('Compiler compiler/app.js memuat pulau dari berkas lokal dan tetap punya cadangan daftar sederhana', () => {
  const app = read('compiler/app.js');
  assert.match(app, /compiler\/island\.js/); assert.match(app, /compiler\/island\.css/); assert.match(app, /function showCompiles/); assert.doesNotMatch(app, /https?:\/\//);
});
