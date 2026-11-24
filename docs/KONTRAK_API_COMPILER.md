---
proyek: udt-apps
kartu: t_6a9b9222 (F6)
dokumen: KONTRAK API COMPILER
versi: 0.3 (F10: akun per pengguna dan peran; F15: Record dan Architecture)
tanggal: 23 Nov 2026
penyusun: BRAHMA (AI Assisted)
status: DRAF menunggu peninjauan INDRA dan persetujuan manusia (bukan final)
pembaca: non-IT (analis formulasi, Yonathan, Wahyu); bagian teknis ditandai
sumber contoh: respons nyata dari server lokal dengan data Vastrol 20 mg Tablet (sheet "Development of Vastrol 20 mg Tablet.xlsx" yang diimpor); diperiksa oleh tests/13_kontrak_api_compiler.test.js
---

# Kontrak API Compiler

## 1. Apa dokumen ini

Compiler adalah halaman web ("UDT Compiler", alamat `/compiler`) yang dibuat tim dalam bentuk HTML. Halaman itu **tidak menyimpan atau menghitung apa pun sendiri**. Setiap angka dan setiap data yang tampil datang dari **server**, dan setiap tombol simpan mengirim data ke server.

"API" di sini artinya **daftar permintaan yang boleh diajukan halaman ke server beserta jawabannya**. Dokumen ini adalah "kontrak": apa yang boleh diminta, oleh siapa, apa yang harus diisi, apa jawabannya, dan apa arti pesan galat. Bila server atau halaman diubah, dokumen ini diubah lebih dulu dan diuji ulang.

**Cara membaca satu butir:** "Siapa boleh" menyebut peran *pembaca* (hanya melihat dan mengekspor) atau *penulis* (juga menambah data). "Isian" adalah data yang dikirim. "Jawaban" adalah yang diterima, dengan contoh nyata dari data Vastrol.

## 2. Hal-hal yang berlaku untuk semua permintaan

| Hal | Aturan |
|---|---|
| Masuk | **F12:** hanya **tiga akun bersama** (tidak ada akun per orang): **Formdev** dan **Andev** (peran penulis) dan **Admin** (peran admin). Masuk dengan **email ATAU username** (tanpa beda huruf besar-kecil) + kata sandi yang dibuat Wahyu (dibaca `scripts/user_admin.mjs seed-env` dari berkas env lokal; tidak pernah di repo, log, atau jejak). Kredensial sama di staging dan produksi (database terpisah). Sesi 12 jam di cookie HttpOnly yang hanya membawa nomor akun dan versi sesi; **peran, status aktif, dan nama dibaca ulang dari basis data tiap permintaan**. Tidak ada lupa kata sandi lewat email: **kata sandi diubah admin** (panel Pengguna) atau akun itu sendiri lewat Ganti kata sandi. |
| Peran | *Pembaca*: dashboard dan ekspor. *Penulis*: pembaca + tambah, ubah, hapus, pulihkan, impor, dan Kirim dari Studio. *Admin*: penulis + kelola pengguna. Tabel lengkap peran x endpoint di butir 3.0. Penulisan oleh peran yang tidak berhak ditolak **403**; tanpa sesi **401**. |
| Jejak | Tiap penulisan mencatat **akun** (`user_id`: Formdev/Andev/Admin) **dan nama analis yang DIKETIK** pengguna (`analyst_id`), kapan (jam server), dan apa yang berubah. Tidak ada data yang dihapus fisik. |
| Angka | Rata-rata, simpangan (RSD), dan f2 **dihitung server**, bukan halaman. Nilai tidak dibulatkan saat disimpan. |
| Teks | Teks dari server ditampilkan sebagai teks biasa (tidak ada HTML mentah yang dijalankan). |
| Batas | Isi permintaan maksimal 1 MB (berkas impor .xlsx maksimal 4 MB). Maksimal 12 vessel dan 9 titik waktu per run. |
| Asal | Permintaan menulis hanya diterima dari halaman Compiler sendiri (cek asal permintaan). |

### f2 resmi = Langkah 4 (jawaban tim P-1, F17; menggantikan aturan sementara S-2)

Jawaban tim P-1 (Agent Log, 24 Nov 2026 03:43 UTC): *"Angka yang resmi untuk penilaian similar/not similar mengikuti Langkah 4 yang ada pada Dashboard Compiler."* Setiap sel perbandingan membawa **satu nilai resmi** (hasil modul Langkah 4: aturan pemotongan 85%, n titik, sangat cepat; dihitung server dari nilai per vessel lewat `udtBridge`, tanpa rumus baru) dan nilai **pembanding**:

| Nama di jawaban | Isi | Dipakai untuk |
|---|---|---|
| `f2`, `k`, `n`, `total`, `src` (selalu `"langkah4"`) | **Resmi**: Langkah 4 | Matriks, label grafik, chip, KPI Not Similar/Similar, rincian sel, ekspor (xlsx/csv), cetak, PNG |
| `sheet` = `{ f2, k, n, total }` atau `null` | Angka **tercetak sheet lama** (hanya data impor); catatan kecil | Rincian sel dan *Perlu dicek* |
| `f2s` / `ks` | Hitung ulang aturan tim (n = 3). Hanya pembanding | Rincian sel dan *Perlu dicek* (untuk pasangan tanpa angka sheet) |
| `beda_sheet` | `true` bila `sheet` ada dan selisih f2 > 1 (kecuali sangat cepat) atau status berbeda | Menandai sel; baris **"Beda dengan sheet lama"** di *Perlu dicek* |
| `beda_tim` | `true` bila TIDAK ada angka sheet dan hitung ulang tim berbeda > 1 atau status berbeda | Idem |
| `cause` | Penyebab yang dapat dibuktikan dari data: n berbeda; f2 tercetak tidak cocok dengan Total/n tercetaknya sendiri; Total berbeda pada n sama (dengan kuadrat selisih Langkah 4 per titik); atau status saja | Teks *Perlu dicek* dan rincian sel |

Kunci lama `f2l`, `kl`, `nl`, `beda`, `beda_resmi` dan jenis temuan `beda_l4` **dihapus** (isinya kini = `f2`, `k`, `n`). Ekspor (`GET /api/compiles/{id}/export`) memakai f2/Total/n/kuadrat selisih Langkah 4 yang sama; perbandingan tersimpan (tercetak sheet) hanya menentukan pasangan. `GET /api/compiles/{id}/data` tetap memuat nilai tersimpan apa adanya (catatan sumber, bukan angka resmi). Pratinjau run (`POST /api/products/{id}/runs/preview`): `f2.langkah4` = resmi (kini juga `sumsq`), `f2.sheet` = hitung ulang tim (pembanding). Pertanyaan keputusan yang masih terbuka bagi Wahyu/Yonathan: lihat `repo/NOTES_F17.md` (angka README yang berbeda).

## 3. Daftar permintaan

### 3.0 Peran x endpoint (kebenaran; diuji otomatis)

Sumber tunggal: `server/authz.js` (dipakai server dan tes). Kolom: tanpa login, lalu tiap peran. **ya** = lolos pemeriksaan peran (isi permintaan tetap divalidasi: 400, 404, 409 dan seterusnya). **403** = ditolak karena peran. Tes `tests/17_f10_akun.test.js` menjalankan setiap baris untuk empat keadaan (tanpa login, pembaca, penulis, admin) dan membandingkan tabel ini dengan kode.

