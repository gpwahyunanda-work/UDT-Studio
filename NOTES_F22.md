# F22: Studio, CSP/PDF self-host, panel Google Sheets disembunyikan, gerbang stepper, peringatan data belum terkirim

Sumber: tab MASUKAN END USER (Pak Yonathan, 26 Nov). Basis: commit 60acd7d (produksi). Cabang: `f22-studio` (git worktree `../wt-f22`). Tanpa migrasi, tanpa push, tanpa deploy. Hash commit F22: lihat bagian paling bawah.

## 1. Pustaka PDF self-host (tanpa melonggarkan CSP)

Penyebab: Studio memuat empat berkas dari `cdnjs.cloudflare.com`, sedangkan CSP produksi `script-src 'self'` memblokirnya, sehingga `readPdf` dan cetak PDF A4 gagal. Pustaka kini disajikan dari `/vendor/` (asal sendiri). Versi PERSIS yang dipakai sebelumnya, diunduh dari cdnjs yang sama, jadi perilaku identik.

| Berkas (`vendor/`) | Pustaka dan versi | Lisensi | sha256 |
|---|---|---|---|
| `pdf.min.js` | pdf.js 3.11.174 (Mozilla) | Apache-2.0 (`LICENSE-pdfjs-dist.txt`) | `5b5799e6f8c680663207ac5b42ee14eed2a406fa7af48f50c154f0c0b1566946` |
| `pdf.worker.min.js` | pdf.js worker 3.11.174 | Apache-2.0 | `feabdf309770ed24bba31a5467836cdc8cf639c705af27d52b585b041bb8527b` |
| `jspdf.umd.min.js` | jsPDF 2.5.1 | MIT (`LICENSE-jspdf.txt`) | `98ccf17aa10c20bb1301762618fcc9b6ab3a4e7f26b6071d64d0b41154df3875` |
| `jspdf.plugin.autotable.min.js` | jsPDF-AutoTable 3.8.2 | MIT (`LICENSE-jspdf-autotable.txt`) | `27a9c3b61843c6312b87f142d40fe77c0f0f054c9f3cdeccc4bfd5f3322859c8` |

- `index.html` dan `UDT Studio.html` (tetap identik, tes IQ-02): tiga tag `<script src="/vendor/...">` dan `workerSrc = '/vendor/pdf.worker.min.js'`.
- Disajikan sebagai berkas PUBLIK (`scripts/public_manifest.mjs`: `PUBLIC_DIRS` dan `PUBLIC_PATTERNS` ditambah `vendor`). Alasan: pustaka tidak rahasia, dan pekerja pdf.js dimuat oleh Worker tanpa perlu rute fungsi. Di Vercel berkas jatuh ke `public/vendor/` (statis, Content-Type dari ekstensi `.js`, `X-Content-Type-Options: nosniff` dari aturan global, CORP same-origin lewat grup header berkas); tidak ada rewrite baru. Server Node pengembangan menyajikan lewat daftar publik yang sama. `check_exposure` tetap lulus.
- CSP `default-src 'self'; script-src 'self' 'unsafe-inline'; ...` TIDAK berubah untuk Studio, `/studio-app`, Compiler, dan rute lain. Satu-satunya pelonggaran: `font-src 'self' data:` hanya pada `/architecture/(.*)\.html` (diagram archify menanam `@font-face` sebagai `data:font/woff2`). Sumber tunggal: `CSP_ARCH` / `ARCH_FRAME_HEADERS` di `server/pageHeaders.js`, dipakai `server/pages.js` dan disalin ke `vercel.json` (tes 27 A3 membandingkan).
- `<script src="https://accounts.google.com/gsi/client">` dibuang dari kedua HTML (juga diblokir CSP, dan hanya untuk ekspor Google). `refreshBackendStatus()` kini langsung `return null` kecuali `<html class="sheets-ui">`, supaya Studio tidak memanggil `udt-studio.vercel.app/api/bridge` (pelanggaran CSP `connect-src 'self'` di konsol).

## 2. Panel Export ke Google Sheets disembunyikan

