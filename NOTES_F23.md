# NOTES_F23: Compiler, login, architecture bersih, skrip pembersihan, impor 10 sheet tambahan

Cabang `f23-compiler` (worktree `../wt-f23`, dasar `60acd7d`). Tanpa push, tanpa deploy, tanpa migrasi (skema tetap versi 7). Bukti: `evidence/f23/`.
Yang disentuh hanya `server/`, `compiler/`, `scripts/`, `tests/`, `architecture/`, dan berkas ini. `shell/` tidak berubah (hanya `server/shell.js`, penyaji halaman Architecture).

## Ringkasan per butir

| # | Butir | Hasil | Berkas utama | Tes |
|---|---|---|---|---|
| 1 | Nama produk dipotong | Selesai. Ringkasan "N batch ... terkompilasi" dan teks kuadran kosong memakai nama utuh (`p.name` = produk + kekuatan + bentuk). Temuan "Data identik" di dashboard juga memakai nama batch utuh (tanpa `firstWord`). Ekspor xlsx A2 memakai label yang sama (sebelumnya bisa mencetak "null" bila kekuatan kosong). | `compiler/app.js`, `server/dashboard.js`, `server/export.js` | 29/1 |
| 2 | Rentang tanggal uji | Selesai. Batas minimum dan maksimum dihitung dari SEMUA run (semua medium, termasuk tidak valid dan ditahan), bukan tanggal tertua per baris. Kontrol diganti dua `<input type=date>` (Dari, Sampai) dengan `min`/`max` dinamis dan bawaan kosong (mencakup semua). Baris lolos filter bila SALAH SATU tanggal run-nya masuk rentang (`row.dates`). Akar masalah: tanggal baris = tanggal tertua antar medium, jadi data 18 Mei di medium lain tidak pernah terhitung. | `server/dashboard.js`, `compiler/app.js`, `compiler/index.html` | 29/2 |
| 3 | Login dan Ganti Sandi | Selesai. Validasi klien sebelum API (identitas dan sandi wajib; sandi baru: wajib, minimal 12 dan maksimal 128 karakter dibaca dari `MIN_PW`/`MAX_PW` server, konfirmasi harus sama, sandi saat ini wajib). Semua pesan tampil di kotak `role="alert"` `tabindex="-1"` dan fokus dipindah ke pesan. Tombol tampilkan/sembunyikan: `<button type="button">` (dapat difokus keyboard), `aria-pressed`, `aria-label="Tampilkan kata sandi: ..."`, indikator fokus. Galat tanpa badan JSON tetap tampil ("kode 500"). Kebijakan server dan pesan generik anti-enumerasi tidak berubah (diuji). | `server/pages.js` | 29/3a-3d |
| 4 | /architecture bersih | Selesai. Dibuang dari 9 diagram HTML, `index.json`, ERD, `ERD_relasi.md`, dan halaman Architecture: hash commit, nama cabang, "GANESHA (F15a)", F-nomor, `repo/architecture/erd.html`, URL dan revisi repositori di blok bukti sumber (diganti `{"verified":false}` sehingga panel "Verified source" tidak muncul). Diganti versi netral "v0.4, 26 Nov 2026" (`index.json`: `versi` 0.4, `dibuat` 2026-11-26). `ukuran_byte` dan `sha256` di `index.json` dihitung ulang. | `architecture/*`, `server/shell.js` | 29/4 |
| 5 | Placeholder tersemat | Selesai. `mis. F0048J26A` dan `mis. F0066A26A` menjadi "Kode batch"; `mis. Kp Tinggi` menjadi "Varian"; `mis. Vastrol`, `mis. 20 mg`, `mis. Tablet` menjadi "Nama produk", "Kekuatan", "Bentuk sediaan". Tidak ada contoh data lain di `compiler/` dan `shell/`. | `compiler/index.html`, `compiler/app.js` | 29/5 |
| 6 | Audit f2/RSD | Lihat bagian "Audit" di bawah. Tidak ada selisih yang pasti salah; lima hal ambigu dilaporkan, tidak diputuskan. | `tests/28_...` | 28 (11 tes) |
| 7 | Skrip purge dan rename | Selesai, diuji pada PostgreSQL lokal. Lihat bagian "Skrip untuk INDRA". | `scripts/purge_compile.mjs`, `scripts/rename_analyst.mjs` | 30 (9 tes) |
| 8 | Impor 10 sheet | Lihat bagian "Impor sheet tambahan". | `server/import/sheetReader.js`, `server/ingest.js`, `server/app.js`, `compiler/` | 31 (8 tes) |