| Permintaan | Tanpa login | pembaca | penulis | admin | Peran minimum |
|---|---|---|---|---|---|
| `GET /api/me` | 401 | ya | ya | ya | semua yang sudah masuk |
| `POST /api/auth/logout` | 401 | ya | ya | ya | semua yang sudah masuk |
| `POST /api/auth/password` | 401 | ya | ya | ya | semua yang sudah masuk |
| `PUT /api/me/analyst` | 401 | ya | ya | ya | semua yang sudah masuk |
| `GET /api/products` | 401 | ya | ya | ya | pembaca ke atas |
| `GET /api/products/{id}` | 401 | ya | ya | ya | pembaca ke atas |
| `GET /api/products/{id}/dashboard` | 401 | ya | ya | ya | pembaca ke atas |
| `GET /api/products/{id}/export` | 401 | ya | ya | ya | pembaca ke atas |
| `GET /api/compiles` | 401 | ya | ya | ya | pembaca ke atas |
| `GET /api/compiles/{id}` | 401 | ya | ya | ya | pembaca ke atas |
| `GET /api/compiles/{id}/data` | 401 | ya | ya | ya | pembaca ke atas |
| `GET /api/compiles/{id}/export` | 401 | ya | ya | ya | pembaca ke atas |
| `GET /api/compiles/match` | 401 | 403 | ya | ya | penulis ke atas |
| `GET /api/products/match` | 401 | 403 | ya | ya | penulis ke atas |
| `GET /api/compiles/{id}/removed` | 401 | 403 | ya | ya | penulis ke atas |
| `GET /api/runs/{id}/audit` | 401 | 403 | ya | ya | penulis ke atas |
| `GET /api/imports/{id}/report` | 401 | 403 | ya | ya | penulis ke atas |
| `POST /api/products` | 401 | 403 | ya | ya | penulis ke atas |
| `POST /api/products/{id}/runs/preview` | 401 | 403 | ya | ya | penulis ke atas |
| `POST /api/products/{id}/runs` | 401 | 403 | ya | ya | penulis ke atas |
| `POST /api/compiles` | 401 | 403 | ya | ya | penulis ke atas |
| `POST /api/compiles/{id}/aliases` | 401 | 403 | ya | ya | penulis ke atas |
| `PATCH /api/runs/{id}` | 401 | 403 | ya | ya | penulis ke atas |
| `POST /api/runs/{id}/delete` | 401 | 403 | ya | ya | penulis ke atas |
| `POST /api/runs/{id}/restore` | 401 | 403 | ya | ya | penulis ke atas |
| `POST /api/imports/xlsx` | 401 | 403 | ya | ya | penulis ke atas |
| `POST /api/imports` | 401 | 403 | ya | ya | penulis ke atas |
| `POST /api/ingest/preview` | 401 | 403 | ya | ya | penulis ke atas |
| `POST /api/ingest/commit` | 401 | 403 | ya | ya | penulis ke atas |
| `GET /api/record/tables` | 401 | ya | ya | ya | semua peran (tabel khusus admin tidak ikut daftar bagi non-admin) |
| `GET /api/record/tables/compile` | 401 | ya | ya | ya | semua peran; berlaku untuk tiap tabel `{table}`; tabel khusus admin = 403 bagi non-admin (di dalam penangan) |
| `GET /api/record/tables/compile/csv` | 401 | ya | ya | ya | semua peran; sama dengan di atas |
| `POST /api/record/tables/compile/rows` | 401 | 403 | ya | ya | penulis ke atas; hanya tabel master yang diizinkan (di dalam penangan: tabel hanya baca = 403) |
| `PATCH /api/record/tables/compile/rows/{id}` | 401 | 403 | ya | ya | penulis ke atas; hanya kolom daftar putih |
| `POST /api/record/tables/run/rows/{id}/delete` | 401 | 403 | ya | ya | penulis ke atas; hanya `run` (hapus lunak) |
| `POST /api/record/tables/run/rows/{id}/restore` | 401 | 403 | ya | ya | penulis ke atas; hanya `run` |
| `GET /api/admin/users` | 401 | 403 | 403 | ya | admin ke atas |
| `POST /api/admin/users` | 401 | 403 | 403 | ya | admin ke atas (lolos pemeriksaan peran), TETAPI pembuatan akun lewat API dinonaktifkan: admin pun dijawab `403` kecuali env `UDT_ALLOW_ACCOUNT_CREATE=1` (tidak diset di produksi; F12). Bukan jalur kerja. |
| `PATCH /api/admin/users/{id}` | 401 | 403 | 403 | ya | admin ke atas |

Catatan: pratinjau (`.../runs/preview`, `/api/ingest/preview`, impor `?dry=1`) tidak menulis, tetapi tetap hanya untuk penulis ke atas karena bagian dari alur menulis. Jejak perubahan run, daftar run terhapus, kandidat kunci produk, dan laporan impor juga penulis ke atas (data pengelolaan, bukan dashboard).

### 3.1 Masuk dan sesi

| Permintaan | Siapa boleh | Isian | Jawaban |
|---|---|---|---|
| `POST /api/auth/login` | siapa pun | `identity` (email **atau** username; kunci lama `email` dan `username` juga diterima), `password` | `200` + `role`, `display_name`, `must_change_password` dan cookie sesi. Salah: `401` dengan pesan yang **sama untuk semua sebab** (tidak dikenal, salah kata sandi, akun nonaktif, terkunci); waktu jawaban seragam. Batas percobaan salah dalam 15 menit (jendela bergeser): **5** per (identitas, alamat) dan **30** per alamat. **Tidak ada kunci per identitas saja** (satu penyerang tidak boleh mengunci seluruh tim pada akun bersama); email dan username akun yang sama berbagi satu hitungan. Kebijakan kata sandi **tidak** diterapkan saat masuk atau seed-env, hanya saat ganti kata sandi. |
| `GET /api/me` | semua yang sudah masuk | - | `user_id`, `email`, `display_name`, `role`, `must_change_password`, kapan sesi habis. (Tidak ada lagi `analyst`: nama analis diketik pada tiap tulis.) |
| `PUT /api/me/analyst` | semua yang sudah masuk | - | **`410`**: dihentikan. Nama analis diketik pada tiap tulis (`analyst_name`), tidak disimpan di akun. |
| `POST /api/auth/password` | semua yang sudah masuk (juga saat wajib ganti) | `current_password`, `new_password` | `200` + cookie baru; semua sesi lain akun ini mati. `400` bila kata sandi saat ini salah atau kata sandi baru melanggar kebijakan (`details`): minimal 12 karakter, bukan email atau nama, bukan kata sandi umum, beda dari yang lama. `429` bila terlalu banyak tebakan. |
| `POST /api/auth/logout` | semua yang sudah masuk | - | `200`, cookie dihapus, **semua sesi akun ini dicabut**. |

Akun dengan `must_change_password = true` (kata sandi sementara) hanya boleh memakai `GET /api/me`, `POST /api/auth/password`, `POST /api/auth/logout`; jalur lain `403` dengan `must_change_password: true`, dan halaman diarahkan ke `/ganti-sandi`.

### 3.1b Kelola pengguna (hanya admin)

