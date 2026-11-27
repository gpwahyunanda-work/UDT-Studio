# ERD UDT Apps: tabel relasi (sumber kebenaran teks)

Versi 0.4, 26 Nov 2026. Dibuat dari skema nyata: migrasi `db/migrations/0001` sampai `0006`, diterapkan ke PostgreSQL 17 sementara lalu dibaca dari katalog sistem (`pg_catalog`). Gambar ERD ada di halaman ERD pada menu Architecture; bila gambar dan tabel ini berbeda, tabel inilah yang benar.

## Ringkasan

- Tabel dasar: **23** (22 tabel awal ditambah `app_user` dari migrasi 0005). Angka ini adalah hasil pembacaan skema.
- Relasi kunci asing (FK): **33**. Semua digambar di ERD. Lima di antaranya kunci gabungan (`run`→`batch`, `run`→`medium`, `comparison`→`run` dua kali, `run_value`→`run_timepoint`).
- Dua tampilan (view), bukan tabel: `run_visible` (run yang tidak dihapus atau ditimpa) dan `analyst_identity` (0005).
- Tanpa referensi diri (self-reference): tidak ada.
- Semua FK berperilaku NO ACTION saat induk dihapus; aplikasi tidak punya hak DELETE (hak peran `udt_app`: `db/migrations/0001_compile.sql` bagian Hak akses).
- FK `run.push_id` ditunda sampai COMMIT (DEFERRABLE INITIALLY DEFERRED): baris `studio_push` ditulis di akhir transaksi simpan.

## Domain dan tabel

| Domain | Tabel (jumlah kolom) |
|---|---|
| Akun dan audit | `app_user` (13), `audit_event` (10), `audit_change` (4), `login_attempt` (5), `schema_migration` (4) |
| Master | `analyst` (3), `compile` (11), `medium` (10), `batch` (5), `compile_alias` (7), `medium_code` (3) |
| Impor dan push | `import_run` (5), `studio_push` (6), `import_check` (3), `import_note` (6) |
| Run dan nilai | `run` (16), `run_timepoint` (3), `run_value` (4), `run_removal` (7), `run_source_block` (13) |
| Perbandingan | `conclusion_code` (2), `comparison` (11), `comparison_point` (3) |

## Relasi (FK)

Arah baca: tiap baris tabel asal menunjuk ke satu baris tabel tujuan. Kolom kardinalitas menyebut batas kedua sisi menurut DDL.

