# NOTES F4c (Sprint 3) — skill/bundle: spec-driven-development, tdd-test-strategy, backup-restore-restic-and-db, frontend-ui-engineering, ponytail, token-saver

## Mockup (arahan Wahyu 23 Nov)
Kedua PDF (`Dashboard compile.pdf`, `Tambah data run.pdf`) dirender ke PNG (pymupdf, 100 dpi) dan dilihat sebagai gambar: `evidence/f4c/mockup/`. Spec mengikat: `docs/UI_SPEC_compiler_dari_mockup.md`.
Mockup menang untuk tata letak; Langkah 4 menang untuk aturan data (f2 tidak dihitung ulang di Compiler).

## Dikerjakan
1. `/compiler` halaman terpisah; kait tab 6 dihapus; Studio hanya 1 kait (`studio-ext/kirim.js`, di luar p1..p5).
2. UI sesuai mockup: pemilih produk, header+subjudul, kontrol, 4 KPI, matriks f2 (maks 4 batch, ✓ » ×), kisi 2x2, "Perlu dicek" tabel. Tangkapan 1920/1366: `evidence/f4c/compiler/`.
3. Kirim ke Compiler: push_id idempoten (hash isi; isi beda = 409), klik ganda serentak aman, tidak bergantung ekspor Google; kunci produk (kode project > nama ternormalisasi > alias; tanpa gabung otomatis).
4. Ubah status/alasan/catatan/varian, hapus+pulihkan dengan konfirmasi, jejak dengan nilai lama.
5. Ekspor: Excel (ExcelJS, rumus hidup + nilai cache, tab per kode medium), CSV/TSV (BOM, anti injeksi rumus), PNG 1600 px, SVG; satu arah.
6. Impor .xlsx dari UI (dry-run lalu simpan), delta v0.3; bug Gionix "Salah Wavelength" diperbaiki (16 run tidak valid, 17 blok).
7. `scripts/backup_pg.mjs` (pg_dump -Fc, verifikasi, sha256, retensi); uji dump-restore + skenario: `tests/11_*`, `evidence/f4c/sembilan_skenario_dump_restore.json`.

## Selisih / belum
- Cetak/PDF satu halaman: CSS cetak sudah ada, tetapi cetak terakhir menghasilkan 2 halaman dan penyesuaian zoom 0.5 TIDAK terverifikasi (printToPDF timeout; CDP file:// diblokir). Perlu cek manual.
- Tema Pharos Studio (opsional): tidak dikerjakan.
- Skenario 3 dan 8 (gambar, terang/gelap) hanya sebagian di peramban; sisa di data. "Tambah data" = tautan ke Studio (usulan INDRA).
- INDRA menjadwalkan cadangan harian; skrip belum dijadwalkan. Tanpa push/deploy; staging perlu migrasi 0003.
- Uji: 79/79 lulus (`UDT_FIXTURE_DIR=../data/sheets/csv npm test`, PostgreSQL Docker udt-f4-pg).