| Permintaan | Isian | Jawaban |
|---|---|---|
| `GET /api/admin/users` | - | `users`: `user_id`, `email`, `display_name`, `role`, `must_change_password`, `is_active`, `last_login_at`, `created_at`. Tidak pernah memuat hash. |
| `POST /api/admin/users` | `email`, `display_name`, `role` | `201` + `user` dan **`temporary_password` (acak, hanya tampil sekali di jawaban ini)**; wajib diganti saat masuk pertama. `409` email atau nama tampilan sudah dipakai (tanpa beda huruf besar-kecil). |
| `PATCH /api/admin/users/{id}` | satu atau lebih: `role`, `is_active`, `reset_password: true` | `200`. Nonaktif = sesi mati seketika. Setel ulang = kata sandi sementara baru (sekali tampil), semua sesi mati, wajib ganti. Admin tidak dapat mengubah peran atau menonaktifkan akunnya sendiri; admin aktif terakhir dilindungi (`409`). |

Tidak ada lupa-kata-sandi lewat email di fase ini: admin yang menyetel ulang (panel Pengguna di Compiler atau `scripts/user_admin.mjs`).

Contoh `POST /api/auth/login` dengan kata sandi salah (`401`) dan benar (`200`):

```json
{
  "error": "Masuk gagal. Periksa email dan kata sandi, atau tunggu sebelum mencoba lagi.",
  "request_id": "…"
}
```
```json
{
  "ok": true,
  "role": "penulis",
  "display_name": "Nama Akun",
  "must_change_password": false,
  "request_id": "…"
}
```

### 3.2 Daftar produk dan keterangan produk

**`GET /api/products`**: daftar semua produk (satu produk = satu compile). **Siapa boleh:** pembaca, penulis. Tanpa isian.

```json
{
  "products": [
    {
      "id": 1,
      "name": "Vastrol 20 mg Tablet",
      "product_name": "Vastrol",
      "strength": "20 mg",
      "dosage_form": "Tablet",
      "api": "Ondansetron HCl",
      "api_uncertain": true,
      "project_code": null,
      "medium_count": 3,
      "run_count": 51,
      "last_test_date": "2026-10-06"
    }
  ]
}
```

**`GET /api/products/{id}`**: keterangan produk untuk **formulir Tambah data run**: daftar medium (dengan volume, alat dan kecepatan, metode yang menjadi isi otomatis kolom *Volume medium*, *Alat dan kecepatan*, *Metode analisis*), daftar pembanding (kolom *Pembanding*), merek uji bawaan, dan nomor batch yang sudah ada. **Siapa boleh:** pembaca, penulis. Contoh (dipersingkat ke dua medium):

```json
{
  "product": {
    "id": 1,
    "name": "Vastrol 20 mg Tablet",
    "api": "Ondansetron HCl",
    "api_uncertain": true
  },
  "mediums": [
    {
      "code": "4,5",
      "name": "pH 4,5",
      "full_name": "Buffer Acetate pH 4,5",
      "in_product": true,
      "volume_text": "900 ml",
      "apparatus": "2 (Paddle)",
      "rpm_text": "50 rpm",
      "method": "HPLC"
    },
    {
      "code": "Air",
      "name": "Air",
      "full_name": "Air",
      "in_product": false,
      "volume_text": "900 ml",
      "apparatus": "2 (Paddle)",
      "rpm_text": "50 rpm",
      "method": "HPLC",
      "inherited": true
    }
  ],
  "comparators": [
    {
      "lot": "B41968",
      "name": "Ezero 20 mg",
      "used": 33
    },
    {
      "lot": "6005160",
      "name": "Crestor 20 mg",
      "used": 27
    }
  ],
  "test_brand": "Vastrol 20 mg Tablet",
  "batches": "[…17 nomor batch…]"
}
```
`in_product: false` berarti medium itu belum ada pada produk ini (mis. Air untuk Vastrol); medium baru ikut dibuat saat run pertamanya disimpan, dan alat/metode disalin dari medium lain produk itu (`inherited: true`).

**`POST /api/products`**: membuat produk baru. **Siapa boleh:** penulis (dengan nama analis). Isian: `product_name`, `strength`, `dosage_form` (wajib), `api`, `project_code` (opsional). Jawaban `201` dengan `compile_id` (nomor produk). Bila produk yang sama sudah ada: `409`. Sebelum membuat, halaman memanggil **`GET /api/products/match?product=…&strength=…&form=…&code=…`** yang mengembalikan kandidat produk serupa (cocok lewat kode project, nama yang dinormalkan, atau nama lain/alias). Server **tidak pernah menggabungkan otomatis**; halaman menampilkan kandidat dan penulis memilih *pakai yang ada* atau *tetap buat baru* (konfirmasi).

### 3.3 Dashboard

**`GET /api/products/{id}/dashboard`**: semua yang dibutuhkan dashboard dalam satu kali baca. **Siapa boleh:** pembaca, penulis. Tanpa isian.

Isi jawaban (bagian `runs`, `cells`, `findings` adalah inti):

| Bagian | Isi | Dipakai oleh |
|---|---|---|
| `product` | nama, zat aktif (dan penanda `api_uncertain` bila sheet bertentangan), rentang tanggal, bulan yang ada | judul, baris API, filter tanggal |
| `times` | titik waktu (0 dan menit positif) | sumbu grafik |
| `media` | tiap medium: kode, nama, uraian, `has` (ada data atau kosong), volume/alat/metode | empat kuadran grafik, kartu "kosong" |
| `comps`, `comp_order` | pembanding yang tersedia (nama, nomor batch, produsen) dan urutannya | tombol *Pembanding aktif* |
| `runs` | satu baris per batch (+ varian): tanggal, profil rata-rata dan RSD per medium (`prof`, memuat `held` bila blok ditahan pembaca impor), `run_ids`, penanda tidak valid (`invalid`) dan ditahan (`held`), `comp` (benar bila baris itu pembanding) | matriks, grafik |
| `cells` | f2 untuk tiap pembanding × batch × medium: nilai resmi Langkah 4 `f2`, `k` (`sim`/`rap`/`not`), `n`, `total`, `src` (selalu `langkah4`); pembanding `sheet` (tercetak, atau null), `f2s`, `ks` (hitung ulang tim); penanda `beda_sheet`, `beda_tim`, `cause` | sel matriks, label grafik, rincian sel |
| `findings` | temuan *Perlu dicek* (jenis, batch, medium, teks) | tabel Perlu dicek |
| `warn` | tooltip segitiga peringatan per batch | matriks |

Arti `k`/`ks`/`kl`: `sim` = Similar, `rap` = Similar sangat cepat (f2 hanya informasi), `not` = Not Similar. `nl` = jumlah titik yang dipakai aturan Langkah 4. `beda: true` bila kedua aturan berbeda kesimpulan atau (bukan "sangat cepat") berselisih lebih dari 1.

Contoh (dipersingkat; Vastrol 20 mg Tablet, pembanding Ezero B41968):

