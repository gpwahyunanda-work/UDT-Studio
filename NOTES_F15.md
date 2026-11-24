# NOTES_F15 (BRAHMA, 24 Nov 2026) - cabang feat/compile-s1, lokal, tanpa push/deploy

Kartu t_5005039a. Dasar HEAD 0a3d4c2 (F14). Studio tidak berubah (`index.html`, `UDT Studio.html`, `modules.lock`, `server/step4.js` tanpa diff).

## A. /record: penelusur + CRUD terkontrol
| Hal | Keputusan |
|---|---|
| Lapisan | `server/record.js`; rute `/api/record/tables[...]` (kontrak: KONTRAK_API_COMPILER.md, bagian 3.0 dan Lampiran F15). Halaman `/record` (`shell/record.js`, `shell/record.css`), keadaan tampilan di hash alamat. |
| Daftar putih | 23 tabel dasar + kolom tampil + kolom disembunyikan. Uji A1 membandingkan dengan katalog PostgreSQL nyata: tabel atau kolom baru WAJIB diputuskan (tampil/disembunyikan) atau tes gagal. |
| Tidak pernah tampil | `password_hash`, `token_version`, `ip_hash`, `email_key` (+ `must_change_password`, `last_login_at`, `username`, `is_system`, `created_at` milik `app_user`). `app_user` = nama, email, peran, aktif. Uji C1 mencari NILAI asli (hash, ip_hash, email_key dari basis data) di semua respons semua tabel + CSV + daftar: tidak ada. |
| Admin saja | `app_user`, `audit_event`, `audit_change`, `login_attempt` (tanpa IP), `schema_migration`. Non-admin: 403 (daftar tabel tidak memuatnya). |
| Baca | 50 per halaman (tetap), cari (semua kolom), urut, filter kolom (mengandung) + filter persis (tautan lompat FK), CSV tabel yang sedang dilihat (maks 20.000 baris, BOM, CRLF), PK/FK/tipe di metadata. Halaman melewati batas dijepit. |
| Injeksi | Nama tabel, kolom urut/filter, `dir`, `page`, parameter lain dicocokkan ke daftar putih (400/404 tanpa menyentuh SQL); nilai selalu parameter terikat (D1). |
| CSV injection | Awalan `=` `+` `-` `@` tab CR diberi `'`; angka sah pada kolom angka tidak diubah (negatif tetap angka). |
| Tulis | Hanya `compile`, `medium`, `batch`, `compile_alias` (tambah + ubah kolom deskriptif) dan `run` (ubah `note`, `variant`, `manufacturer_site`, `is_valid`, `invalid_reason`; hapus lunak + pulihkan). `analyst_name` diketik + `reason` wajib; `audit_event` + `audit_change` (lama/baru); kunci optimistik `row_token` (409 + baris terbaru); peran penulis/admin. |
| Hapus | Hanya hapus lunak (`run_removal`, mekanisme yang ada). Tidak ada metode DELETE, tidak ada SQL DELETE di `server/record.js` (tes), peran `udt_app` tanpa DELETE pada tabel apa pun (tes). Run `ditimpa` tidak bisa dipulihkan dari Record. |
| Hanya baca | `run_value`, `run_timepoint` (nilai terukur) dan `comparison`, `comparison_point`, `import_check` (turunan: f2, total, n): 403 `read_only` + tombol **Perbaiki lewat Studio/Timpa** (ke `/studio`). Alasan ALCOA+: data asli dan keterlacakan; koreksi = kirim ulang dari Studio dengan Timpa, run lama tetap tercatat. Tabel jejak/asal/kode/akun juga hanya baca. Admin dapat membuka akun dan audit tetapi tidak mengubah hash dari Record. |
| Koreksi API (permintaan INDRA) | `compile.api` dan `api_uncertain` dapat diubah penulis/admin (nama diketik + alasan). Mengubah `api` tanpa menyebut `api_uncertain` otomatis menjadikannya `false` (perubahan terpisah di jejak). Dashboard: catatan "Zat aktif belum pasti" kini hanya bila `api_uncertain` = true. Uji G2 dan E2E (di bawah): ubah API Vastrol -> "API belum pasti" hilang di Compiler. **Data Vastrol tidak diubah di repo atau pembaca sheet**; INDRA mengoreksinya lewat Record saat produksi. |
| Migrasi 0007 | Hanya hak `UPDATE` per kolom (compile 7, medium 6, `batch.brand_name`, `run.manufacturer_site`, `compile_alias` alias+alias_key); maju + `db/down/0007_down.sql`, diuji maju-mundur-maju dengan data (I1). **Wajib dijalankan di produksi sebelum Record dipakai menulis** (tanpa itu tulis gagal `42501` -> 500). |

