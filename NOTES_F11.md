# NOTES_F11 (BRAHMA, 24 Nov 2026) - cabang feat/compile-s1, lokal, tanpa push/deploy

Kartu t_0a26de0a. Dasar: docs/F9_laporan.md (K-1..K-6) dan docs/F9_keputusan_INDRA.md. Tanpa fitur baru, tanpa migrasi.

| K | Perubahan | Berkas | Uji |
|---|-----------|--------|-----|
| K-1 | `/api/bridge` dinonaktifkan: 404 generik "Tidak ditemukan: rute ini dinonaktifkan pada deployment ini" (semua metode, tanpa login, tanpa ACAO). `api/bridge.js` dipindah ke `cloudflare-worker/vercel-entry.js` (kode utuh); entri `functions` bridge dan pengecualian `bridge$` di rewrite dibuang. `DEFAULT_BACKEND_URL` Studio tidak diubah. | vercel.json, server/app.js, api/[...rute].js | tes K-1 |
| K-2 | Badan JSON yang bukan objek (`null`, angka, string, larik) = 400 pada semua POST/PATCH. | server/app.js | tes K-2 |
| K-3 | Kata sandi yang memuat bagian lokal email (>= 6 huruf, tanpa memandang kapital) = 400. Bagian lokal 3-5 huruf hanya ditolak bila kata sandi sama dengan itu (aturan lama). | server/accounts.js | tes K-3 (unit + API) |
| K-4 | Persen terlarut -5..150 (di luar = 400 "di luar rentang wajar"); 100-110 tetap sah. Berlaku untuk pratinjau, simpan run, dan Kirim ke Compiler (jenis studio). Impor sheet lama tidak dibatasi agar data lama tetap bisa diimpor. | server/products.js, server/ingest.js | tes K-4 |
| K-5 | Focus trap (Tab/Shift+Tab berputar), ESC menutup, fokus kembali ke pemicu: dialog Compiler dan dialog Kirim Studio. | compiler/app.js, studio-ext/kirim.js | tes K-5 (statis, lihat batasan) |
| K-6 | Timpa menulis `audit_event` `run_timpa` pada run lama (visible true->false, replaced_by_run_id). 404 teks polos: `nosniff` + `text/plain` (server Node) dan header `/(.*)` di vercel.json. | server/ingest.js, server/node-server.mjs, vercel.json | tes K-6 |

## Untuk INDRA / Wahyu
- **Ekspor ke Sheets Studio:** jika tim memakainya, itu berjalan lewat jembatan milik Yonathan (deployment terpisah, `DEFAULT_BACKEND_URL` = udt-studio.vercel.app) di luar aplikasi ini. Keputusan soal data Pharos yang lewat akun Google lain ada pada Wahyu (manusia).
- Jangan isi kunci Composio/Gemini pada project UDT Apps (tidak dipakai lagi).
- Setelah deploy: cek `GET /api/bridge` = 404 dan tanpa header ACAO di staging.

## Batasan jujur
- K-5 diuji statis (pola kode) + dibaca; tidak ada uji DOM otomatis (belum ada jsdom/Playwright di repo). Verifikasi keyboard di browser sebaiknya diulang AGNI pada staging.
- Header `nosniff` global di vercel.json tidak dapat diuji lokal (hanya Vercel yang menerapkannya); bagian server Node diuji.
- Rentang K-4 hanya pada jalur tulis Compiler/Studio; data hasil impor sheet lama dengan nilai di luar rentang tetap tersimpan (peringatan W-nilai lama tetap).
- Dokumen HANDOVER.md baris 12 menyebut `api/bridge.js` sebagai backend Vercel: itu catatan Studio asli Yonathan, tidak berlaku lagi untuk deployment ini (lihat atas).