```json
{
  "product": {
    "id": 1,
    "name": "Vastrol 20 mg Tablet",
    "title": "Development of Vastrol 20 mg Tablet",
    "api": "Ondansetron HCl",
    "api_uncertain": true,
    "project_code": null,
    "date_min": "2026-02-10",
    "date_max": "2026-10-06",
    "months": [
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-08",
      "2026-09",
      "2026-10"
    ]
  },
  "times": [
    0,
    5,
    10,
    15,
    20,
    30,
    45,
    60
  ],
  "media": [
    {
      "id": "4,5",
      "name": "pH 4,5",
      "desc": "Buffer Acetate pH 4,5",
      "has": true,
      "medium_id": 2,
      "volume_text": "900 ml",
      "apparatus": "2 (Paddle)",
      "rpm_text": "50 rpm",
      "method": "HPLC"
    },
    {
      "id": "Air",
      "name": "Air",
      "desc": "Medium air",
      "has": false,
      "medium_id": null,
      "volume_text": null,
      "apparatus": null,
      "rpm_text": null,
      "method": null
    }
  ],
  "comps": {
    "6005160": {
      "key": "6005160",
      "name": "Crestor 20 mg",
      "lot": "6005160",
      "maker": "PT AstraZeneca Indonesia"
    },
    "B41968": {
      "key": "B41968",
      "name": "Ezero 20 mg",
      "lot": "B41968",
      "maker": "PT Meiji Indonesian"
    }
  },
  "comp_order": [
    "B41968",
    "6005160"
  ],
  "runs": "[… 17 baris; contoh satu baris di bawah …]",
  "cells": {
    "B41968": {
      "F0066A26A": {
        "1,2": {
          "f2": 63.32,
          "k": "sim",
          "n": 3,
          "total": 85.0,
          "src": "langkah4",
          "sheet": { "f2": 63.32, "k": "sim", "n": 3, "total": 85.0 },
          "f2s": 63.32,
          "ks": "sim",
          "beda_sheet": false,
          "beda_tim": false,
          "cause": null
        },
        "4,5": {
          "f2": 36.89,
          "k": "not",
          "n": 3,
          "total": 1000.5,
          "src": "sheet",
          "f2s": 36.89,
          "ks": "not",
          "beda_sheet": false,
          "beda_tim": false,
          "cause": null
        },
        "6,8": {
          "f2": 81.86,
          "k": "rap",
          "n": 3,
          "total": 12.9,
          "src": "sheet",
          "f2s": 81.86,
          "ks": "rap",
          "beda_sheet": false,
          "beda_tim": false,
          "cause": null
        }
      }
    }
  },
  "findings": [
    {
      "kind": "beda_sheet",
      "batch": "F0014E26A Kp Rendah",
      "medium": "pH 6,8",
      "type": "Beda dengan sheet lama",
      "tone": "warn",
      "order": 1,
      "text": "Sheet lama menulis Similar (keduanya ≥ 85% di 15 menit). Di 15 menit Kp Rendah baru 78,1% (Ezero 97,7%), jadi hitung ulang menghasilkan f2 34,4 dan Not Similar."
    },
    {
      "kind": "identik",
      "batch": "F0006H26A",
      "medium": "pH 1,2",
      "type": "Data identik",
      "tone": "warn",
      "order": 2,
      "text": "Profil rerata sama persis dengan Ezero 20 mg B41968 (f2 terhadap Ezero 100,0). Hanya ditandai."
    },
    {
      "kind": "beda_sheet",
      "comp": "B41968",
      "batch": "F0062C26A",
      "medium": "pH 6,8",
      "type": "Beda dengan sheet lama",
      "tone": "warn",
      "order": 1,
      "text": "pH 6,8: resmi (Langkah 4) 9,1 (Not Similar, n 1), sheet lama 16,9 (Not Similar, n 3). Penyebab: n berbeda (sheet 3 titik, Langkah 4 1 titik: aturan pemotongan 85% / titik yang dipakai). Tampilan memakai angka resmi Langkah 4; angka lain hanya pembanding."
    }
  ],
  "warn": {
    "6005160": "RSD di atas batas (pH 1,2)",
    "F0014E26A Kp Rendah": "Selisih dengan sheet lama (pH 6,8)"
  }
}
```
Satu baris `runs` (batch F0066A26A, hanya medium pH 4,5 yang ditampilkan di contoh ini):
```json
{
  "key": "F0066A26A",
  "code": "F0066A26A",
  "variant": "",
  "product": "Vastrol 20 mg",
  "date": "2026-02-10",
  "comp": false,
  "site": "PT Pharos Indonesia",
  "prof": {
    "4,5": {
      "avg": [
        0,
        64.56,
        74.95,
        79.91,
        83.64,
        85.95,
        88.27,
        93.71
      ],
      "rsd": [
        0,
        19.44,
        10.94,
        8.36,
        6.16,
        5.49,
        5.17,
        9.6
      ],
      "run_id": 19,
      "valid": true,
      "vessels": 3,
      "date": "2026-02-10",
      "note": null
    }
  },
  "invalid": {}
}
```

Jenis temuan yang dikirim server: **Beda dengan sheet lama** (angka resmi Langkah 4 berbeda dari angka tercetak sheet atau hitung ulang tim: selisih > 1 atau status berbeda; menyebut resmi, sheet, dan penyebab), **Data identik** (profil rata-rata sama persis), **RSD di atas batas** (batas 20% untuk titik ≤ 10 menit, 10% untuk lainnya), **Catatan impor** (blok sheet ganda yang digabung, run tidak valid, zat aktif belum pasti). Baris Beda dengan sheet lama dikirim per pembanding aktif (field `comp`).

### 3.4 Ekspor

**`GET /api/products/{id}/export?format=xlsx|csv|tsv`**: mengunduh data produk. **Siapa boleh:** pembaca, penulis. `xlsx` = format sheet lama (satu tab per medium, rumus hidup); `csv` dan `tsv` aman terhadap suntikan rumus Excel. Format lain: `400`. Ekspor satu arah (tidak ada baca-balik). Tombol *Ekspor ke sheet* membuka tiga pilihan ini.

### 3.5 Menambah data (hanya penulis)

Urutan satu kali menambah run lewat formulir **Tambah data run**:

1. **Nama analis** diketik pengguna (2 sampai 80 karakter); halaman mengingat nama terakhir di sesi peramban (`sessionStorage`) tetapi tetap bisa diubah. Dikirim sebagai `analyst_name` pada setiap simpan, ubah, hapus, pulihkan, impor, dan Kirim dari Studio.
2. Selama mengisi, halaman memanggil **pratinjau** (di bawah) sehingga rata-rata, RSD, f2, grafik, dan pemeriksaan otomatis selalu dari server.
3. *Simpan ke database* menampilkan **ringkasan konfirmasi**; setelah dikonfirmasi, halaman memanggil **simpan** dengan nomor kirim (`push_id`) tetap untuk isi yang sama.

**`POST /api/products/{id}/runs/preview`**: pratinjau; **tidak menyimpan apa pun** dan belum menuntut nama analis. **Siapa boleh:** penulis. Isian:

| Isian | Arti |
|---|---|
| `medium` | kode medium: `Release`, `1,2`, `4,5`, `6,8`, `Air`, `1,0`, `7,2`, `7,5` |
| `batch` | nomor batch (wajib; tidak boleh nomor batch pembanding) |
| `variant` | varian, opsional (mis. "Kp Tinggi") |
| `test_date` | tanggal uji `YYYY-MM-DD` (bukan bagian identitas run) |
| `comparator` | nomor batch pembanding (mis. `B41968`); kosong = tanpa f2 |
| `timepoints` | menit positif, 1 sampai 9 (titik 0 tidak dikirim) |
| `vessels` | daftar `{no, values}`, nomor 1 sampai 12; `values` sepanjang `timepoints`, `null` untuk sel kosong |