## B. /architecture
- `architecture/` (9 diagram archify + `index.json` + `ERD_relasi.md/.csv`; berkas GANESHA F15a, kini ikut komit) masuk `GATED_DIRS`/`GATED_PATTERNS` (`scripts/public_manifest.mjs`): tersaji hanya setelah masuk, tidak ada di keluaran publik (tes H3 + `scripts/check_exposure.mjs`).
- `/architecture` = kartu dari `index.json` (dirender server), filter Semua/Analis/Teknis (4 analis, 5 teknis), tombol Buka diagram -> bingkai sama-asal (`?embed=1&theme=`); `/architecture/{id}.html` memakai header bingkai sama-asal (SAMEORIGIN + `frame-ancestors 'self'`), halaman daftar tetap DENY. CSP tidak dilonggarkan. ERD: tautan **Tabel relasi (teks)** -> `/architecture/erd-relasi` (Markdown di-escape; 33 relasi).
- Tes H3: tanpa rahasia (pola URL basis data, kunci, token, scrypt), tanpa sumber luar yang dimuat, hash `index.json` cocok berkas.
- **Isi diagram belum diperbarui:** diagram arsitektur/alur/urutan Masuk masih menandai Beranda/Record/Architecture "direncanakan" (dibuat sebelum F14/F15). Perlu satu putaran GANESHA (archify) agar cocok dengan HEAD ini. ERD (23 tabel, 33 FK) tidak berubah oleh F15 (hanya hak kolom).