## 6. Audit f2/RSD terhadap PerBPOM 11/2022, FDA, EMA (Langkah 4 = resmi)

Dibaca: `server/step4.js` (`evalSimilarityF2`, `classifyF2Outcome`, fungsi Studio yang dipakai server tanpa salinan rumus), `server/lib/udtBridge.js`, `server/ingest.js` (`verifyStudioComparisons`, dipakai `POST /api/ingest/commit`), `server/f2resmi.js`, `server/dashboard.js`, `server/f2tim.js`.

| Aturan | Hasil | Bukti |
|---|---|---|
| Cut-off 85%: titik pertama tempat salah satu produk >= 85% ikut dihitung, titik sesudahnya dibuang | COCOK. Batas `>= 85` (85,0 ikut, 84,99 tidak). | `step4.js` baris 177-200; tes 28/A1, A2 |
| Sangat cepat: KEDUA produk >= 85% pada <= 15 menit, f2 hanya informasi, kesimpulan otomatis Similar | COCOK. `both85at15` -> kode `very_rapid`, label SIMILAR walau f2 mentah < 50. Commit Studio menyimpan `very_rapid` walau Studio mengirim `not_similar` (server menimpa dengan hitungan sendiri). Dashboard menampilkan `rap`. | `step4.js` 168-175, 241-244; tes 28/A3, A4, B1, B2 |
| RSD <= 20% titik pertama, <= 10% titik berikutnya, hanya titik yang ikut f2 | COCOK. Tepat di batas lolos; di atas batas ditandai; titik sesudah cut-off tidak dinilai. Server tidak menyimpan angka batas (dibaca dari Langkah 4 lewat `rsdOutOfLimit`). | `step4.js` 213-225; tes 28/A5, A6, A7, B3 |
| Server menolak f2 Studio yang menyimpang | COCOK. Selisih > 1 ditolak 400; nilai yang disimpan selalu hasil hitung server. | `ingest.js` `verifyStudioComparisons` (sudah ada di tes 04/10) |

Tidak ada selisih yang "pasti salah", jadi tidak ada kode aturan yang diubah. Tes 28 mengunci aturan di atas.

Ambigu (DILAPORKAN, tidak diputuskan, tidak diubah):

1. **RSD melanggar batas tidak mengubah kesimpulan.** `classifyF2Outcome` mengabaikan `rsdExceeded`; di server hanya menjadi temuan "RSD di atas batas" (nada `bad`) dan peringatan di formulir. Pedoman FDA/EMA menyebut f2 hanya sahih bila RSD dalam batas. Perlu keputusan tim apakah sel dengan RSD di atas batas tetap berstatus Similar/Not Similar (kini) atau diberi status "tidak sahih".
2. **Titik cut-off RSD per profil, bukan per pasangan.** `rsdOutOfLimit` mengevaluasi satu profil terhadap dirinya sendiri, jadi pemotongan 85% memakai rerata profil itu saja. Pada f2 sebenarnya pemotongan ditentukan oleh KEDUA produk (titik pertama yang dicapai salah satu). Akibatnya satu profil bisa dinilai RSD-nya sampai titik yang lebih jauh daripada yang ikut f2. Efek: temuan RSD bisa sedikit lebih ketat daripada yang berlaku pada pasangan tertentu.
3. **n < 3 titik tetap disimpulkan.** `evalSimilarityF2` menghitung `minPointsValid = n >= 3` tetapi `classifyF2Outcome` tidak memakainya. Bila cut-off jatuh di titik ke-1 atau ke-2 (satu produk sangat cepat, produk lain belum), f2 dihitung dari 1-2 titik. FDA/EMA mensyaratkan minimal 3 titik. Perlu keputusan: tetap (kini), ditandai, atau "belum dapat dihitung".
4. **">= 85" atau "> 85".** Kode memakai `>= 85` (sesuai teks Indonesia "mencapai 85%"); komentar kode mengutip EMA dengan tanda `>`. Hanya berbeda bila rerata tepat 85,0. Tim P-1 perlu menegaskan.
5. **Pembanding tim (`f2tim.js`).** Penanda "sangat cepat" memakai titik ke-3 (bukan menit 15). Benar pada jadwal baku 5/10/15 menit; pada jadwal lain (mis. 10/20/30) titik ke-3 bukan menit 15. Hanya memengaruhi angka pembanding "hitung ulang tim" pada temuan "Beda dengan sheet lama", bukan angka resmi.