Jawaban `200`: `stats` (avg, min, max, rsd per titik), `f2` (`sheet` dan `langkah4`, pembanding yang dipakai, profil rata-rata untuk grafik), `duplicate` (`baru`, `sama_persis`, `bentrok`, `terhapus`), `checks` (pemeriksaan otomatis), `warnings`. Contoh (data F0066A26A pH 4,5 dari mockup tim; angka: f2 sheet 36,9, Not Similar):

```json
{
  "times": [
    5,
    10,
    15,
    20,
    30,
    45,
    60
  ],
  "stats": {
    "avg": [
      64.567,
      74.967,
      79.933,
      83.633,
      85.933,
      88.267,
      93.7
    ],
    "min": [
      54.7,
      69.5,
      74.3,
      78.5,
      80.8,
      83.2,
      85.2
    ],
    "max": [
      78.7,
      84.4,
      87.3,
      88.8,
      90,
      92,
      103.2
    ],
    "rsd": [
      19.447,
      10.943,
      8.346,
      6.158,
      5.46,
      5.154,
      9.649
    ]
  },
  "n_vessels": 3,
  "f2": {
    "sheet": {
      "f2": 36.908,
      "kind": "not",
      "n": 3,
      "minutes": [
        5,
        10,
        15
      ],
      "sumsq": 998.89,
      "a": 0.055
    },
    "langkah4": {
      "f2": 36.632,
      "kind": "not",
      "code": "not_similar",
      "n": 2,
      "minutes": [
        5,
        10
      ],
      "reason": "Dipotong pada menit 10' (produk pembanding mencapai ≥ 85% — batas maks. 1 titik ≥ 85% per regulasi BPOM/EMA)",
      "rsd_exceeded": true
    },
    "ref": {
      "lot": "B41968",
      "name": "Ezero 20 mg",
      "run_id": 18,
      "avg": "[… 8 angka …]",
      "times": [
        0,
        5,
        10,
        15,
        20,
        30,
        45,
        60
      ]
    },
    "test_avg": "[… 8 angka …]"
  },
  "duplicate": {
    "status": "baru",
    "existing_run_ids": []
  },
  "comparator": {
    "lot": "B41968",
    "name": "Ezero 20 mg"
  },
  "checks": [
    {
      "level": "ok",
      "text": "RSD semua titik dalam batas (tertinggi 19,4% pada 5 menit, batas 20%)."
    },
    {
      "level": "ok",
      "text": "Identitas run belum ada di database, jadi bukan duplikat."
    },
    {
      "level": "info",
      "text": "3 dari 12 vessel terisi. Rata-rata dihitung dari vessel yang terisi."
    }
  ],
  "warnings": []
}
```

**`POST /api/products/{id}/runs`**: menyimpan satu run. **Siapa boleh:** penulis, **`analyst_name` wajib** (diketik; 2 sampai 80 karakter, bukan hanya spasi, tanpa karakter kendali; kosong atau tidak valid = `400` "Nama analis wajib diisi"). Isian sama dengan pratinjau ditambah:

| Isian | Arti |
|---|---|
| `push_id` | nomor kirim (UUID) milik isi ini. Mengirim ulang isi yang sama dengan nomor yang sama **aman**: tidak menggandakan data (`200` dengan `replay: true`). Nomor yang sama dengan isi berbeda: `409`. |
| `decision` | hanya bila `duplicate = bentrok` (identitas run sama, nilai beda): `timpa` (run lama ditandai ditimpa, jejak tetap), `ulang` (simpan sebagai run ulang), `batal`. Tanpa keputusan: `409` dengan daftar yang bentrok. |

Jawaban `201` (run baru) dengan nomor run, status (`baru`, `ditimpa`, `run_ulang`, `dibatalkan`, `sama_persis`, `terhapus`), kedua nilai f2 dan pembandingnya. Run disimpan bersama perbandingannya (nilai f2 yang tersimpan untuk data baru = Langkah 4; nilai aturan tim dihitung ulang saat dashboard dimuat) dan jejak audit memuat nama analis.

```json
{
  "replay": false,
  "run_id": 178,
  "status": "baru",
  "counts": {
    "baru": 1
  },
  "f2_sheet": 36.908,
  "kind_sheet": "not",
  "f2_langkah4": 36.632,
  "kind_langkah4": "not",
  "comparator": {
    "lot": "B41968",
    "name": "Ezero 20 mg"
  }
}
```
Kirim ulang dengan `push_id` yang sama (`200`, tidak ada data ganda):
```json
{
  "replay": true,
  "run_id": 178,
  "status": "baru",
  "counts": {
    "baru": 1
  },
  "f2_sheet": 36.908,
  "kind_sheet": "not",
  "f2_langkah4": 36.632,
  "kind_langkah4": "not",
  "comparator": {
    "lot": "B41968",
    "name": "Ezero 20 mg"
  }
}
```

### 3.6 Menambah data banyak sekaligus: impor sheet lama (hanya penulis)

**`POST /api/imports/xlsx`**: berkas `.xlsx` mentah sebagai isi permintaan, nama berkas pada header `x-file-name`. **Tambah `?dry=1`** untuk **laporan pencocokan tanpa menyimpan**: jumlah run, jumlah perbandingan, f2 cocok/tidak cocok dengan hitung ulang, tab yang diabaikan, blok yang ditahan. Tanpa `dry`, data disimpan dalam satu transaksi (nama analis wajib: header `x-analyst-name`, URL-encoded; tidak wajib untuk `?dry=1`) dan jawabannya `201`. Hanya tab UDT yang dibaca. Berkas yang bukan `.xlsx`: `400`; lebih dari 4 MB: `413`. Tombol *Impor sheet lama* memakai dua langkah ini (Periksa berkas lalu Impor ke database).

*Tempel dari Excel* tidak punya permintaan sendiri: halaman hanya **membaca teks tempel** menjadi sel formulir (angka dengan koma desimal dikenali), lalu semua langkah di 3.5 berlaku.

### 3.7 Jalur lama yang tetap ada

Studio Langkah 5 (tombol **Kirim ke Compiler**) tetap memakai jalur yang sama dengan Compiler: `GET /api/products`, `GET /api/products/match`, `POST /api/products`, serta `POST /api/ingest/preview` dan `POST /api/ingest/commit` (paket hasil Langkah 3/4, nomor kirim idempoten, pilihan timpa/ulang/batal). Setelah terkirim, tautan *Buka Compiler* membuka `/compiler?p=<nomor produk>`. Jalur `/api/compiles/*` (nama lama) masih dijawab dengan logika yang sama agar alat lama tidak patah. Ubah/hapus/pulihkan run (`PATCH /api/runs/{id}`, `POST /api/runs/{id}/delete|restore`, `GET /api/runs/{id}/audit`) tidak punya tombol di HTML tim; jalurnya tetap tersedia dan diuji, tombolnya menunggu keputusan tim (lihat NOTES_F6.md).

## 4. Kode galat

Semua galat berbentuk `{ "error": "pesan", "request_id": "…" }`; sebutkan `request_id` saat melapor. Pesan tidak memuat kata sandi, alamat database, atau nilai data.

