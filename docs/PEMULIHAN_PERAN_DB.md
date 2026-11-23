# Pemulihan peran `udt_app` untuk `pg_restore`

Berkas cadangan (`scripts/backup_pg.mjs`, format `pg_dump -Fc`) memuat tabel, indeks, dan `GRANT`, tetapi **tidak** memuat peran basis data. Bila `pg_restore` dijalankan ke server yang belum punya peran `udt_app`, hasilnya 112 peringatan "role udt_app does not exist" (F5): data pulih, hak akses tidak. Langkah di bawah memulihkan keadaan yang sama dengan produksi.

Peran dan kata sandi **tidak pernah** disimpan di repo atau di cadangan. Kata sandi diberikan lewat variabel lingkungan atau pengelola rahasia.

## 1. Siapkan peran pada server tujuan (sekali per server)

Jalankan sebagai pemilik (superuser atau pemilik skema), mis. `udt_owner`:

```sql
-- kata sandi baru; jangan memakai nilai produksi di mesin uji
CREATE ROLE udt_app LOGIN PASSWORD :'APP_PASSWORD' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
```

(`psql -v APP_PASSWORD="$UDT_APP_PASSWORD" -f peran.sql`, bukan mengetik kata sandi di baris perintah.)

## 2. Pulihkan ke basis data kosong

```bash
createdb -U udt_owner udt_pulih
pg_restore -U udt_owner -d udt_pulih --no-owner --role=udt_owner --exit-on-error  udt-YYYYMMDD.dump
```

- `--no-owner` supaya objek dimiliki pemulih, bukan peran asal yang mungkin tidak ada.
- Dengan peran `udt_app` sudah ada (langkah 1), baris `GRANT` di dalam cadangan berhasil; tanpa `--exit-on-error` peringatan lama tidak muncul lagi.

## 3. Pasang ulang hak peran aplikasi (aman diulang)

Hak yang dibutuhkan aplikasi sangat sempit (tanpa `DELETE`, `TRUNCATE`, atau `UPDATE` selain 4 kolom `run` dan `comparison_id` pada `run_source_block`). Cara paling aman: jalankan ulang pelari migrasi, yang idempoten dan memberi `GRANT` yang sama.

```bash
DATABASE_URL_UNPOOLED="postgres://udt_owner:***@host/udt_pulih" node db/migrate.mjs   # {"applied":[],"skipped":[...]}
```

Bila ingin memeriksa tanpa menjalankan migrasi:

```sql
SELECT has_table_privilege('udt_app','run','UPDATE')          AS update_run,      -- true (hanya kolom tertentu: lihat information_schema.column_privileges)
       has_table_privilege('udt_app','run','DELETE')          AS delete_run,      -- harus false
       has_table_privilege('udt_app','audit_event','UPDATE')  AS update_audit;    -- harus false
SELECT rolsuper FROM pg_roles WHERE rolname='udt_app';        -- harus false
```

## 4. Uji pascapemulihan

Arahkan `DATABASE_URL` aplikasi ke `udt_app@udt_pulih`, lalu `GET /api/health` (harus `ok: true` dan `schema_version` = versi migrasi terbaru) dan bandingkan jumlah baris tabel utama (`run`, `run_value`, `comparison`, `audit_event`) dengan sumber. `tests/11_cadangan_sembilan_skenario.test.js` mengotomatiskan perbandingan ini pada PostgreSQL lokal.

## Catatan

- Mengganti kata sandi `udt_app` setelah pemulihan: `ALTER ROLE udt_app PASSWORD ...` oleh pemilik, lalu perbarui rahasia aplikasi. Tes lokal menimpa kata sandi peran ini setiap kali berjalan; jangan menjalankan tes ke server yang dipakai bersama.
- Kata sandi basis data uji lokal tidak lagi tertanam di `tests/helpers/db.js`; set `UDT_TEST_PG` (URL penuh) atau `UDT_TEST_PG_PASSWORD`.