| # | Domain asal | Dari (tabel.kolom) | Ke (tabel.kolom PK) | Baris asal punya tujuan | Baris tujuan punya asal | Bagian PK asal | Gabungan | Ditunda | Sumber DDL |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Akun dan audit | `app_user.analyst_id` | `analyst.analyst_id` | tepat 1 (NOT NULL) | 0 atau 1 (kolom UNIQUE) | tidak | tidak | tidak | `db/migrations/0005_akun_pengguna.sql:4-18` |
| 2 | Akun dan audit | `audit_change.event_id` | `audit_event.event_id` | tepat 1 (NOT NULL) | 0 sampai banyak | ya | tidak | tidak | `db/migrations/0001_compile.sql:208-214` |
| 3 | Akun dan audit | `audit_event.analyst_id` | `analyst.analyst_id` | tepat 1 (NOT NULL) | 0 sampai banyak | tidak | tidak | tidak | `db/migrations/0001_compile.sql:196-206` |
| 4 | Akun dan audit | `audit_event.user_id` | `app_user.user_id` | 0 atau 1 (kolom boleh kosong) | 0 sampai banyak | tidak | tidak | tidak | `db/migrations/0001_compile.sql:196-206` |
| 5 | Master | `batch.compile_id` | `compile.compile_id` | tepat 1 (NOT NULL) | 0 sampai banyak | tidak | tidak | tidak | `db/migrations/0001_compile.sql:55-63` |
| 6 | Master | `compile.created_by` | `analyst.analyst_id` | tepat 1 (NOT NULL) | 0 sampai banyak | tidak | tidak | tidak | `db/migrations/0001_compile.sql:29-39` |
| 7 | Master | `compile_alias.compile_id` | `compile.compile_id` | tepat 1 (NOT NULL) | 0 sampai banyak | tidak | tidak | tidak | `db/migrations/0003_kunci_produk.sql:11-20` |
| 8 | Master | `compile_alias.created_by` | `analyst.analyst_id` | tepat 1 (NOT NULL) | 0 sampai banyak | tidak | tidak | tidak | `db/migrations/0003_kunci_produk.sql:11-20` |
| 9 | Master | `medium.code` | `medium_code.code` | tepat 1 (NOT NULL) | 0 sampai banyak | tidak | tidak | tidak | `db/migrations/0001_compile.sql:41-53` |
| 10 | Master | `medium.compile_id` | `compile.compile_id` | tepat 1 (NOT NULL) | 0 sampai banyak | tidak | tidak | tidak | `db/migrations/0001_compile.sql:41-53` |
| 11 | Impor dan push | `import_check.comparison_id` | `comparison.comparison_id` | tepat 1 (NOT NULL) | 0 sampai banyak | ya | tidak | tidak | `db/migrations/0001_compile.sql:167-172` |
| 12 | Impor dan push | `import_check.import_id` | `import_run.import_id` | tepat 1 (NOT NULL) | 0 sampai banyak | ya | tidak | tidak | `db/migrations/0001_compile.sql:167-172` |
| 13 | Impor dan push | `import_note.import_id` | `import_run.import_id` | tepat 1 (NOT NULL) | 0 sampai banyak | ya | tidak | tidak | `db/migrations/0001_compile.sql:174-182` |
| 14 | Impor dan push | `import_run.analyst_id` | `analyst.analyst_id` | tepat 1 (NOT NULL) | 0 sampai banyak | tidak | tidak | tidak | `db/migrations/0001_compile.sql:75-81` |
| 15 | Impor dan push | `studio_push.analyst_id` | `analyst.analyst_id` | tepat 1 (NOT NULL) | 0 sampai banyak | tidak | tidak | tidak | `db/migrations/0001_compile.sql:66-73` |
| 16 | Impor dan push | `studio_push.compile_id` | `compile.compile_id` | tepat 1 (NOT NULL) | 0 sampai banyak | tidak | tidak | tidak | `db/migrations/0001_compile.sql:66-73` |
| 17 | Run dan nilai | `run.batch_id, compile_id` | `batch.batch_id, compile_id` | tepat 1 (NOT NULL) | 0 sampai banyak | tidak | ya | tidak | `db/migrations/0001_compile.sql:84-108` |
| 18 | Run dan nilai | `run.created_by` | `analyst.analyst_id` | tepat 1 (NOT NULL) | 0 sampai banyak | tidak | tidak | tidak | `db/migrations/0001_compile.sql:84-108` |
| 19 | Run dan nilai | `run.import_id` | `import_run.import_id` | 0 atau 1 (kolom boleh kosong) | 0 sampai banyak | tidak | tidak | tidak | `db/migrations/0001_compile.sql:84-108` |
| 20 | Run dan nilai | `run.medium_id, compile_id` | `medium.medium_id, compile_id` | tepat 1 (NOT NULL) | 0 sampai banyak | tidak | ya | tidak | `db/migrations/0001_compile.sql:84-108` |
| 21 | Run dan nilai | `run.push_id` | `studio_push.push_id` | 0 atau 1 (kolom boleh kosong) | 0 sampai banyak | tidak | tidak | ya | `db/migrations/0001_compile.sql:84-108` |
| 22 | Run dan nilai | `run_removal.analyst_id` | `analyst.analyst_id` | tepat 1 (NOT NULL) | 0 sampai banyak | tidak | tidak | tidak | `db/migrations/0001_compile.sql:154-164` |
| 23 | Run dan nilai | `run_removal.replaced_by_run_id` | `run.run_id` | 0 atau 1 (kolom boleh kosong) | 0 sampai banyak | tidak | tidak | tidak | `db/migrations/0001_compile.sql:154-164` |
| 24 | Run dan nilai | `run_removal.run_id` | `run.run_id` | tepat 1 (NOT NULL) | 0 sampai banyak | ya | tidak | tidak | `db/migrations/0001_compile.sql:154-164` |
| 25 | Run dan nilai | `run_source_block.comparison_id` | `comparison.comparison_id` | 0 atau 1 (kolom boleh kosong) | 0 sampai banyak | tidak | tidak | tidak | `db/migrations/0001_compile.sql:184-193` |
| 26 | Run dan nilai | `run_source_block.import_id` | `import_run.import_id` | tepat 1 (NOT NULL) | 0 sampai banyak | tidak | tidak | tidak | `db/migrations/0001_compile.sql:184-193` |
| 27 | Run dan nilai | `run_source_block.run_id` | `run.run_id` | tepat 1 (NOT NULL) | 0 sampai banyak | tidak | tidak | tidak | `db/migrations/0001_compile.sql:184-193` |
| 28 | Run dan nilai | `run_timepoint.run_id` | `run.run_id` | tepat 1 (NOT NULL) | 0 sampai banyak | ya | tidak | tidak | `db/migrations/0001_compile.sql:110-116` |
| 29 | Run dan nilai | `run_value.run_id, seq` | `run_timepoint.run_id, seq` | tepat 1 (NOT NULL) | 0 sampai banyak | ya | ya | tidak | `db/migrations/0001_compile.sql:118-125` |
| 30 | Perbandingan | `comparison.conclusion_code` | `conclusion_code.code` | 0 atau 1 (kolom boleh kosong) | 0 sampai banyak | tidak | tidak | tidak | `db/migrations/0001_compile.sql:128-144` |
| 31 | Perbandingan | `comparison.ref_run_id, medium_id` | `run.run_id, medium_id` | tepat 1 (NOT NULL) | 0 sampai banyak | tidak | ya | tidak | `db/migrations/0001_compile.sql:128-144` |
| 32 | Perbandingan | `comparison.test_run_id, medium_id` | `run.run_id, medium_id` | tepat 1 (NOT NULL) | 0 sampai banyak | tidak | ya | tidak | `db/migrations/0001_compile.sql:128-144` |
| 33 | Perbandingan | `comparison_point.comparison_id` | `comparison.comparison_id` | tepat 1 (NOT NULL) | 0 sampai banyak | ya | tidak | tidak | `db/migrations/0001_compile.sql:146-151` |