| Kode | Arti | Contoh pesan | Yang perlu dilakukan |
|---|---|---|---|
| `400` | Isian tidak valid | "Masukan tidak valid" + `details` (mis. "vessel: 1 sampai 12 vessel") atau "Nama analis wajib diisi sebelum menulis data" | Perbaiki isian yang disebut |
| `401` | Belum masuk atau sesi habis; kata sandi salah | "Belum masuk" / "Masuk gagal. Periksa kata sandi, atau tunggu sebelum mencoba lagi." | Masuk lagi |
| `403` | Peran pembaca mencoba menulis, atau asal permintaan ditolak | "Peran pembaca tidak boleh menulis data" | Masuk dengan kata sandi penulis |
| `404` | Produk atau jalur tidak ada | "Produk tidak ditemukan" | Periksa nomor produk |
| `409` | Bentrok: run sama dengan nilai beda, nomor kirim sudah dipakai isi lain, atau produk sudah ada | "Ada run bentrok: pilih timpa, ulang, atau batal" (+ `conflicts`) | Pilih tindakan, atau mulai kirim baru |
| `413` | Isi terlalu besar | "Badan permintaan terlalu besar" / "Berkas kosong atau lebih dari 4 MB" | Kecilkan berkas |
| `500` | Galat di server (bukan salah pengguna) | "Terjadi galat pada server" | Laporkan dengan `request_id` |

Contoh nyata: bentrok (`409`), isian salah (`400`), pembaca menulis (`403`), tanpa sesi (`401`):
```json
{
  "error": "Ada run bentrok: pilih timpa, ulang, atau batal",
  "request_id": "…",
  "conflicts": [
    "f6"
  ]
}
```
```json
{
  "error": "Masukan tidak valid",
  "request_id": "…",
  "details": [
    "vessel: 1 sampai 12 vessel"
  ]
}
```
```json
{
  "error": "Peran pembaca tidak boleh menulis data",
  "request_id": "…"
}
```
```json
{
  "error": "Belum masuk",
  "request_id": "…"
}
```

## 5. Elemen halaman -> permintaan

| Elemen halaman (id) | Perilaku | Permintaan ke server | Peran |
|---|---|---|---|
| Halaman login | masuk, keluar | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/me` | semua |
| Pemilih produk (`prodPick`, `f-prod`) | pilih produk; "+ Produk baru…" | `GET /api/products`; baru: `GET /api/products/match` lalu `POST /api/products` | pembaca baca; penulis buat |
| Dashboard (`stats`, `matrix`, `panels`, `legend`, `chartNote`) | semua angka, grafik, KPI | `GET /api/products/{id}/dashboard` (satu kali per produk) | semua |
| Pembanding aktif (`compBtns`) | ganti pembanding | tanpa permintaan baru (data semua pembanding sudah di `cells`) | semua |
| Cari batch (`q`), Status run (`st`), Rentang tanggal (`dt`) | saring | tanpa permintaan (menyaring data yang sudah diambil) | semua |
| Centang matriks (maks 4) | pilih batch di grafik | tanpa permintaan | semua |
| Perlu dicek (`flagBody`) | temuan | bagian `findings` pada dashboard | semua |
| Ekspor ke sheet (`expBtn`) | unduh | `GET /api/products/{id}/export?format=xlsx|csv|tsv` | semua |
| Nama analis (`f-ana`) | **diketik** (wajib, 2 sampai 80 karakter), diingat per sesi peramban, bisa diubah | `analyst_name` pada tiap tulis | penulis ke atas |
| Batch, Varian, Medium, Pembanding, Tanggal uji (`f-batch`, `f-var`, `f-med`, `f-cmp`, `f-date`) | identitas run | dikirim pada pratinjau dan simpan | penulis |
| Volume medium, Alat dan kecepatan, Metode (`f-vol`, `f-app`, `f-met`) | isi otomatis, tidak bisa diubah | `GET /api/products/{id}` (daftar `mediums`) | penulis |
| Tabel % terlarut per vessel, + Tambah titik waktu | isi sel; menambah kolom menit (maks 9 titik, 12 vessel) | setiap perubahan memicu `POST /api/products/{id}/runs/preview` | penulis |
| Tab Isi manual | isi tabel dengan tangan | seperti baris di atas | penulis |
| Tab Tempel dari Excel | teks tempel dibaca menjadi sel | tanpa permintaan sendiri; lalu pratinjau | penulis |
| Tab Impor sheet lama | Periksa berkas lalu Impor ke database | `POST /api/imports/xlsx?dry=1`, lalu `POST /api/imports/xlsx` | penulis |
| Pratinjau hasil, Pemeriksaan otomatis | f2, grafik, pemeriksaan | bagian jawaban pratinjau | penulis |
| Simpan ke database (`saveBtn`) | ringkasan konfirmasi; pilihan timpa/ulang/batal bila bentrok | `POST /api/products/{id}/runs` | penulis |
| Studio Langkah 5: Kirim ke Compiler | kirim hasil Langkah 3/4 | `GET /api/products`, `GET /api/products/match`, `POST /api/products`, `POST /api/ingest/preview`, `POST /api/ingest/commit` | penulis |

## 6. Hal yang tidak dijanjikan oleh kontrak ini (jujur)

- **Nilai f2 resmi = Langkah 4** (jawaban tim P-1, F17). Angka tercetak sheet dan hitung ulang tim tetap terkirim sebagai pembanding dan selisih ditandai.
- **RSD pada titik 30 menit** di data mockup tim berbeda dari hitung ulang Langkah 4 pada 42 sel; server memakai hitung ulang (lihat NOTES_F6.md).
- **Titik waktu selain jadwal baku** (5, 10, 15, 20, 30, 45, 60): f2 aturan tim memakai *tiga titik pertama setelah 0* dan tanda "sangat cepat" pada titik ke-3; bila jadwal berbeda dari jadwal baku, tanda itu mengikuti titik ke-3, bukan tepat 15 menit. Perlu konfirmasi tim.
- Tombol Kelola (ubah/hapus/pulihkan/jejak) dan Run terhapus ditambahkan di F8 (jawaban tim A-6); HTML tim aslinya tidak memilikinya. Hanya peran penulis melihatnya.
- ~~Nama analis pada akun bersama bersifat deklarasi~~ **Diganti F10:** nama analis = nama akun; jejak mencatat `user_id` dan nama. Data lama bernama bebas tetap apa adanya dan dipetakan ke akun `import/sistem` (NOTES_F10.md).
- **Diganti F12 (24 Nov, perintah Wahyu):** tidak ada akun per orang; tiga akun bersama (Formdev, Andev, Admin). Nama analis kembali **diketik** (wajib) dan jejak mencatat **akun DAN nama yang diketik**. Keterbatasan jujur: nama yang diketik adalah deklarasi pengguna di akun bersama; tidak bisa dibuktikan siapa orangnya.

## Lampiran F8 (23 Nov 2026): perubahan kontrak
- **S-3:** `test_date` yang tidak ada di kalender (2026-13-45) = 400 pada pratinjau dan simpan; id numerik di atas batas aman (16 digit atau lebih) pada jalur = 400; karakter NUL pada isian atau parameter = 400; `compile_id` di luar bilangan bulat aman = 400; galat basis data kelas 22 = 400; galat kunci tamu (23503) = 409 dengan pesan generik. Pesan galat tetap tidak membocorkan skema.
- **Medium:** identitas satu medium = (produk, kode). Push dengan nama medium berbeda untuk kode yang sudah ada = **409** berisi `medium_code` dan `stored_full_name`; paket dengan dua medium berkode sama = 400.
- **S-4:** `POST /api/ingest/commit` dan `/api/ingest/preview` menghitung ulang f2, Total, dan n dari nilai vessel dengan Langkah 4 asli. f2 kiriman yang menyimpang lebih dari 1 dari hitungan server (atau tidak dapat dihitung ulang) = 400; nilai yang disimpan selalu hasil server (`f2_source = studio`, `conclusion_is_printed = false`).
- **Blok ditahan:** `runs[].held` dan `runs[].prof[medium].held` (alasan) pada dashboard; temuan `kind: "ditahan"` ("Ditahan saat impor"); laporan impor (`GET /api/imports/:id/report` dan ringkasan impor) memuat `ditahan_blok: [{batch, variant, medium, tab, avg_row, alasan}]`.
- **Header halaman** (`/`, `/compiler`): CSP tanpa domain luar, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: same-origin`; tanpa `Access-Control-Allow-Origin: *`.