## Skrip untuk INDRA (butir 7)

Keduanya DRY-RUN bawaan, memakai URL PEMILIK (`--url` atau env `DATABASE_URL_UNPOOLED`; peran `udt_app` tidak punya hak DELETE dan tidak boleh mengubah `analyst.name`), URL tidak pernah dicetak. Semua tulis dalam satu transaksi, galat berarti ROLLBACK penuh.

```
# 1) pratinjau (tidak menulis apa pun), tampilkan baris per tabel
node scripts/purge_compile.mjs --compile-id 6 --reason "Hapus data uji Test Empagliflozin 25 Tablet (Agent Log, F23)"
# 2) terapkan: cadangan JSON ke folder DI LUAR repo, lalu hapus + audit
node scripts/purge_compile.mjs --compile-id 6 --reason "..." --apply --backup-dir <folder-di-luar-repo>

node scripts/rename_analyst.mjs --id <analyst_id> --name "INDRA (atas jawaban tim, Agent Log A-24)" --reason "Agent Log A-24"          # dry-run
node scripts/rename_analyst.mjs --id <analyst_id> --name "INDRA (atas jawaban tim, Agent Log A-24)" --reason "Agent Log A-24" --apply
```

`purge_compile`:
- Urutan hapus (anak dulu, sesuai FK): `comparison_point`, `import_check`, `run_source_block`, `comparison`, `run_removal`, `run_value`, `run_timepoint`, `run`, `import_note`, `import_run`, `studio_push`, `batch`, `medium`, `compile_alias`, `compile`.
- Cadangan: `purge_compile_<id>_<stempel>.json` (semua baris terkait per tabel) + `.sha256`, ditulis dan di-fsync dan diverifikasi SEBELUM menghapus. Folder tidak boleh di dalam repo (cadangan berisi data).
- Jumlah baris terhapus per tabel harus sama dengan rencana, kalau tidak, transaksi dibatalkan.
- Audit: `audit_event` aksi `compile_purge` (entity `compile`, `reason` = `--reason`, wajib), plus `audit_change` berisi jumlah baris per tabel dan sha256 cadangan. Riwayat audit lama tidak dihapus. Pelaku audit = analis sistem.
- `import_run` ikut dihapus hanya bila tidak dipakai run compile lain.
- **Tafsiran "run yang bukan uji" (mohon dikonfirmasi INDRA):** saya menafsirkan run hasil IMPOR SHEET (`run.source='sheet'`, data nyata) sebagai "bukan uji"; run dari Studio (`source='studio'`) dianggap data uji. Compile dengan run impor sheet ditolak (juga pada dry-run) kecuali `--force`. Compile 6 (hasil push Studio) tidak terhalang. Bila yang dimaksud lain (mis. berdasar nama "Test ..."), ubah syarat di `collect()`.
- Diuji: dry-run tidak menulis; alasan wajib; folder cadangan wajib dan di luar repo; compile tak ada; penolakan tanpa `--force`; rollback saat audit gagal (pemicu uji); apply menghapus persis yang direncanakan dan compile lain utuh; idempoten (kedua kali "tidak ada"); `--force` pada compile berisi impor sheet.

