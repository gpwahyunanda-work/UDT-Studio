# NOTES F24: Ekspor Excel sesuai Master Template resmi

Dasar: paket Pak Yonathan (`data/request_yonathan_27nov/handover-udtpharos/`): Master_Calculation, Master_Report, Master_Summary, dan REFERENSI_PEMETAAN_SEL_UDT_STUDIO.md. Dikerjakan lokal di `feat/compile-s1` (tanpa push, tanpa deploy, tanpa migrasi basis data).

## Apa yang berubah

| Berkas | Isi |
|---|---|
| `server/templates/` | Tiga template resmi, salinan byte-identik dari paket (tes P4 memeriksa hash; berkas asli tidak disentuh). |
| `server/lib/xlsxTemplate.js` | Pengisi template langsung di tingkat paket OOXML (JSZip + XML). Tidak memakai exceljs untuk menulis, karena exceljs membuang grafik/gambar saat memuat ulang berkas, sedangkan Master Report dan Summary membawa grafik profil disolusi dan logo. Gaya, merge cell, border, grafik, dan rumus tidak disentuh. Rumus bersama (`t="shared"`) diurai jadi rumus biasa. Klon tab = salin sheet + relasi. |
| `server/lib/xlsxEval.js` | Evaluator rumus (fast-formula-parser, MIT) untuk mengisi cache nilai rumus (penampil tanpa hitung ulang tetap menampilkan angka) dan untuk tes paritas. |
| `server/exportTemplates.js` | Pembangun Calculation, Report, Summary dari data compile yang sama dengan matriks Compiler (`withOfficialF2`: f2 resmi = Langkah 4, blok ditahan tanpa angka). Modul ini tidak menghitung f2 sendiri. |
| `server/app.js` | `/api/products/:id/export?format=` ditambah `calcreport` (zip) dan `summary` (xlsx). Format lama `xlsx`, `csv`, `tsv` tidak berubah. Template tidak cocok: 422 dengan pesan Indonesia, bukan 500. Butir yang dilewati dikirim di header `x-catatan-ekspor` dan di `CATATAN.txt` dalam zip. |
| `compiler/index.html`, `compiler/app.js` | Tombol "Ekspor ke sheet" diganti "Unduh hasil" dengan tiga pilihan berlabel bahasa analis plus keterangan: Calculation & Report (Excel, .zip), Summary (Excel), Data mentah (.csv, .tsv). Menu dibuka dari sisi kiri tombol (sebelumnya terpotong, ditemukan lewat tangkapan layar). |
| `tests/32_f24_ekspor_template.test.js`, `tests/helpers/demoPkg.js` | Tes F24 (P1-P6). `tests/14` disesuaikan: label "Ekspor ke sheet" tidak lagi dicari. |
| `scripts/f24_serve.mjs`, `scripts/f24_shot.mjs` | Alat bukti tangkapan layar (bukan bagian rilis). |

Dependensi baru (lisensi): `jszip` 3.10.2 (MIT atau GPL-3.0-atau-lebih-baru; dipakai di bawah MIT), `fast-formula-parser` 1.0.19 (MIT), `saxes` 5.0.1 (ISC, devDependency untuk tes keutuhan XML). `exceljs` 4.4.0 (MIT) sudah ada dan tetap dipakai untuk format xlsx lama.

## Tiga unduhan

1. **Calculation & Report**: zip berisi, per kode medium, satu workbook Calculation (satu tab per batch uji dan pembanding, REF di depan) dan satu workbook Report (satu tab per pasangan uji vs pembanding). Nama berkas memuat produk, batch, medium.
2. **Summary**: satu workbook, satu tab per medium (dan per pembanding bila ada lebih dari satu pembanding; per halaman maksimum 11 batch uji karena template memuat 12 blok). Blok `k`, `s = 14 + 23*k`; blok kosong dikosongkan dan baris di bawahnya disembunyikan.
3. **Data mentah**: .csv dan .tsv lama, dipertahankan.

## Peta sel yang diterapkan

