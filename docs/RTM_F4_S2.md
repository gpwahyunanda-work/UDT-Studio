# RTM F4 Sprint 2 — Tab 6 Compile Data UDT

Status: **teruji lokal** · 23 Nov 2026 · Tidak dipush/deploy.

| Kebutuhan / risiko | Implementasi | Bukti verifikasi | Status |
|---|---|---|---|
| UI baca tanpa mengubah Langkah 1–5 | Pulau React dipasang hanya pada tab 6 melalui `compile/app.js`; CSS diprefix `uc:` dan dipagari `#udt-compile`. | IQ-01/02, `tests/01_langkah1-5.test.js`; screenshot sebelum/sesudah di `../evidence/f4b/`. | Lulus |
| Rumus Langkah 4 tidak disalin | `ui/src/lib/udtBridge.js` memanggil `calcBatchProfile`, `evalSimilarityF2`, dan `classifyF2Outcome`. | IQ-03; hash modul pada `modules.lock`. | Lulus |
| Daftar dan dashboard baca | API read-only `GET /api/compiles/:id/data`; daftar pencarian, dashboard, matriks run/vessel, f2 antarformula. | `tests/05_udtbridge.test.js`, `tests/06_ui.test.js`. | Lulus |
| Grafik 4 kuadran / Vastrol tanpa Release | Visx: garis pembanding hitam, run warna+bentuk, 85%, RSD/error bar; fallback medium terbanyak. | `tests/06_ui.test.js`; `evidence/f4b/tab6/`. | Lulus |
| Run Tidak valid tersembunyi bawaan | Filter eksplisit di dashboard. | Tes UI dan screenshot Vastrol sintetis. | Lulus |
| Tema Pharos + aksesibilitas | Token `#0064A2`, `#009042`, Google Sans/fallback; fokus keyboard, teks Indonesia, format ID. | Tes token/format; audit browser: 0 kegagalan kontras pada data uji. | Lulus |
| Opsi B: tanpa CDN, bundel <=400 KB gzip | esbuild + dependency lokal. | `npm run build:ui`: total gzip **114,1 KB**. | Lulus |
| B3-1 Batch | `0002_delta_v03.sql`: unik `(compile_id,batch_no)`; `product_printed` di `run_source_block`. | Tes Empagliflozin 25 mg. | Lulus |
| B3-2 blok identik beda tanggal | Satu `comparison`, banyak `run_source_block.comparison_id`; alasan: comparison adalah relasi run, sumber adalah bukti baris. | Tes Gionix pH 6,8. | Lulus |
| B3-3 peran per konteks | Peran mentah tersimpan per `run_source_block`; API menurunkan `role_context` dari comparison. | Tes Crestor. | Lulus |
| B3-4/5 pembaca | Awalan `UDT`, varian luar kurung, LF, tiga gaya rumus, header berulang, kolom U opsional, berhenti di AVG. | Fixture Gionix/Vastrol/Empagliflozin25. | Lulus |
| B3-6/7 kesimpulan & cetak rusak | LF dicatat utuh dengan `conclusion_is_printed`; bila kosong ditandai bukan cetak; blok W-19 ditahan pada SumberBlok, bukan status Run. | Tes Empagliflozin25: 23/24 f2 cocok. | Lulus |
| B3-8/9/10 | D5 disimpan apa adanya + peringatan D10; uji identik memberi `W-identik-keras`; data hash berbeda menjadi Run berbeda. | Tes fixture dan `qualityWarnings`. | Lulus |

## Delta v0.3

Migrasi `0002_delta_v03.sql` bersifat expand/roll-forward: struktur legacy masih dibaca selama transisi. Tidak ada DDL produksi atau deploy pada Sprint 2. Fixture Gionix16, Vastrol20, dan Empagliflozin25 berada di `../data/sheets/csv/` dan dipakai `tests/07_delta_v03.test.js`.

## Bukti eksekusi

- `UDT_FIXTURE_DIR=../data/sheets/csv npm test`: **55 lulus, 0 gagal**.
- `npm run build:ui`: **114,1 KB gzip**.
- Browser Chrome agen: daftar compile, dashboard Zemyc, Vastrol sintetis, navigasi keyboard, 1366/1920 dan zoom 200% direkam di `../evidence/f4b/tab6/`.
- Keterbatasan yang dicatat: browser harness `file://` memakai snapshot API karena peramban agen menolak alamat `127.0.0.1`; ini bukan uji Preview.