## Lampiran F11 (24 Nov 2026): penutupan syarat F9 (K-1..K-6)
- **`/api/bridge` dinonaktifkan** pada deployment ini: semua metode dijawab `404` `{"error":"Tidak ditemukan: rute ini dinonaktifkan pada deployment ini"}` (tanpa cek login, tanpa `Access-Control-Allow-Origin`). Bukan fungsi Vercel lagi; kode ada di `cloudflare-worker/`.
- **Badan JSON harus objek:** `null`, angka, string, atau larik pada semua `POST/PATCH` = `400` "Badan permintaan harus berupa objek JSON" (sebelumnya `500` pada pratinjau).
- **Kata sandi:** ditolak bila memuat bagian lokal email (>= 6 huruf, tanpa memandang kapital): `400`, `details` "tidak boleh memuat bagian depan email".
- **Persen terlarut:** setiap nilai harus dalam rentang -5 sampai 150 (pratinjau, simpan run, dan Kirim ke Compiler dari Studio); di luar itu `400` dengan `details` "persen terlarut di luar rentang wajar (-5 sampai 150)". Nilai 100-110 tetap sah. Impor sheet lama tidak dibatasi (jalur lama).
- **Timpa:** run yang ditimpa kini punya entri jejak `run_timpa` pada `GET /api/runs/{id}/audit` (perubahan `visible` true -> false dan `replaced_by_run_id`); `GET /api/compiles/{id}/removed` tetap memuat `ditimpa`.
- **404 teks polos** (server Node dan semua respons Vercel lewat aturan `/(.*)`) memakai `X-Content-Type-Options: nosniff`.


## Lampiran F12 (24 Nov 2026): nama analis diketik, tiga akun bersama

- **Isian `analyst_name`** (teks, wajib) pada badan JSON: `POST /api/products`, `POST /api/products/{id}/runs`, `POST /api/compiles`, `POST /api/compiles/{id}/aliases`, `PATCH /api/runs/{id}`, `POST /api/runs/{id}/delete`, `POST /api/runs/{id}/restore`, `POST /api/imports`, `POST /api/ingest/commit`; untuk `POST /api/imports/xlsx` lewat header `x-analyst-name` (URL-encoded). Pratinjau (`.../runs/preview`, `/api/ingest/preview`, `?dry=1`) tidak menulis dan tidak menuntut nama.
- **Validasi:** 2 sampai 80 karakter (setelah dirapikan: spasi tepi dibuang, spasi ganda jadi satu), bukan hanya spasi, tanpa karakter kendali. Gagal = `400` (`Nama analis wajib diisi` atau `Nama analis tidak valid` + `details`); tidak ada yang tersimpan.
- **Jejak:** `audit_event.analyst_id` = nama yang diketik; `audit_event.user_id` = akun. `GET /api/runs/{id}/audit` memuat `analyst` (diketik) dan `account` (akun; `null` untuk jejak lama).
- **Pembuatan akun lewat API** (`POST /api/admin/users`) dinonaktifkan: `403` kecuali env `UDT_ALLOW_ACCOUNT_CREATE=1` (tidak diset di produksi). Panel Pengguna (admin) tetap: daftar, ubah peran, aktif/nonaktif, setel ulang kata sandi; formulir tambah pengguna disembunyikan.
- **Tidak ada** `/api/auth/forgot`, `/api/auth/reset`, SMTP, atau halaman lupa kata sandi (dibatalkan Wahyu).

## Lampiran F14 (24 Nov 2026): urutan waktu masuk

- `GET /api/products/{id}/dashboard` → `runs[]` kini memuat `entered_at` (ISO UTC, `run.created_at` pertama pada baris batch) dan diurutkan: `entered_at` menurun, `date` menurun, `key` naik. Klien tidak mengurutkan ulang; indeks penanda dihitung dari urutan ini (tertua = 0).
- `cells[pembanding][baris][medium].f2` adalah satu-satunya nilai f2 resmi untuk tampilan (matriks dan chip), sama dengan nilai tersimpan yang diekspor. `sheet` dan `f2s` tetap ada di payload hanya untuk rincian sel dan temuan; TIDAK dipakai sebagai angka utama.
- Halaman: `/` Beranda, `/studio` (pembungkus), `/studio-app` (isi Studio), `/record`, `/architecture`; `/index.html` → 302 `/studio`.

## Lampiran F15 (24 Nov 2026): Record (penelusur + penyunting terkontrol), Architecture, aturan RSD

### F15-1 Halaman

- `GET /record`: penelusur tabel (semua peran yang sudah masuk). Keadaan tampilan ada di hash alamat: `#t=tabel&p=2&q=cari&s=kolom&d=asc&f.kolom=teks&fx.kolom=persis`.
- `GET /architecture`: daftar diagram (kartu) dengan filter `Semua | Analis | Teknis`; tiap diagram dibuka dalam bingkai sama-asal. `GET /architecture/erd-relasi`: halaman tabel relasi ERD (teks, dari `ERD_relasi.md`, 33 relasi FK).
- `GET /architecture/{berkas}.html`, `index.json`, `ERD_relasi.md`, `ERD_relasi.csv`: berkas aplikasi (gated: tanpa sesi = `401`). Berkas `.html` memakai header bingkai sama-asal (`X-Frame-Options: SAMEORIGIN`, CSP `frame-ancestors 'self'`), halaman lain tetap `DENY`. Garis miring terbalik dan `..` pada jalur ditolak (404).

### F15-2 Membaca (semua peran)

| Permintaan | Jawaban |
|---|---|
| `GET /api/record/tables` | `tables[]`: `name`, `label`, `group`, `rows` (jumlah baris), `admin_only`, `writable`, `readonly_kind`. Non-admin: 18 tabel; admin: 23. |
| `GET /api/record/tables/{table}?page=&sort=&dir=&q=&f.{kolom}=&fx.{kolom}=` | `table` (metadata: `columns[]` dengan `name`, `type`, `pk`, `fk{table,col}`, `editable`; `readonly{kind,note,action}` atau `write{update,insert,soft_delete,fields}`; `can_write`), `page`, `pages`, `total`, `page_size` (**50**, tetap), `sort`, `dir`, `rows[]` (`c{kolom:nilai}`, `pk{}`, `token` untuk tabel yang dapat ditulis). |
| `GET /api/record/tables/{table}/csv?{parameter yang sama}` | Berkas CSV tabel yang sedang dilihat (filter dan urut sama, tanpa paginasi, maks 20.000 baris; `X-Truncated: 1` bila terpotong). UTF-8 dengan BOM, CRLF, `Content-Disposition: attachment`. |

