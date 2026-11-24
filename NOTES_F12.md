# NOTES_F12 (BRAHMA, 24 Nov 2026) - cabang feat/compile-s1, lokal, tanpa push/deploy

Kartu t_a953a104. **Revisi INDRA/Wahyu di tengah kerja (berlaku di atas badan kartu):** (a) poin 4 (lupa kata sandi lewat email) DIBATALKAN: tidak ada SMTP, nodemailer, `/forgot`, `/reset`; kata sandi diubah admin. (b) **Tiga akun**, bukan dua: Formdev, Andev (penulis) dan Admin (admin).
Bagian email sempat dikerjakan lalu **dibuang seluruhnya** (kode, migrasi, dependensi); tes 19 membuktikan tidak ada jejaknya.

## Yang dibangun
1. **`scripts/user_admin.mjs seed-env --env-file <berkas>`**: membaca 9 variabel (`FORMULATION_PHAROS_*`, `ANDEV_PHAROS_*`, `ADMIN_PHAROS_*` x EMAIL/USERNAME/PASSWORD), menolak bila ada yang kosong/hilang (pesan hanya menyebut NAMA variabel), menolak berkas di dalam repo. Membuat/memperbarui tiga akun (scrypt N=32768,r=8,p=3), peran penulis/penulis/admin, `must_change_password=false`. Mencetak hanya `dibuat|diperbarui: <nama> <email> peran <peran>`. Idempoten: kunci = nama tampilan; jalan ulang memperbarui email, username, kata sandi, peran, aktif, dan mencabut sesi lama. Memakai `DATABASE_URL` (peran `udt_app` cukup).
2. **Masuk email ATAU username** (tanpa beda huruf besar-kecil), kolom baru `app_user.username` (**migrasi 0006**, expand saja; mundur `db/down/0006_down.sql`, teruji maju-mundur-maju). Galat generik tetap. Rate limit: per (identitas, IP) 5 dan per IP 30 / 15 menit; kunci hitungan = akun hasil pencarian (email dan username akun sama berbagi hitungan). **Kunci per identitas lintas IP DIBUANG** (aturan F10 "20 gagal per email" bisa mengunci seluruh tim pada akun bersama). Kebijakan kata sandi hanya saat ganti kata sandi; sandi dari seed-env tidak diperiksa (hanya tidak kosong, <= 256 karakter).
3. **Nama analis DIKETIK** pada tiap simpan run, impor (xlsx/JSON), ubah, hapus, pulihkan, ingest commit, buat produk, alias: `analyst_name` (header `x-analyst-name` untuk xlsx; dry/pratinjau tidak menuntut). 2-80 karakter, bukan hanya spasi, tanpa karakter kendali; kosong/tidak valid = 400 "Nama analis wajib diisi", tidak ada yang tersimpan. Audit: `audit_event.analyst_id` = nama diketik, `audit_event.user_id` = akun; `/api/runs/{id}/audit` kini memuat `analyst` dan `account`. UI Compiler (kolom Nama analis tidak lagi readonly; dialog Kelola run dan Run terhapus punya isian) dan dialog Kirim di Studio mengingat nama di `sessionStorage` dan masih bisa diubah. `/api/me` tidak lagi mengembalikan `analyst`.
4. **Panel Pengguna / akun lain:** kode dipertahankan. Formulir "Tambah pengguna" disembunyikan dan `POST /api/admin/users` = 403 kecuali env `UDT_ALLOW_ACCOUNT_CREATE=1` (tidak diset di produksi) = tidak ada jalan membuat akun lewat UI/API. Admin tetap bisa daftar, ubah peran, nonaktif, dan setel ulang kata sandi akun lain (sementara, wajib ganti). Ganti kata sandi sendiri tetap ada.
5. Dokumen: KONTRAK_API_COMPILER (butir masuk, jejak, nama analis, lampiran F12), DS-20, FS-04, URS dan RTM (catatan F12). RTM `.csv/.xlsx` tidak dibangkitkan ulang.

## Yang dibutuhkan INDRA saat menjalankan
- Berkas env lokal **di luar repo** berisi 9 variabel di atas (dibuat Wahyu; agent tidak pernah melihat nilainya). `npm run migrate` (0006), lalu `DATABASE_URL=... node scripts/user_admin.mjs seed-env --env-file <path>` di staging dan produksi.
- Sesi lama tidak sah setelah seed (token_version naik); akun F10 lama (bila ada) tetap ada dan tidak disentuh: nonaktifkan lewat `user_admin.mjs deactivate` bila tidak dipakai.
- Tidak perlu env SMTP/APP_BASE_URL.

## Tes
Seluruh suite: lihat evidence/f12/01_tes_penuh.txt (angka di laporan penutup). Tes lama diadaptasi, bukan dibuang: pembantu klien uji mengetik nama analis otomatis (opsi `analyst: null` untuk uji penolakan); tests/03,04 (versi skema 6), 10 (header nama pada xlsx), 14 (UI), 17 (akun admin membuat lewat env uji, kunci per email dibuang, hak kolom, migrasi 0005 diuji pada dir <= 5). Baru: `tests/19_f12_akun_bersama.test.js` (15 tes).

## Keterbatasan jujur
- **Nama diketik = deklarasi.** Di akun bersama tidak bisa dibuktikan siapa orangnya (dua orang bisa mengetik nama yang sama atau nama orang lain). Jejak membuktikan AKUN, bukan orang. Diterima Wahyu (keputusan kartu), tercatat di kontrak.
- **Tanpa kunci per identitas saja:** serangan tebak kata sandi terdistribusi (banyak IP) tidak dihentikan batas laju (hanya 5/IP dan 30/IP); satu-satunya penahan = kekuatan kata sandi + biaya scrypt. **Karena kebijakan tidak dipaksakan pada sandi seed**, kata sandi Wahyu harus panjang dan acak. Perlu keputusan bila ingin pemantauan/peringatan lonjakan gagal masuk.
- Tangkapan layar UI tidak dibuat (peramban harness menolak localhost sejak F8); verifikasi UI = tes statis + tes fungsi. UI belum dilihat mata.
- Baris `analyst` dari nama diketik dibuat per nama unik (tidak ada pembersihan); `analyst_identity` (view F10) memetakan nama yang tak punya akun ke `import/sistem` (secara semantik "legacy"); jejak akun yang benar ada di `audit_event.user_id`, bukan view itu. Tabel `run`, `compile`, `run_removal` hanya menyimpan nama diketik (tanpa kolom akun); akun hanya tercatat di `audit_event`.
- Proses `node.exe` lain di mesin ini sempat terhenti saat saya menghentikan lari tes yang tersangkut (`taskkill /IM node.exe`); mohon periksa bila ada layanan node lain yang mati.
- Belum diuji di Vercel (sama seperti F10).

## Pertanyaan keputusan manusia (tidak diputuskan di sini)
1. Akun F10 lama (bila ada di staging/produksi) dinonaktifkan atau dibiarkan?
2. Perlu pemantauan/peringatan untuk lonjakan gagal masuk lintas IP (pengganti kunci per identitas)?
3. Perlu syarat panjang minimal pada kata sandi seed-env (sekarang tidak ada, sesuai kartu)?
4. Akun Admin juga menulis data (admin otomatis boleh menulis); apakah admin sebaiknya dipisah dari penulisan?
