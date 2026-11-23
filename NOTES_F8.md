# NOTES_F8 (BRAHMA, 23 Nov 2026) - cabang feat/compile-s1, lokal, tanpa push/deploy
Dasar: docs/F5_laporan.md + docs/F8b_erd_3nf.md. Hasil: npm test 112/112 (92 lama + 20 tes 16); modules.lock tidak berubah.
- S-1: public/ dibangun oleh scripts/build_public.mjs dari scripts/public_manifest.mjs; vercel.json outputDirectory=public + includeFiles server/**; scripts/check_exposure.mjs = 0 berkas non-publik. Kata sandi DB uji dari env UDT_TEST_PG / UDT_TEST_PG_PASSWORD.
- S-2: nilai resmi impor = tercetak sheet; data baru = Langkah 4; f2s (n=3) pembanding. Kontrak API diperbarui. CATATAN: README menyebut Zemyc F0048E26A 57, sheet mencetak 56,56 (dibulatkan 57) - sesuai.
- S-3: 400 untuk test_date tak valid (preview juga), id > bigint, NUL, compile_id raksasa; FK 23503 -> 409; kelas 22 -> 400.
- S-4: server hitung ulang f2/Total/n; f2=99,9 ditolak 400.
- S-5: header halaman (server/pageHeaders.js = vercel.json), ACAO statis dibuang. CSP memakai 'unsafe-inline' (Studio sebaris).
- Migrasi 0004 (R1 UNIQUE medium, R2 CHECK alias_key, R3 role nullable, R5 UNIQUE name_key) + db/down/0004_down.sql; uji maju-mundur di tes 16. batch.role/brand_name tidak ditulis lagi.
- UI: PNG 1800 px, Cetak 1 halaman (printToPDF 1 halaman x4 produk x terang/gelap), tema otomatis/terang/gelap, Kelola run (ubah/hapus/pulihkan/jejak; pembaca tidak melihat). Ditahan Empagliflozin F0058D26A 500mL di payload + laporan impor.
- docs/PEMULIHAN_PERAN_DB.md. DS_v0.3 DS-17 dan RTM_v0.3 diperbarui.
Keterbatasan jujur: tangkapan layar via harness file:// (peramban menolak localhost); analisis visual mode gelap menemukan catatan kosmetik (tag kecil di tepi matriks Release, sumbu grafik kecil di PNG) yang belum dibereskan; kontras token gelap lulus (evidence/f8/kontras_gelap.txt). Belum diuji di Vercel. Keputusan manusia (P-1 nilai f2 resmi) tidak diputuskan.