- **Daftar putih:** `{table}` dan semua nama kolom dicocokkan ke daftar di `server/record.js`. Tabel tak dikenal = `404`; tabel khusus admin untuk non-admin = `403`; kolom `sort`/`f.`/`fx.` di luar daftar, `dir` selain `asc|desc`, `page` bukan bilangan bulat 1..1.000.000, parameter tak dikenal, lebih dari 8 filter, nilai lebih dari 200 karakter, NUL = `400`. Nilai filter selalu parameter terikat (SQL tidak pernah menyambung nilai dari klien). `page` melebihi batas dijepit ke halaman terakhir.
- `q` = cari teks (tanpa beda huruf) di semua kolom yang tampil; `f.kolom` = mengandung; `fx.kolom` = sama persis (dipakai tautan lompat FK).
- **Kolom yang tidak pernah ada di respons mana pun:** `password_hash`, `token_version`, `ip_hash`, `email_key`, serta `must_change_password`, `last_login_at`, `username`, `is_system`, `created_at` milik `app_user`. `app_user` hanya `user_id`, `display_name`, `email`, `role`, `is_active`. Hanya admin yang melihat `app_user`, `audit_event`, `audit_change`, `login_attempt` (tanpa IP), `schema_migration`.
- Kolom virtual `run.status` = `Terlihat | Dihapus | Ditimpa` (dari `run_removal` terakhir).
- **CSV aman:** sel teks yang diawali `=`, `+`, `-`, `@`, tab, atau CR diawali tanda kutip `'`. Angka sah (kolom bertipe angka, mis. `-5.2`) tidak diubah.

### F15-3 Menulis (penulis dan admin)

Semua tulis lewat lapisan aplikasi (bukan SQL mentah). Badan JSON wajib: `analyst_name` (diketik, aturan F12) dan `reason` (alasan, wajib, maks 4000). Gagal = `400`, tidak ada yang tersimpan.

| Permintaan | Isian | Jawaban |
|---|---|---|
| `POST /api/record/tables/{table}/rows` | `values{}` | `201` `id`, `row`. Hanya `compile`, `medium`, `batch`, `compile_alias`. |
| `PATCH /api/record/tables/{table}/rows/{id}` | `row_token` (dari baris yang dibuka), `changes{kolom:nilai}` | `200` `changed[]`, `row`. Token berbeda = `409` + `current` (baris terbaru). Nilai sama dengan tersimpan = `400`. |
| `POST /api/record/tables/run/rows/{id}/delete` | `row_token` | `200` `removed`, `row` (hapus **lunak**: baris `run_removal` kind `hapus`; baris `run` tidak pernah dihapus). |
| `POST /api/record/tables/run/rows/{id}/restore` | `row_token` | `200` `restored`, `row`. Run `ditimpa` tidak bisa dipulihkan (`409`). |

**Kolom yang boleh diisi/diubah (daftar putih):**

| Tabel | Ubah | Tambah baris |
|---|---|---|
| `compile` | `product_name`, `strength`, `dosage_form`, `api`, `api_uncertain`, `project_code`, `title` | ya (judul bawaan `Development of ...`) |
| `medium` | `full_name`, `volume_text`, `apparatus`, `rpm_text`, `method`, `method_ref` | ya (`compile_id`, `code` dari tabel kode) |
| `batch` | `brand_name` | ya (`compile_id`, `batch_no`) |
| `compile_alias` | `alias` (`alias_key` dihitung ulang) | ya (`compile_id`; `source` = `analis`) |
| `run` | `note`, `variant`, `manufacturer_site`, `is_valid`, `invalid_reason` (Tidak valid wajib beralasan) | tidak (data masuk lewat Studio atau impor) |

- **Koreksi zat aktif (permintaan INDRA):** mengubah `compile.api` tanpa menyebut `api_uncertain` otomatis menjadikan `api_uncertain` = `false` (dicatat sebagai perubahan terpisah di jejak); catatan "Zat aktif belum pasti" di Compiler hilang. Pilih `api_uncertain` = `true` bila masih belum pasti.
- **Jejak:** `audit_event` (`action` = `record_insert` | `record_update`, `entity_type` = tabel, `entity_id`, `reason`, `analyst_id` = nama diketik, `user_id` = akun) + `audit_change` (nilai lama dan baru per kolom). Untuk `run`, jejak muncul di `GET /api/runs/{id}/audit` bersama `run_delete`/`run_restore`.
- **Kunci optimistik:** `row_token` = md5 seluruh kolom yang tampil (termasuk `status` untuk run) saat baris dibuka. Berubah oleh siapa pun (juga lewat Compiler) = `409` pada permintaan berikutnya yang memakai token lama.
- **Tidak ada hapus keras:** tidak ada metode `DELETE`; peran basis data `udt_app` tidak punya hak `DELETE` pada tabel mana pun dan tidak punya hak `UPDATE` pada nilai terukur/turunan (migrasi 0007 hanya menambah hak `UPDATE` per kolom pada kolom di tabel atas).
- **Hanya baca (`403`, `read_only: true`, `action: {label: 'Perbaiki lewat Studio/Timpa', href: '/studio'}`):** `run_value`, `run_timepoint` (nilai terukur; alasan: ALCOA+, data asli dan keterlacakan); `comparison`, `comparison_point`, `import_check` (nilai turunan: f2, total, n, kesimpulan); `run_removal`, `run_source_block`, `import_run`, `import_note`, `studio_push`, `analyst` (jejak/asal); `medium_code`, `conclusion_code` (kode baku); `app_user`, `audit_event`, `audit_change`, `login_attempt`, `schema_migration` (admin boleh membuka, tidak boleh mengubah; hash tidak pernah tampil atau berubah dari Record). Koreksi nilai terukur = kirim ulang dari Studio dengan pilihan Timpa.

### F15-4 Perubahan lain di lampiran ini

- **Batas RSD (jawaban tim P-2):** temuan "RSD di atas batas" dan pemeriksaan pratinjau memakai aturan modul Langkah 4 asli (`evalSimilarityF2` lewat `udtBridge`): batas titik pertama dan titik berikutnya serta pemotongan 85% diambil dari fungsi Studio; server tidak lagi memuat angka batas. Teks temuan menyebut "titik pertama" dan "Aturan Langkah 4 (PerBPOM 11/2022)". Selisih terhadap aturan lama: evidence/f15/rsd_selisih.md.
- **Jejak per run:** setiap run baru (Studio atau impor) mendapat entri `run_create` (nama diketik + akun) di `GET /api/runs/{id}/audit` (F13 C-2).
- **Dashboard:** catatan "Zat aktif belum pasti" hanya muncul bila `compile.api_uncertain` = true (catatan impor tetap tersimpan di `import_note`).
- **Keamanan:** jalur berkas gated dengan garis miring terbalik (`..%5cserver%5capp.js`) ditolak (di Windows lolos pemeriksaan `..` lalu keluar folder).
- **Tabel peran x endpoint:** baris `POST /api/admin/users` diperjelas (lihat 3.0).


> **Tambahan F17 (24 Nov 2026).** (1) Rute Vercel: rewrite `/api/:rute(.+)` -> `/api/[...rute]` menambahkan parameter kueri injeksi (`rute`, `...rute`, `path`, `nxtP*`) ke `request.url`; server membuangnya SEKALI di awal `handle()` (`stripInjected`) sebelum semua daftar putih parameter (record, ekspor, match, impor). Parameter asing dari klien tetap 400. (2) f2 resmi = Langkah 4 (bagian "f2 resmi = Langkah 4" di atas).
