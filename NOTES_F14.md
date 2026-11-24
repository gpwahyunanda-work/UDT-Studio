# NOTES_F14 (BRAHMA, 24 Nov 2026) - cabang feat/compile-s1, lokal, tanpa push/deploy

Kartu t_be94932c. Dasar HEAD 0a192d3 (F12). Studio tidak berubah logika: `index.html` dan `UDT Studio.html` identik dengan sebelumnya (tes A3 membandingkan byte demi byte), `modules.lock` tidak disentuh, tes Studio lulus.

## A. Kerangka dan rute
| Rute | Isi | Catatan |
|---|---|---|
| `/` | **Beranda** (dirender server): kartu besar ke `/studio`, `/compiler`, `/record`, `/architecture` | Tanpa sesi: halaman masuk. **Rute lama `/` TIDAK memuat Studio lagi** (kompat: `/index.html` dialihkan 302 ke `/studio`; tidak ada salinan Studio di `/`). |
| `/studio` | pembungkus sama-asal: sidebar + `<iframe src="/studio-app">` | header halaman biasa (DENY, frame-ancestors 'none') |
| `/studio-app` | isi Studio = `index.html` apa adanya | **satu-satunya** rute dengan `X-Frame-Options: SAMEORIGIN` dan CSP `frame-ancestors 'self'` (server/pageHeaders.js `STUDIO_FRAME_HEADERS`; juga di vercel.json) |
| `/compiler` | Compiler dengan sidebar yang disuntik saat disajikan (penanda `<!--UDT_SIDEBAR-->`) | `/compiler/index.html` sama |
| `/record`, `/architecture` | "Segera hadir" dengan kerangka sama | F15 mengisi |
| `/shell/shell.css`, `/shell/shell.js` | aset kerangka | gated (butuh sesi), masuk GATED_DIRS dan bundel Vercel |

**Sidebar:** Beranda, Studio, Compiler, Record, Architecture, (admin) Pengguna, nama akun + peran, Ganti kata sandi, Keluar. Bisa diciutkan (tombol dengan `aria-expanded`, keadaan diingat di `udt_side`), fokus terlihat (outline mint), `aria-current="page"`, tautan "Lewati ke isi", di layar <= 900 px menjadi menu (tombol Menu, scrim, Esc menutup, fokus kembali ke tombol). Tema Pharos terang/gelap (token yang sama dengan Compiler F8).

**Pilihan Studio = iframe sama-asal, bukan injeksi.** Alasan: (1) berkas Studio dan hash `modules.lock` utuh (tes IQ-02/05 lulus tanpa perubahan); (2) satu berkas 11 ribu baris dengan selektor global: sidebar tidak bisa bentrok CSS/JS; (3) injeksi string HTML rapuh bila Studio berubah dan memaksa menyentuh berkas yang divalidasi; (4) harga yang diterima: gulir bersarang dan dua bilah atas (bilah Studio tetap ada di dalam bingkai). Tanda akun kecil milik `studio-ext/akun.js` disembunyikan dari sisi pembungkus (sidebar sudah menampilkannya). Tema diselaraskan lewat kunci `udt_theme` (Studio) dan `udt-theme` (Compiler); tombol Tampilan Studio mengubah pembungkus lewat event `storage`.

## B. Compiler
1. **Kuadran tepat 4 kartu 2x2 sama besar.** Kartu 1-3 = pH 1,2 / 4,5 / 6,8. Kartu 4 = Air bila Air berdata; selain itu Release bila berdata; bila keduanya berdata = **tab Air | Release** (Air diutamakan, bukan kartu kelima); bila tidak ada = kartu kosong berukuran sama (plot beraspek 400:250 tetap). Tinggi seragam: `grid-auto-rows:1fr` + `aspect-ratio`.
2. **Perataan.** Matriks: grid `44px | batch | N medium` dengan `--mc` = jumlah medium (dulu 4 kolom tetap, kolom ke-5 jatuh ke baris baru = sumber "Release meluber ke kiri" dan "—" yatim); lebar sel tetap, `tabular-nums`; header "Batch" diberi indentasi sama dengan kode batch (lebar penanda 14 + celah 7); baris pembanding juga. Panel: bertumpuk di bawah 1600 px; sebaris mulai 1600 px dengan **matriks sticky** (pilihan "atau sticky" pada kartu; alasan: tinggi sama menyisakan ratusan px kosong di bawah matriks bila batch sedikit). Label sumbu x di bawah angka tick (mb 46; jarak teruji >= 2 px). Catatan kaki di dalam kartu kanan. Legenda memakai kartu sendiri.
   **Jakob:** bilah atas Compiler = bilah atas Studio (logo Pharos 40 px, judul, sub "Analytical Development · Pharos Indonesia", tombol **Tampilan** di kanan; tinggi 54 px) dan bilah langkah segmen yang sama gayanya dengan `nav#steps` Studio (1 Tambah data run, 2 Dashboard compile, 3 Pengguna). Logo ganda di kepala halaman dihapus. **Studio tidak punya footer**, jadi Compiler juga tidak (tidak ada yang ditiru). Tombol Ekspor/PNG/Cetak tetap di kepala halaman Compiler (Studio tidak memilikinya; fungsi tidak ada padanan di Studio).