`rename_analyst`: dry-run menampilkan nama lama dan baru serta jumlah jejak yang menunjuk analis itu; `--apply` mengubah `analyst.name` dan mencatat `analyst_rename` (alasan wajib, `name` lama -> baru). Menolak: analis sistem, nama sudah dipakai analis lain (tidak menggabungkan), nama tidak valid (2-80 karakter, tanpa karakter kendali atau tak terlihat), nama sama. Jejak lama tetap menunjuk `analyst_id` yang sama, jadi seluruh riwayat ikut menampilkan nama baru. `display_name` akun (`app_user`) TIDAK ikut berubah; bila analis itu terkait akun, dry-run mengatakannya.

## Impor sheet tambahan (butir 8)

Perubahan pada PARSER IMPOR saja (rumus Langkah 1-5 tidak disentuh):

- (a) Berkas ditolak kini memberi pesan yang jelas: `Berkas "<nama>" ditolak dan tidak diimpor` dengan `details` berisi penyebab dan jalan keluar. Dua penyebab: nama berkas tidak berpola (isi manual), dan tidak ada tab yang bisa dibaca (menyebut nama tab dan aturan nama tab). Isian manual lewat header `X-Product-Name`, `X-Strength`, `X-Dosage-Form` (di-`encodeURIComponent`) pada `POST /api/imports/xlsx` (juga `?dry=1`); header menimpa hasil nama berkas per kolom; bagian yang terbaca dari nama berkas tidak perlu diisi. UI Compiler: bagian lipat "Isi nama produk manual" di panel Impor sheet lama. (`resolveImportCompile` di `server/ingest.js`.)
- (b) Penguraian nama: "20-10 mg" (garis miring tidak boleh ada di nama berkas, sehingga menjadi strip) dibaca sebagai kekuatan `20/10 mg` (produk `Rosu-Eze`); `Narfoz` + `4 mg` + `FC Tablet UDT`; `Candesartan-Amlodipine` tanpa kekuatan -> isian manual (tidak ditebak). Pemisah tanpa angka sesudahnya, atau tanpa pemisah ("5 mg 10 mg"), tidak digabung.
- Vastrol COPY: tetap compile terpisah (tidak digabung otomatis) dan kini diberi peringatan `W-nama` ("tampak seperti salinan berkas ... putuskan penggabungannya").
- Bug tata letak Microlax (sebab "Microlax 21 ditahan, 11 peringatan"): sheet punya kolom tambahan (header 90 menit di kolom L), sehingga peran ("Reference Product") dan area f2 bergeser SATU kolom ke kanan. Pembaca lama membaca peran dari kolom L (kosong), jadi 2 blok Reference terbaca sebagai "uji" (0 reference, 0 perbandingan, 11 peringatan "run Uji tanpa reference tertaut"). Kini pergeseran dideteksi dari label "Total" pada baris r+1 (bukan ditebak): 2 reference, 7 perbandingan terbaca, penahanan 21 -> 12, peringatan 11 -> 2. Sheet lain tidak berubah hasilnya.

### Tabel per sheet (pratinjau lokal `scripts/f23_pratinjau_impor.mjs`, tanpa DB; bukti `evidence/f23/pratinjau_SESUDAH.txt`, `analisis_tahan.txt`)

"Run" = run yang terbaca (diimpor). "Ditahan" = jumlah catatan penahanan (`hold`). W-19 = blok ditahan karena statistik atas kosong. R-11 = perbandingan sheet (area f2) ditahan; run-nya tetap diimpor, f2 resmi tetap dihitung dari data vessel oleh Langkah 4.

