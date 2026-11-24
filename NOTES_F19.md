# NOTES F19 — perbaikan sisa F18 (BRAHMA)

Dasar: `docs/F18_laporan.md`, cabang `feat/compile-s1` dari `eee6045`. Lokal saja: tanpa push, tanpa deploy, tanpa migrasi basis data. Rumus Langkah 1-5 tidak disentuh.

## 1. F18-01: karakter tak terlihat (REQ-094)
- Satu fungsi `cleanText(v, {multiline})` di `server/ingest.js`. Menolak Unicode Cc (TAB, BEL, NUL, CR/LF di kolom satu baris), Cf (U+200B, U+202E, U+FEFF, U+00AD, ...), U+2028/2029. Menormalkan spasi: tepi dibuang, deret spasi (termasuk NBSP) jadi satu spasi.
- `multiline` (hanya catatan `note`, `invalid_reason`, alasan, `conclusion_printed`, `hold_reason`, pesan catatan impor): LF dan CRLF boleh (CRLF jadi LF), baris dipangkas, 3+ baris kosong jadi 1. Selebihnya syarat sama (TAB tetap ditolak).
- Dipasang di: Record (`norm`, `validReason`: product_name, strength, dosage_form, api, project_code, title, kolom medium/batch/alias/run), `POST /api/compiles` (`validateCompile`), impor sheet dan kiriman Studio (`validatePackage` → `str`), isian run (`readRun`: batch, varian), ubah/hapus/pulihkan run (`runs.js`: note, invalid_reason, variant, alasan), alias produk (`app.js`), nama analis (`validateAnalystName`: Cc + Cf + U+2028/9, spasi ganda digabung).
- Pesan galat: `... tanpa karakter kendali, TAB, atau karakter format tak terlihat` (400).
- Perilaku yang berubah dan perlu diketahui INDRA: (a) impor sheet sebelumnya menyimpan teks apa adanya; kini spasi ganda/tepi dinormalkan dan satu sel catatan dengan TAB/Cf menolak seluruh paket (400, galat per kolom). (b) Nomor batch dengan spasi ganda di sheet sumber tersimpan dengan satu spasi; bila basis produksi sudah punya batch yang sama dengan dua spasi, impor ulang membuatnya terbaca sebagai batch lain. Pemeriksaan di bawah ini menunjukkan apakah ada baris seperti itu.
- Data lama: tidak diubah, tidak ada migrasi, tidak ada pembacaan yang divalidasi ulang (validasi hanya di jalur tulis). Tes D1 menanam baris dengan U+200B+TAB lewat SQL lalu memastikan Record (JSON dan CSV), `/api/compiles`, `/api/products` tetap 200.
- Laporan data lama (baca-saja): `DATABASE_URL=... node scripts/cek_teks_lama.mjs` (transaksi read-only, hanya SELECT; sebaiknya peran `udt_app`). Mencantumkan tabel, kolom, jumlah baris, contoh. Belum dijalankan terhadap produksi (BRAHMA tidak memegang kredensial produksi): **INDRA menjalankannya sebelum deploy dan melaporkan hasilnya**. Baris lama bermasalah: laporkan saja, jangan ubah. Catatan dari F18: tiga produk uji F18 (id 20, 22, 23) di staging memuat TAB/ZWSP/RLO dan akan muncul di laporan itu; pembersihannya urusan INDRA.

## 2. F18-02: page (REQ-095)
`readTable` kini menjawab 400 (`page: N melebihi jumlah halaman (M)`) untuk `page > pages`, sama dengan `page` sangat besar yang sudah 400. Halaman terakhir tetap 200. Klien Record (`shell/record.js`): bila 400 karena page dan page > 1 (mis. baris berkurang), kembali ke halaman 1 sekali. Tes 21 (E) disesuaikan (sebelumnya mengharapkan 200 halaman terakhir).

## 3. F18-03: latar gelap + scrollbar (REQ-096)
- Akar: `compiler/compiler-f8.css` memaksa `body{background:var(--pharos-navy)}` pada mode gelap (12,19,43), sedangkan halaman lain memakai `--pharos-white` yang dibalik ke `#131A36` (19,26,54). Dua aturan itu dihapus; `shell/shell.css` (dimuat semua halaman, termasuk Compiler) kini menetapkan `body{background:var(--pharos-white)}` sebagai satu-satunya latar halaman, dan `html{scrollbar-gutter:stable}`.
- Tes E1 memeriksa CSS (aturan navy hilang, gutter dan token ada, nilai gelap #131A36).
- **Ukur ulang `getBoundingClientRect` (5 halaman × 1366/1920 × terang/gelap): BELUM dilakukan.** Alat `browser_exec` dan `browser_cdp` di sesi ini menolak URL 127.0.0.1/localhost ("Blocked: URL targets a private or internal address"), jadi dev server lokal tak dapat dibuka; saya tidak menyiasatinya. Skrip siap: `kerja/f19/measure.py` (salinan F17 + `bodyBg`, `htmlBg`, `iw`), server: `kerja/f17/start_dev.sh` (port 8797). Kriteria: selisih lebar bilah atas/isi antar halaman ≤ 1 px di 1366 dan `bodyBg` = `rgb(19, 26, 54)` di semua halaman gelap; simpan di `evidence/f19/`. Perlu dijalankan AGNI atau INDRA (atau sesi dengan akses localhost).
- Risiko yang saya ketahui dan ingin diverifikasi pengukuran: `scrollbar-gutter` hanya mencadangkan ruang untuk bilah gulir viewport (`html`); halaman Studio memuat isi di dalam iframe, yang punya gulir sendiri.

## 4. F16-04 (visual /record)
Sudah dikerjakan di F17 (lihat `NOTES_F17.md` §6): keadaan awal "Pilih tabel di kiri", keterangan (title) badge "tulis", label "baris", pemisah ribuan `toLocaleString('id-ID')`. Terverifikasi lewat pembacaan kode (`server/shell.js`, `shell/record.js`); tidak diubah di F19.

## 5. Tes
`tests/25_f19_teks_tak_terlihat.test.js` (8 tes: A1-A2 cleanText dan nama analis; B1 `/api/compiles`; B2 Record insert/ubah; C1 page; D1 data lama terbaca + laporan baca-saja; E1 CSS; F1 impor sheet). TAB, U+200B, U+202E, BEL ditambah U+FEFF, U+2028, U+00AD. Tes lama 21 (E) disesuaikan untuk F18-02. Hasil suite penuh: `evidence/f19/npm_test_penuh.txt`.

## 6. Berkas
`server/{ingest,record,runs,products,accounts,app}.js`, `compiler/compiler-f8.css`, `shell/{shell.css,record.js}`, `scripts/cek_teks_lama.mjs`, `tests/25_*.js`, `tests/21_*.js` (satu baris); `docs/URS_v0.3.md`, `docs/RTM_v0.3.md` (REQ-094..096, RENCANA).