## C. Temuan keamanan yang ditutup (ditemukan oleh tes F15)
**Path traversal Windows di jalur gated:** `/compiler/..%5cserver%5capp.js` lolos pemeriksaan `..` (garis miring terbalik = pemisah jalur di Windows) lalu `normalize` keluar folder dan menyajikan `server/app.js` setelah masuk. Ditutup di `server/pages.js` (`gatedFile` menolak `\`, `.`, `..`; setelah normalisasi jalur harus tetap cocok pola gated). Uji di H2 untuk `/compiler`, `/shell`, `/studio-ext`, `/architecture`. Pada Vercel (Linux) jalur itu tidak keluar folder, tetapi perbaikannya berlaku di semua platform.

## D. Aturan RSD = Langkah 4 (jawaban tim P-2; komentar INDRA)
- `rsdLimit()` (20% untuk <= 10 menit, 10% lainnya) dihapus dari `server/dashboard.js` dan `server/products.js`. Pengganti `rsdOutOfLimit` di `server/lib/udtBridge.js`: satu profil dievaluasi terhadap dirinya dengan `evalSimilarityF2` Studio (via `udtBridge`) lalu titik yang dilaporkan Studio dibaca. Tanpa angka batas di server (tes K1 memeriksa sumber).
- **Apa persisnya "titik pertama" di Studio** (`index.html` `evalSimilarityF2`): `limit = (i === 0) ? 20 : 10` dengan `i` = indeks dalam daftar `times` yang dievaluasi, JADI titik pertama profil (bukan "menit <= 5"; bila run mulai di 10 menit, titik itu yang 20%); hanya titik sampai pemotongan 85% (`n`) yang diperiksa. Untuk temuan satu run, profil dibandingkan dengan dirinya sendiri (pemotongan menurut run itu); pada pasangan uji-pembanding di Studio pemotongan bisa lebih awal.
- Tes K1: untuk 5 sheet (Vastrol, Empagliflozin 10 dan 25, Zemyc, Gionix) himpunan temuan RSD = hitung ulang dengan `evalSimilarityF2` dari `index.html` yang dimuat apa adanya (`loadPageHost`), termasuk menit dan batas pada teks.
- **Selisih jenis temuan "Perlu dicek" (evidence/f15/rsd_selisih.md, `scripts/f15_rsd_diff.mjs`):** run ditandai RSD lama -> baru: Empagliflozin 10 mg 1 -> 0; Empagliflozin 25 mg 0 -> 0; Gionix 16 mg 10 -> 13; Vastrol 20 mg 3 -> 4 (+F0066A26A pH 4,5: 10,9% pada 10 menit); Zemyc 150 mg 24 -> 26; total titik di atas batas 106 -> 119. Pola: titik 10 menit kini dibatasi 10% (dulu 20%) sehingga banyak titik baru; titik setelah pemotongan 85% tidak lagi diperiksa (mis. Empagliflozin F0023C26A pH 6,8: 3 titik lama hilang). Kedelapan temuan tim di tests/12 tetap ada; hanya teks tiga temuan RSD yang berubah (tests/12 diadaptasi, bukan dibuang).
- Pratinjau Tambah data run: teks "RSD semua titik dalam batas" tidak lagi menyebut angka batas.

## E. Poles UI dari penilaian INDRA (F14)
1 Pengguna dobel: dihapus dari bilah langkah (hanya sidebar, hanya admin). 2 Tombol Tambah data run: sebabnya `style.display = ''` menghapus `inline-flex`; kini `'inline-flex'`, teks sejajar (diukur: 247 = 247 px). 3 Judul panel `Profil rerata, {berdata} medium` + `Air: belum ada data`. 4 Header kolom tanpa data: `Tanpa data` (gaya sama). 5 Chip 13 px tebal, tick 12 px, label `85%` 12 px (diukur lewat DOM), garis 85% lebih gelap dan 1,5 px. 6 Beranda: tanpa lencana "Segera hadir", tombol `Buka ...` seragam, satu H1 (judul ganda dihapus), logo 64 px di halaman dan 34 px di sidebar, satu baris "UDT = Uji Disolusi Terbanding"; "kelola run" menjadi "kelola data uji". 7 Studio dalam iframe: hanya satu bilah atas terlihat (tangkapan layar), tinggi bilah sidebar (54) dekat bilah Studio. 8 RSD: bagian D. Tidak dikerjakan: P-4 hanya disetujui tim (tombol Ubah/Hapus/Pulihkan ada di Record; tombol Cetak sudah di Compiler).
Dan C-1 INDRA (kontrak `POST /api/admin/users` diperjelas) serta C-2 (entri `run_create` per run; tests/16, 18, 19 diadaptasi).

## F. Bukti
- `evidence/f15/05_tes_penuh.txt`: suite penuh **188/188 lulus** (169 lama + 19 baru di `tests/21_f15_record_architecture.test.js`; 0 dilewati). Tes lama diadaptasi karena perilaku sengaja berubah: 03/04/19 (versi skema 7), 12 (teks RSD), 16/18/19 (jejak run kini dimulai `run_create`), 17 (kontrak peran, hak kolom, tanpa `navU`), 20 (halaman Record/Architecture bukan lagi "segera hadir", satu H1).
- `evidence/f15/f15_*.png` (1366x768, terang dan gelap: Beranda, Record compile/run/dialog, Architecture, diagram ERD terbuka, ERD relasi, Compiler, Studio), `f15admin_*` (1920, admin: Compiler, run_value hanya baca), `f15_dom.json`.
- `evidence/f15/e2e_*.png` + `e2e_hasil.json`: **E2E DOM nyata di Chrome agen (14/14)** lewat `scripts/f15_e2e.mjs` (basis data dev): validasi dialog tanpa nama/alasan, simpan, API belum pasti hilang di Compiler, konflik 409 di dialog, hapus lunak + pulihkan, tabel hanya baca.
- `evidence/f15/rsd_selisih.md`, `check_exposure.txt`.

## G. Keterbatasan jujur
- Skill `ui-ux-pro-max` tidak dijalankan; tinjauan visual lewat Chrome agen + analisis visual + DOM; belum ada tinjauan manusia.
- Hapus lunak hanya untuk `run`. `compile`, `medium`, `batch`, `compile_alias` tidak punya mekanisme hapus lunak di skema (tidak ada kolom `is_deleted`); menambah kolom itu berarti migrasi + penyaringan di Compiler, di luar kartu ini. Salah buat = ubah nilai atau tandai sebagai alias/catatan; usul untuk INDRA.
- Ubah medium/batch/compile hanya kolom deskriptif; mengubah `product_name`/`strength`/`dosage_form` mengubah kunci produk (`name_key`); duplikat = 409. Belum ada peringatan dampak di UI selain pesan konflik.
- `row_token` menutup konflik antarpengguna; dua tab milik orang yang sama juga terdeteksi. Token bukan rahasia (md5 isi baris yang sudah tampil).
- Nilai `pct` ditampilkan apa adanya (tanpa pembulatan; "tanpa skala" menurut desain data).
- CSV maks 20.000 baris (`X-Truncated: 1`); tabel terbesar saat ini `run_value` 3.837 baris.
- UI Record berbahasa Indonesia, nama kolom/tabel tetap nama basis data (sengaja, untuk penelusuran).
- Tes C1-C3 di tests/20 butuh Chrome agen di 9222 (dilewati bila mati; kali ini aktif dan lulus). `scripts/f15_e2e.mjs` dan `scripts/f15_visual.mjs` manual (bukan bagian `npm test`).
- Menjalankan suite penuh mengubah kata sandi peran `udt_app` di Postgres uji; server dev lokal (port 8795, `.dev/`) harus dibuat ulang (`.dev/f15_setup.mjs`) sesudahnya.
- `evidence/f15/_try/` berisi tangkapan layar percobaan (t_*.png), sama seperti `evidence/f14/_try/`: tidak dihapus karena aturan larangan hapus rekursif; abaikan.

## H. Untuk INDRA (tidak dikerjakan di sini)
1. Jalankan migrasi 0007 di produksi SEBELUM memakai tulis di Record. `vercel.json` berubah (rewrite `/architecture/:path*`, header `/architecture/(.*)\.html`, grup aset + `architecture`): belum diuji di Vercel; mohon cek bahwa CSP/X-Frame-Options diagram `.html` tidak ditimpa grup `/(.*)` dan bahwa bundel fungsi memuat `server/gated/architecture/` (~7 MB).
2. Minta GANESHA memperbarui diagram arsitektur/alur/urutan Masuk terhadap HEAD ini; temuan F15a-T1 (`products.js` komentar vs `ingest.js:239`) dan REQ-050/059 stale belum diurus.
3. Koreksi Vastrol (Rosuvastatin Calcium, A-24) lewat Record (penulis/admin, nama + alasan) saat produksi.
4. Putuskan hapus lunak untuk master (usul kolom `is_deleted` + penyaringan Compiler) bila diperlukan.
5. hotspot: `server/app.js` (satu fungsi `handle` > 320 baris, tiap fitur menambah blok) dan `compiler/app.js` (satu berkas ~800 baris inline): sebaiknya dipecah sebelum fitur berikutnya.