- **Calculation** (74x16, per batch): E3-E12 (produk, batch, API, medium, alat, jenis, tanggal, metode), N8/N11 tanggal, baris 21 (label menit), D22:L33 (% terlarut per vessel, maksimum 12 vessel, 9 titik), baris 38 dan 54 (label), blok 39-50 dan 55-66 (rumus template: koreksi dan kumulatif), baris 67-71 (Min, Max, Average, SD, %RSD sebagai rumus Excel asli). Blok ditahan: baris label terisi, sel angka kosong, catatan di B35.
- **Report** (105x15, per pasangan): E8-E15 (referensi, uji, medium, volume, alat, rpm, metode, **E15 Method Reference**), C20/C24 nama dan batch, C23/C27 pabrik, baris 19 dan 83 (menit), D63+ (vessel Reference), D84+ (vessel Test), baris 75-78 dan 96-99 (Average, Min, Max, %RSD), baris 46, 47, 54 (selisih dan selisih kuadrat), G48 sum kuadrat, G49 n, G50 A, G51 f2, G52 batas, G53 kesimpulan, G55-G57. Semua hitungan = rumus Excel template; modul hanya menulis masukan.
- **Summary** (blok `k`, `s = 14 + 23*k`): A/B (tanggal, batch, pabrik), E..K baris `s+7..s+18` (vessel), baris `s+19..s+22` (Average, Min, Max, %RSD), N..T baris `s` (selisih kuadrat), M/N `s+1..s+4` (Total, n, A, F2), U`s` (kesimpulan). Header D4-D10 (medium, API, volume, alat, rpm, metode, method ref).

## Nilai dan pembuktian (bukti di `evidence/f24/`)

- Satu sumber nilai: data compile yang sama dengan matriks Compiler (f2 resmi Langkah 4, blok ditahan tanpa angka). Rumus template tetap hidup.
- Tes P1 menghitung ulang rumus dari berkas hasil dengan evaluator terpisah dari penghasil, lalu membandingkan (f2, n, Total) dengan dashboard, dan rata-rata + %RSD Calculation dengan profil dashboard: 5 produk nyata (Empagliflozin 10, Empagliflozin 25, Zemyc 150, Gionix 16, Vastrol 20) + 4 paket `sample-data/demo-package`. Cakupan: 199 tab Report, 36 tab Summary, 191 tab Calculation, semuanya lulus (`paritas_ringkas.json`). Cache nilai di berkas = hasil hitung ulang (toleransi 1e-9).
- Contoh keluaran: `evidence/f24/contoh/` (zip Calculation+Report dan Summary tiap produk). Tangkapan layar menu: `compiler_unduh_hasil.png`.
- Sanitasi formula-injection (P3): awalan `'` hanya pada teks pengguna (produk, batch, analis, catatan, pabrik, dst). Rumus template tidak diubah; tidak ada rumus yang berasal dari teks pengguna.

## Yang belum bisa, dan alasannya

1. **Area dan standar mentah (E14-E16, M14-M18, N22, M22-M27 di Calculation)**: Compiler hanya menyimpan % terlarut, bukan area kromatogram, label claim, pengenceran, atau standar. Sel itu diisi parameter netral (semua 1, % WS dan Area WS 100, volume ganti 0) dan sel Area diisi % terlarut, sehingga rumus template tetap hidup dan hasilnya sama dengan % terlarut Compiler. Penjelasan ada di sel B34 setiap tab Calculation. Faktor koreksi volume ganti nyata baru bisa dipakai bila Studio mengirim parameter itu ke basis data (di luar F24).
2. **Template tidak memuat**: lebih dari 12 vessel, lebih dari 9 titik waktu (Calculation) atau 7 titik (Report dan Summary), run tanpa titik waktu, pasangan uji dan pembanding dengan daftar menit berbeda (Report/Summary). Run itu dilewati dan disebut jelas di toast Compiler, `CATATAN.txt`, dan header `x-catatan-ekspor`. Bila tidak ada satu pun yang muat: 422 berpesan jelas.
3. **Run ditahan saat impor**: tidak berangka di Calculation (sel angka kosong, ada catatan), Report melewati pasangan itu, Summary menulis "DITAHAN saat impor" di kolom kesimpulan.
4. **Template punya galat sumber**: `C70` Report menunjuk pabrik produk uji (`C27`); diganti rumus ke pabrik Reference (`C23`) pada hasil, template asli tidak diubah. Rata-rata 0 membuat %RSD `#DIV/0!` di rumus template (sama dengan Studio); dashboard menampilkan 0.
5. **Pembuktian LibreOffice**: LibreOffice tidak terpasang di mesin ini, jadi hitung ulang memakai evaluator rumus (fast-formula-parser) sebagai "pembaca rumus" yang diizinkan kartu. Membuka berkas di Excel/LibreOffice sungguhan oleh analis belum dilakukan; sebaiknya satu kali dicek manual (tampilan grafik dan cetak) sebelum rilis.
6. **Format tanggal** di Calculation/Report memakai bahasa Inggris (`20 Aug 2026`) agar selaras dengan keluaran Studio.

## Menjalankan tes

```
export UDT_TEST_PG_PASSWORD=$(docker exec udt-f4-pg printenv POSTGRES_PASSWORD)
node --test tests/32_f24_ekspor_template.test.js        # sekitar 1 sampai 2 menit
UDT_F24_DUMP=1 node --test tests/32_f24_ekspor_template.test.js   # ikut menulis contoh ke evidence/f24/
```
Satu proses tes pada satu waktu (sandi peran `udt_app` dibagi).