| Sheet | Run | Ref/Banding (sesudah) | Ditahan (sebelum -> sesudah) | Alasan penahanan | Rumus lama yang melewatkan sel | Peringatan |
|---|---|---|---|---|---|---|
| Aprion 150 mg Kapsul | 13 | 4 / 9 | 0 | - | MIN/MAX/STDEV kolom 30' tanpa vessel 1 (27 sel); Total f2 `=SUM(O:T)` melewatkan kolom N (4 dari 9) | 1 (nilai di luar 0-120%); +15 selisih statistik, 4 selisih f2 sheet (catatan) |
| Aprion 75 mg Kapsul | 16 | 8 / 0 | 16 -> 16 (semua R-11) | Area f2 berisi NILAI tanpa rumus (`N37` dst. angka mati), jadi baris pembanding tidak dapat dirunut. BUKAN data rusak: nilai vessel lengkap dan run diimpor. Perbandingan sheet tidak dibaca karena rujukannya tidak terbukti. | 30' tanpa vessel 1 (60 sel); `Total =SUM(O:T)` melewatkan N pada 13 dari 16 | 9 (8 "Uji tanpa reference tertaut" karena perbandingan ditahan + 1 nilai di luar 0-120%) |
| Arcolase 40 mg FC Tablet | 8 | 4 / 4 | 0 | - | 30' tanpa vessel 1 (21 sel) | 0 |
| Blastofen 25 mg Tablet | 50 | 5 / 41 | 4 -> 4 (R-11) | 3 blok: sel `Total`, `n` berisi teks "NA" (sheet menolak menghitung, titik terisi kurang); 1 blok (pH 1,2 baris 313): angka tanpa rumus seperti Aprion 75 | 30' tanpa vessel 1 (138 sel) dan 18 sel kolom lain pada blok pendek | 4 (semua "Uji tanpa reference tertaut") |
| Caltonal 50 mg Kapsul | 20 | 4 / 16 | 0 | - | 30' tanpa vessel 1 (48 sel) | 1 (nilai di luar 0-120%) |
| Candesartan-Amlodipine | 0 | - | 7 -> 7 | Berkas DITOLAK (HTTP 400, kini dengan pesan). Dua sebab: (1) nama berkas tanpa kekuatan -> isi manual; (2) 6 tab bernama per zat aktif ("Candesartan pH 1,2", "Amlodipine pH 1,2", dst.), nama tab tidak dikenal, jadi tidak ada run terbaca. Model data saat ini satu medium per kode per produk dan tidak membedakan zat aktif, sehingga Candesartan dan Amlodipine pada pH yang sama bertabrakan. Tata letak isi tab sendiri tampak standar. | - | - |
| Microlax 5 mg tab | 11 | 2 / 7 | 21 -> 12 | 10 blok W-19: statistik atas (Average/Min/Max) kosong dan RSD `#DIV/0!` di menit awal; 9 dari 10 karena SEMUA vessel bernilai 0 pada menit itu (sheet menghasilkan sel kosong), 1 blok (baris 244, kolom 90') lain sebab. Run tetap diimpor dan nilai vessel utuh. 1 R-11 (baris 221) + 1 "pembanding bukan blok Reference yang terbaca". Keputusan menahan blok W-19 sudah ada di aturan W-19, tidak diubah. | 30' tanpa vessel 1 (27 sel) + 18 sel kolom lain; `Total =SUM(P:U)` melewatkan O | 2 "Uji tanpa reference tertaut" (sebelum perbaikan: 11) |
| Narfoz 4 mg FC Tablet UDT | 45 | 10 / 32 | 3 -> 3 (R-11) | Area f2 berisi teks kesimpulan "Both products dissolved >=85% within 15 minutes..." sebagai ganti angka (kasus sangat cepat), jadi tidak ada angka untuk dibaca. Kesimpulan "sangat cepat" tetap dihasilkan Langkah 4 dari data vessel. | 30' tanpa vessel 1 (123 sel); `Total =SUM(O:Q)` melewatkan sel pada 12 dari 32 | 12 (9 nilai di luar 0-120%, 3 tanpa reference tertaut); +64 selisih statistik, 10 selisih f2 sheet (catatan) |
| Rosu-Eze 20/10 mg Tablet | 8 | 4 / 4 | 0 | - | 30' tanpa vessel 1 (12 sel) | 3 (seluruh nilai vessel identik antar run: kemungkinan salin-tempel, periksa); catatan: 2 selisih zat aktif D5 vs D10, disimpan apa adanya |
| Vastrol 20 mg Tablet COPY | 38 | 2 / 40 | 10 -> 10 | 10 blok pH 1,2 ditahan: label menit di baris judul berisi `#REF!` (referensi rusak di sheet asli), jadi menit tidak diketahui. Menit TIDAK ditebak. Perlu dibenahi di sheet sumber. | 30' tanpa vessel 1 (114 sel) | 3 (`W-nama`: tampak salinan; 2 "seluruh nilai vessel identik"); catatan: 3 selisih zat aktif |

Temuan sistematis pada rumus sheet lama (template yang sama di semua sheet): pada kolom 30 menit, Min/Max/STDEV memakai rentang yang melewatkan vessel 1 (mis. `=MIN(I45:I55)` seharusnya `I44:I55`), sedangkan Average memakai rentang lengkap. Inilah penyebab "tercetak vs hitung ulang" berbeda (`stat_mismatch`) pada kolom 30'. Selain itu `Total` f2 di beberapa blok `=SUM(O:T)` melewatkan kolom pertama (N, titik 5'), sehingga f2 tercetak sheet bisa menyimpang (`sheet_diff`: Aprion 150 = 4, Narfoz = 10, Microlax = 4). Pembaca impor menyimpan nilai vessel mentah dan melaporkan selisihnya; angka resmi dihitung ulang oleh Langkah 4, bukan dari statistik tercetak. Perbaikan rumus sheet adalah urusan pemilik sheet (di luar lingkup).

