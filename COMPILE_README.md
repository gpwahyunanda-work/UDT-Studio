# Tab 6 "Compile Data UDT" (AI Assisted): backend dan tes

Status: Sprint 0+1 (kerangka tab, database, ingest idempoten, pembaca sheet, laporan pencocokan). Belum ada dashboard (Sprint 2) maupun tulis dari Langkah 5 (Sprint 3). Dokumen: `../docs/` (URS/FS/DS/RTM v0.1, DELTA_v0.2_F4.md, RTM_F4_S1.md).

## Isi
- `db/migrations/0001_compile.sql` + `db/migrate.mjs` (pelari migrasi, sha256, lock_timeout). `npm run migrate` (butuh DATABASE_URL_UNPOOLED).
- `server/app.js` handler Web-standar; `api/[...rute].js` pembungkus Vercel; `server/node-server.mjs` server Node biasa (laptop/Olympus).
- `server/ingest.js` validasi, klasifikasi, peringatan, simpan idempoten; `server/import/sheetReader.js` pembaca sheet (grid nilai+rumus+komentar).
- `compile/app.js` kerangka tab 6; kait di `index.html` dan `UDT Studio.html` (3 titik: STEPS, section#p6, script). `modules.lock` + `scripts/modules_lock.mjs`.
- `scripts/import_csv.mjs` impor dari fixture CSV ke server yang berjalan.

## Menjalankan tes (butuh PostgreSQL biasa; JANGAN Neon produksi)
```
docker run -d --name udt-f4-pg -e POSTGRES_USER=udt_owner -e POSTGRES_PASSWORD=ownerpw -e POSTGRES_DB=postgres -p 127.0.0.1:54339:5432 postgres:17-alpine
npm test            # UDT_TEST_PG bila URL berbeda; UDT_FIXTURE_DIR bila CSV tidak di ../data/sheets/csv
```
Tiap berkas uji membuat database sementara sendiri (dan menghapusnya). Uji impor memakai fixture `data/sheets/csv` (dilewati bila tidak ada).
