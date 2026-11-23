# NOTES F6: HTML tim dipasang sebagai UI Compiler (kartu t_6a9b9222)

Tanggal 23 Nov 2026. Tanpa push, tanpa deploy. Semua lokal. Skill dimuat: draft-review-commit tidak dipakai (berkas kerja proyek, lokasi final disebut kartu), browser-use (bukti layar), token-saver, ponytail.

## Hasil
- **UI = HTML tim** (`compiler/index.html` + `compiler.css` + `app.js` vanilla). CSS tim dipakai apa adanya; hanya `@font-face` lokal ditambahkan (Inter, Space Grotesk, OFL). Eyebrow "UDT Compiler" (keputusan Wahyu). Tanpa CDN. Tanpa `var D` tertanam.
- **Server menghitung semuanya.** Klien tidak punya rumus f2/rata-rata/RSD (diuji). Modul Langkah 4 dan `lib/` pindah ke `server/` (`server/step4.js`, `server/lib/`); sumber fungsi tidak berubah, hash `modules.lock` sama.
- **Dua nilai f2** per perbandingan: `f2_sheet` (`server/f2tim.js`, aturan tim: 3 titik pertama setelah 0, n = 3, bawaan tampilan) dan `f2_langkah4` (fungsi asli). Beda kesimpulan atau selisih > 1 muncul sebagai "Beda dengan Langkah 4" di Perlu dicek. **Nilai resmi TIDAK diputuskan** (Q-16/A-23, menunggu Yonathan).
- Rute baru: `/api/products` (+ `:id`, `/dashboard`, `/runs/preview`, `/runs`, `/export`, `/match`). `/api/compiles/*` dan `/api/ingest/*` tetap. Penulisan = hanya penulis, nama analis wajib; pratinjau tidak menulis.
- UI React F4b/F4c diarsipkan ke `ui-lama/` (tidak dihapus, tidak disajikan; tes lamanya di `ui-lama/tests-lama/`).
- Studio: `studio-ext/kirim.js` memakai kontrak baru; tautan "Buka Compiler" ke `/compiler?p=<produk>`.
- Dokumen: `docs/KONTRAK_API_COMPILER.md` (contoh = respons server nyata, data Vastrol), `URS/FS/DS/RTM_v0.3` (dibangkitkan `kerja/f6/build_v03.py` dari `kerja/f2/spec_*.py` + `kerja/f6/spec_f6.py`; v0.1 tidak diubah; build: 0 masalah keterlacakan; REQ 79, FS 49, DS 16, uji 93).

## Bukti
- `npm test` (lingkungan bersih, `UDT_FIXTURE_DIR=../data/sheets/csv`): **86/86 lulus** [LAPTOP]. Baru: tests/12 (f2 tim + dashboard, 7), 13 (kontrak API, 10), 14 (HTML tim, 7). Tes 01 dan 05 disesuaikan ke jalur baru; tes UI React lama pindah ke `ui-lama/tests-lama` (tidak dijalankan).
- f2 tim mereproduksi README: Crestor vs Ezero 44,1 / 46,7 / 66,5; F0066A26A 63,3 / 36,9 / 81,9.
- `evidence/f6/`: `tim_dashboard.png`, `terpasang_dashboard.png`, `sandingan_dashboard.png`; `tim_form.png`, `terpasang_form.png`, `sandingan_form.png` (bridge about:blank karena alat peramban menolak 127.0.0.1; data diimpor dari lima sheet ke DB lokal `udt_f6`).
- Catatan dasar: tes lingkungan: jalankan `npm test` TANPA `source .dev/env_f6.sh`; dengan env itu tes 11 (dump-restore) gagal "terminating connection" karena memakai DB dev.

## Perbedaan yang terlihat pada sandingan (jujur; tidak disembunyikan)
1. **Perlu dicek**: terpasang 10 baris vs tim 8: dua tambahan F6 yang disengaja (zat aktif belum pasti; Beda dengan Langkah 4). Delapan baris tim ada.
2. **Subjudul API**: tim "API Rosuvastatin"; terpasang "API belum pasti (sheet menulis Ondansetron HCl)" (dari sheet impor). Q-20.
3. **RSD titik 30 menit**: mockup tim berbeda dari hitung ulang Langkah 4 (sampel SD) pada sel titik 30' (mis. F0048B26A pH 1,2: tim 0,51%, hitung ulang 5,99%); rata-rata dan RSD titik lain sama. Server memakai hitung ulang. Sebab angka tim belum diketahui (Q-17).
4. **Formulir, contoh data mockup**: f2 36,9 Not Similar sama; "jumlah kuadrat selisih" tim 1000,48 vs terpasang 998,89 dan rata-rata 30' tim 86,0 vs 85,9 (hitung dari tiga nilai = 85,9). Sebab di mockup tim belum ditelusuri. Terpasang menambah catatan "Nilai Langkah 4 ... 36,6, n = 2".
5. Tanggal awal rentang: bukti layar lama memperlihatkan 10 Feb (tim 11 Feb); diperbaiki di `server/dashboard.js` (tanggal baris = tanggal terawal antar-medium; diuji di tests/12). Tangkapan layar belum diulang setelah perbaikan.
6. Teks medium/alat dari sheet nyata ("Buffer Acetate pH 4,5", "2 (Paddle) · 50 rpm", "900 ml") berbeda tulisan dari mockup tim; ini data, bukan tampilan.
7. Banner biru mockup ("Run ... masuk database") tidak ada di terpasang; banner terpasang muncul hanya setelah simpan nyata.
8. Tampilan vertikal tombol "Tambah data run" yang dilaporkan model visi (agak naik): belum diperiksa piksel; tidak terverifikasi.

## Tidak diverifikasi / belum
- Cetak/PDF satu halaman (F4c) dan ekspor PNG/SVG tidak ada di HTML tim; tidak dipasang (Q-19). Jalur API ubah/hapus/pulihkan tetap dan diuji (tests/10).
- Tangkapan layar peran pembaca (OQ-37) belum diambil; peran pembaca diuji lewat API.
- Tampilan di ponsel/layar sempit tidak diuji.

## Pertanyaan keputusan untuk manusia (jangan diputuskan agent)
Q-16 f2 resmi (Yonathan); Q-17 RSD 30'; Q-18 jadwal titik; Q-19 tombol yang hilang; Q-20 zat aktif Vastrol.

## Jalankan
`node server/node-server.mjs 8791` dengan env DB; lihat `.dev/env_f6.sh` (rahasia tidak dicatat di sini). Dev-only; tidak ada kredensial di repo.