## Kunci tiap tabel

| Tabel | Domain | Kolom | Kunci utama (PK) | Kunci unik (UNIQUE) | Sumber DDL |
|---|---|---|---|---|---|
| `app_user` | Akun dan audit | 13 | user_id | (analyst_id) | `db/migrations/0005_akun_pengguna.sql:4-18` |
| `audit_event` | Akun dan audit | 10 | event_id | - | `db/migrations/0001_compile.sql:196-206` |
| `audit_change` | Akun dan audit | 4 | event_id, field_name | - | `db/migrations/0001_compile.sql:208-214` |
| `login_attempt` | Akun dan audit | 5 | attempt_id | - | `db/migrations/0001_compile.sql:216-221` |
| `schema_migration` | Akun dan audit | 4 | version | - | `db/migrations/0001_compile.sql:223-228` |
| `analyst` | Master | 3 | analyst_id | (name) | `db/migrations/0001_compile.sql:22-26` |
| `compile` | Master | 11 | compile_id | (product_name, strength, dosage_form) | `db/migrations/0001_compile.sql:29-39` |
| `medium` | Master | 10 | medium_id | (compile_id, code); (compile_id, code, full_name); (medium_id, compile_id) | `db/migrations/0001_compile.sql:41-53` |
| `batch` | Master | 5 | batch_id | (batch_id, compile_id); (compile_id, batch_no) | `db/migrations/0001_compile.sql:55-63` |
| `compile_alias` | Master | 7 | alias_id | (compile_id, alias_key) | `db/migrations/0003_kunci_produk.sql:11-20` |
| `medium_code` | Master | 3 | code | (sort_no) | `db/migrations/0001_compile.sql:5-9` |
| `import_run` | Impor dan push | 5 | import_id | - | `db/migrations/0001_compile.sql:75-81` |
| `studio_push` | Impor dan push | 6 | push_id | - | `db/migrations/0001_compile.sql:66-73` |
| `import_check` | Impor dan push | 3 | import_id, comparison_id | - | `db/migrations/0001_compile.sql:167-172` |
| `import_note` | Impor dan push | 6 | import_id, seq | - | `db/migrations/0001_compile.sql:174-182` |
| `run` | Run dan nilai | 16 | run_id | (compile_id, batch_id, medium_id, variant, content_hash); (run_id, medium_id) | `db/migrations/0001_compile.sql:84-108` |
| `run_timepoint` | Run dan nilai | 3 | run_id, seq | (run_id, minute) | `db/migrations/0001_compile.sql:110-116` |
| `run_value` | Run dan nilai | 4 | run_id, vessel_no, seq | - | `db/migrations/0001_compile.sql:118-125` |
| `run_removal` | Run dan nilai | 7 | run_id, seq | - | `db/migrations/0001_compile.sql:154-164` |
| `run_source_block` | Run dan nilai | 13 | source_block_id | (import_id, tab_name, avg_row) | `db/migrations/0001_compile.sql:184-193` |
| `conclusion_code` | Perbandingan | 2 | code | - | `db/migrations/0001_compile.sql:14-17` |
| `comparison` | Perbandingan | 11 | comparison_id | (test_run_id, ref_run_id) | `db/migrations/0001_compile.sql:128-144` |
| `comparison_point` | Perbandingan | 3 | comparison_id, seq | - | `db/migrations/0001_compile.sql:146-151` |

## Cara tabel ini dibuat dan diperiksa

1. Migrasi 0001 sampai 0006 diterapkan berurutan ke database kosong sementara (PostgreSQL 17).
2. Kolom, tipe, PK, UNIQUE, dan FK dibaca dari `pg_attribute` dan `pg_constraint` (bukan dari dokumen DS).
3. Gambar ERD dibuat dari data yang sama; jumlah garis gambar sama dengan jumlah baris relasi di atas (33).
4. Berkas CSV pasangan: `ERD_relasi.csv` (kolom sama, UTF-8 dengan BOM).