3. **Bug angka chip.** Penyebab: chip memakai `c.f2s` (hitung ulang tim, n=3) sedangkan matriks memakai `c.f2` (resmi S-2: tercetak sheet untuk data impor, Langkah 4 untuk data baru). Sekarang chip = `c.f2`. Ekspor memakai nilai tersimpan yang sama (tes B2 mencocokkan setiap sel matriks Empagliflozin dengan nilai cache rumus di xlsx) dan cetak memakai DOM yang sama. Tes C1 membandingkan tiap chip dengan sel matriks di DOM nyata. `f2s` tetap ada di payload hanya untuk rincian sel.
4. **Urutan stabil.** Kunci: `entered_at` = `run.created_at` PERTAMA pada baris batch (impor = waktu transaksi impor; Studio = waktu push), menurun; seri (satu impor serentak) -> tanggal uji menurun -> kunci batch naik. Dihitung server (`runs[]`), klien tidak mengurutkan ulang. Penanda per batch = fungsi indeks urutan masuk dari yang TERTUA (data baru tidak menggeser yang lama): warna = indeks mod 8 (8 warna, semua kontras >= 3:1 di putih), bentuk = (indeks + indeks div 8) mod 4 -> 32 kombinasi unik. Centang-buka-centang atau urutan klik terbalik mengembalikan posisi, warna, bentuk (teruji di DOM). Batas 4: batch ke-5 melepas yang TERTUA menurut waktu masuk dengan pesan (`#mxNote`, aria-live); penanda yang tersisa tidak bergeser. Fokus papan ketik kembali ke kotak centang setelah render.
5. **Tes visual/DOM.** `scripts/f14_visual.mjs` (CDP Chrome agen, 1366 dan 1920 x terang/gelap, tinggi halaman penuh) + `tests/20` bagian C (DOM nyata). Bukti di `evidence/f14/`: `sebelum_*` dan `sesudah_*` (Compiler Empagliflozin, `sesudah_vastrol_*` untuk 15 batch + tab Air|Release, Beranda, Studio, Record, Architecture, `sesudah_mobile_*` 390 px), `*_dom.json`, `cetak_produk*.pdf` (1 halaman A4 lanskap; `printScale` dikalibrasi ulang untuk 2x2).

## Yang berubah di berkas
Baru: `server/shell.js`, `shell/shell.css`, `shell/shell.js`, `compiler/compiler-f14.css`, `tests/20_f14_kerangka_compiler.test.js`, `scripts/f14_visual.mjs`, `scripts/f14_debug.mjs`, `scripts/f14_print.mjs`, `scripts/f14_printmeasure.mjs`. Diubah: `server/pages.js`, `server/pageHeaders.js`, `server/compileData.js` (+`entered_at`), `server/dashboard.js` (urutan + `entered_at`), `compiler/index.html`, `compiler/app.js`, `scripts/public_manifest.mjs`, `vercel.json`. **Tidak diubah:** `index.html`, `UDT Studio.html`, `modules.lock`, `server/step4.js`, migrasi (tidak ada migrasi baru).

**Tes lama diadaptasi (bukan dibuang):** tests/14 (tautan CSS menyisipkan shell.css; id `reset` dan `/api/auth/logout` pindah ke shell.js, ada tes pengganti), tests/15 (satu logo di bilah atas; palet 8 warna), tests/17 (`/` = Beranda; isi Studio dicek di `/studio-app`; tautan Ganti kata sandi di sidebar), tests/19 (idem). Tes 16 (header halaman/vercel/gated) lulus tanpa perubahan.

## Yang perlu INDRA/Wahyu
- **Kompat `/`:** setiap penanda/bookmark yang berharap Studio di `/` kini melihat Beranda; Studio ada di `/studio`. `/index.html` dialihkan.
- vercel.json diubah (rewrite + header rute baru, `shell` di grup aset): perlu dilihat sebelum push; **belum diuji di Vercel**.
- Header `X-Frame-Options` hanya `/studio-app` yang SAMEORIGIN; mohon dicek di pratinjau Vercel bahwa `Content-Security-Policy` rute itu tidak ditimpa grup `/(.*)`.
- `repo/architecture/` (berkas F13 yang belum dikomit, bukan bagian kartu ini) tidak disentuh dan tidak ikut komit.

## Keterbatasan jujur
- Audit skill `ui-ux-pro-max` tidak dijalankan; pemeriksaan lewat tangkapan layar Chrome agen + analisis visual + tes DOM.
- Bilah atas Studio (dalam iframe) dan bilah atas halaman tidak digabung: pada `/studio` hanya bilah Studio yang tampak (pembungkus tanpa bilah atas), pada halaman lain bilah halaman. Tombol Tampilan konsisten posisinya (kanan atas) tetapi pada Studio dikelola Studio.
- Sticky matriks dan gulir sendiri pada layar tinggi <~ 600 px belum dicoba.
- Cetak: satu halaman terverifikasi untuk 2 produk uji (PDF); dengan batch jauh lebih banyak, `printScale` memperkecil sampai batas 0,4.
- Layar 390 px: bilah langkah dapat digeser mendatar (langkah ke-3 terpotong sampai digeser); matriks dan tabel temuan menggulir dalam kartu.
- Tes C1-C3 butuh Chrome agen di 9222; bila tidak aktif mereka dilewati (bukan gagal). Menjalankan seluruh suite mengubah kata sandi peran `udt_app` di Postgres uji (perilaku lama pembantu tes) sehingga server dev lokal harus dinyalakan ulang sesudahnya.