## Keputusan yang diperlukan (tidak diputuskan di sini)

1. Lima hal ambigu f2/RSD (bagian Audit).
2. Candesartan-Amlodipine: dua zat aktif per tab perlu desain (satu compile per zat aktif, atau kode medium dengan zat aktif). Impor TIDAK dilakukan.
3. Aprion 75 dan sebagian Blastofen/Narfoz: bila perbandingan sheet harus tetap tersimpan, satu jalan yang bisa dibuktikan adalah mencocokkan angka kuadrat selisih tercetak dengan pembanding kandidat secara numerik (tidak dibuat; butuh persetujuan karena menyimpan hubungan yang tidak tertulis di sheet).
4. Microlax W-19 (menit awal semua vessel 0): tetap ditahan atau dilonggarkan.
5. Tafsiran "bukan uji" pada `purge_compile` (lihat di atas).
6. Diagram `/architecture` masih menggambar Beranda/Record/Architecture sebagai putus-putus ("direncanakan") karena disusun sebelum ketiganya terpasang; teksnya dinetralkan, gambarnya belum digambar ulang.

## Catatan teknis untuk INDRA

- Penggabungan: cabang `f23-compiler`. File yang juga bisa disentuh F22: tidak ada (index.html, UDT Studio.html, studio-ext, public/vendor, vercel.json tidak diubah). `server/gated/` dibangun ulang oleh `scripts/build_public.mjs` saat build (tidak dilacak git).
- Pratinjau staging: header `X-Product-Name`, `X-Strength`, `X-Dosage-Form` perlu ditambahkan oleh skrip `udt_import_sheets.py` bila dipakai untuk Candesartan (setelah ada keputusan desain, butir 2 di atas; saat ini tetap ditolak jelas).
- Pengujian memakai PostgreSQL lokal Docker `udt-f4-pg` (port 54339). JANGAN menjalankan dua proses uji bersamaan: `createTestDb` menyetel ulang sandi peran `udt_app` bersama dan proses lain akan gagal autentikasi.