- CSS flag di `<style>` index.html: `html:not(.sheets-ui) #p5 > .section-header, html:not(.sheets-ui) #p5 > .card:not(#udtSendCard) { display:none !important }`. Menyembunyikan judul Langkah 5, kartu Koneksi Google (tombol Uji Koneksi), Lokasi Drive, Perintah Ekspor (Calculation, Report), dan Log Aktivitas. Tombol `Uji Koneksi & Template` (dibuat `renderSend`) ada di dalam kartu tersembunyi.
- Kode tidak dihapus. Mengaktifkan lagi: tambah class `sheets-ui` pada `<html>`, pasang lagi tag GIS, dan longgarkan CSP `script-src`/`connect-src` (keputusan terpisah).
- Kartu "Kirim ke UDT Compiler" (`studio-ext/kirim.js`): petunjuk = "Hasil dikirim ke Compiler. Unduh Excel/CSV dari Compiler." Tombol `Kirim ke Compiler` tetap utama.
- Bagian p1..p5 dan fungsi Langkah 1-5 TIDAK diubah: `modules.lock` tetap (tes IQ-01, IQ-03, tes 27 E). Konsekuensi: teks panduan di Langkah 1 (di dalam p1, terkunci) masih menyebut "Uji Koneksi", dan label tab 5 masih "Export ke Sheets" (STEPS dikunci tes 01). Mengubahnya butuh kontrol perubahan; belum dilakukan.

## 3. Gerbang stepper (`stepBlockReason(n)` di index.html, di luar bagian terkunci)

Aturan memakai fungsi Studio yang sudah ada, tanpa rumus baru:
- Ke Langkah 2: ada medium terbaca (`sortedMediaIds(S.model)`, syarat yang sama dengan `renderCheck`). Alasan: "Langkah 1 belum selesai: unggah dan baca data ...".
- Ke Langkah 3: tidak ada medium berstatus `err` menurut `checkMediumValidation` + `statusOf` (penanda merah Langkah 2: standar kurang dari 5, grid kosong, konflik area, tidak ada batch uji). Alasan menyebut medium yang bermasalah.
- Ke Langkah 4 dan 5: semua batch (pembanding dan uji) dihitung `calcBatchWithStdMapping` tanpa galat dan punya minimal satu nilai vessel berhingga, dan `readiness()` kosong. Aturan yang sama dengan yang dipakai "Kirim ke Compiler" untuk melewati batch ("tidak ada nilai vessel"). Alasan: sampai 3 batch + "(+n lagi)" + petunjuk melengkapi parameter Langkah 3.
- Berlaku untuk tombol `data-go` (Lanjut ke ...), tab langkah, dan panggilan `go()`; mundur selalu boleh. Centang selesai pada tab hanya bila langkah itu masih valid (`buildNav`). Alasan tampil di `#f22Gate` (role=alert; hilang sendiri 12 dtk atau saat pindah langkah sah).
- `go(n,{silent})` dan `{skipGate}` melewati gerbang (jalur internal).

## 4. Peringatan data belum dikirim (`studio-ext/kirim.js`)

- Tanda isi paket (`sigOf`, FNV-1a atas JSON paket dari `readStudio()` yang sama dengan yang dikirim) dibandingkan tiap 2 detik dan saat tab kembali terlihat dengan tanda kiriman sukses terakhir (`sessionStorage udt_f22_sent`).
- Belum terkirim = ada paket dengan run DAN tanda berbeda. Indikator "Belum dikirim ke Compiler" (`#f22Unsent`, di bawah stepper) dan `beforeunload` (tutup/refresh) aktif. Hilang setelah kirim sukses (`markSent`). Muncul lagi bila data berubah. Pembaca (kartu Kirim tersembunyi) tidak diperingatkan.

## 5. Tes dan bukti

- `tests/27_f22_studio_csp_stepper.test.js` (7 tes): tanpa cdnjs di kedua HTML, vendor ada + hash, CSP tanpa host luar dan `data:` hanya arsitektur, panel Sheets tersembunyi, gerbang, beforeunload, modules.lock utuh.
- E2E di Chrome agen (CDP 9222) terhadap `scripts/f22_serve.mjs` (CSP penuh yang sama dengan produksi, stub API; DB tidak disentuh): `scripts/f22_e2e.mjs` dan `scripts/f22_scenarios.mjs`. Bukti di `evidence/f22/`: tangkapan layar `f22_*.png`, `f22_e2e_hasil.json`, `f22_konsol.txt` (konsol bersih), `f22_cetak_pdf.json` (PDF A4 8 halaman dari 8 PDF kromatogram nyata), `f22_alur_langkah.json`, `f22_skenario_demo_gerbang.json` (4 skenario demo lolos gerbang), `verify_scenarios.txt`, `npm_test_penuh.txt`.
- Tes DB butuh `UDT_TEST_PG_PASSWORD` (diambil dari env kontainer `udt-f4-pg`).

## Titik rawan penggabungan (hotspot)

`vercel.json` (header /architecture + regex grup header berkas) dan `server/pages.js` (satu baris pemilihan header) mungkin juga disentuh F23. `server/pageHeaders.js` hanya ditambah dua ekspor di akhir.
