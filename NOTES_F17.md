# NOTES F17 (24 Nov 2026) — rute Vercel, f2 resmi = Langkah 4, keseragaman UI, matriks, parity keluaran

Cabang `feat/compile-s1`, lokal saja (tanpa push/deploy). Tes penuh: **203/203 lulus, 0 dilewati** (`evidence/f17/npm_test_penuh.txt`; basis data uji khusus `udt-f17-pg` port 54341 agar tidak bertabrakan dengan uji lain di `udt-f4-pg`, lihat bagian 7).

## 1. Rute Vercel (F16-01, pemblokir)
- Penyebab: rewrite `/api/:rute(.+)` → `/api/[...rute]` menambahkan `?rute=...` (juga `...rute`, `path`, `nxtP*`) ke `request.url`; `parseView` (record) menolak "parameter tidak dikenal".
- Perbaikan: `stripInjected(url)` di awal `handle()` (`server/app.js`) membuang kunci injeksi SEKALI sebelum semua pembaca parameter (record tabel dan CSV, `compiles/match`, ekspor `format`, impor `dry`, dll.). Parameter asing dari klien tetap 400.
- Tes `tests/22` A1-A4: semua tabel x tiga peran x empat bentuk injeksi (termasuk kunci berawalan `...`), CSV, 13 endpoint GET ber-parameter (hasil identik dengan/ tanpa injeksi), impor `?dry=1`, halaman. **Regresi dibuktikan**: tanpa perbaikan A2/A3/A4 gagal (`evidence/f17/t_tanpa_perbaikan.txt`, "400 !== 200").
- Batas jujur: `vercel dev` tidak dijalankan (butuh akun/jaringan); rewrite ditiru dengan `request.url` yang sama. Uji nyata di Vercel tetap tugas AGNI setelah deploy.

## 2. f2 resmi = Langkah 4 (jawaban tim P-1)
- Satu sumber: `server/f2resmi.js` (`officialPair`, `heldReason`, `withOfficialF2`) memanggil fungsi Studio lewat `udtBridge`; tanpa rumus baru (dites). Dipakai dashboard (matriks, chip, KPI, cetak, PNG) dan ekspor.
- Sel: `{f2, k, n, total, src:'langkah4', sheet|null, f2s, ks, beda_sheet, beda_tim, cause}`; kunci lama `f2l/kl/nl/beda/beda_resmi` dan temuan `beda_l4` dihapus. Perlu dicek: jenis tunggal "Beda dengan sheet lama" (selisih > 1 atau status berbeda; angka resmi, angka sheet/tim, penyebab).
- Penyebab hanya yang dapat dibuktikan: n berbeda; f2 tercetak tidak cocok dengan Total/n tercetaknya sendiri; Total berbeda pada n sama (sheet tidak menyimpan selisih per titik, maka ditampilkan kuadrat selisih Langkah 4 per titik); status saja.
- UI: legenda "Angka resmi = Langkah 4"; rincian sel = Langkah 4 (n, Total) utama + catatan kecil sheet/tim + penyebab; pratinjau dan konfirmasi simpan memakai Langkah 4.
- Dokumen: URS/FS/DS/RTM v0.3 (tambahan F17; REQ-041/073 dibaca ulang, REQ-089 baru, status RENCANA menunggu pengesahan) dan `docs/KONTRAK_API_COMPILER.md` (juga disalin ke `repo/docs/`, lihat bagian 7).

### Angka README versus Langkah 4 (sel yang disebut README) — untuk diputuskan Wahyu/Yonathan
| Sel | README / sheet | Langkah 4 (resmi) | Ditandai | Penyebab |
|---|---|---|---|---|
| Zemyc Release F0048E26A vs NG7930 | 57 (56,56; n 5; Total 268,3) | 56,6 (n 5; Total 268,3) | tidak | sama |
| Zemyc Release F0048F26A | 54 (53,62; n 5; Total 353,1; Similar) | **42,8 (n 5; Total 962,0; Not Similar)** | ya | n sama, Total berbeda: rerata titik di sheet tidak sama dengan rerata dari nilai per vessel (kuadrat selisih Langkah 4 per titik ada di teks Perlu dicek). Status BERBEDA |
| Gionix F0080G26A Release | 44,3 (n 5; Total 838,9) | 44,3 (n 5; 838,9) | tidak | sama |
| Vastrol F0066A26A pH 4,5 vs Ezero | 36,9 (n 3) | 36,6 (n 2) | tidak (selisih 0,3) | n 2 (pemotongan 85%) |
| Vastrol F0066A26A pH 4,5 vs Crestor | 58,1 | 58,1 (n 3) | tidak | sama |
| Vastrol Crestor vs Ezero pH 4,5 | 46,7 (n 3, Not Similar) | 47,6 (n 2, **sangat cepat**) | tidak (selisih 0,9) tetapi status README "Not Similar" menjadi "sangat cepat"; ditandai oleh status | n 2 |
| Vastrol Crestor vs Ezero pH 1,2 | 44,1 | 44,1 (n 3) | tidak | sama |

Seluruh daftar: `evidence/f17/perbedaan_readme_vs_langkah4.md` — dari 145 sel bertanda angka sheet, 56 sama (f2 1 desimal, n, status), 89 berbeda angka/n/status, **18 melewati ambang (selisih > 1 atau status) dan ditandai**. Pertanyaan keputusan (bukan diputuskan agent): (a) F0048F26A Zemyc Release: sheet 54 Similar vs Langkah 4 42,8 Not Similar; apakah rerata di sheet salah; (b) skenario README yang menyebut angka sheet diperbarui ke angka Langkah 4 atau dibiarkan sebagai riwayat.

### Empat skenario demo Studio (butir 6)
Tes `tests/22` B mengirim data skenario demo (`sample-data/demo-package`) sebagai data baru dan membandingkan matriks (`f2`, `n`, status, Total) dengan fungsi asli Studio (`UDT Studio.html` lewat `loadPageHost`) dengan `===` (tanpa toleransi), plus angka di ekspor xlsx. Hasil: Empagliflozin pH 1,2 96,80 (n 2, sangat cepat), pH 4,5 92,15 (n 5), pH 6,8 86,99 (n 4), Air 83,85 (n 6); Candesartan 29,92 (n 4, Not Similar); Metformin 83,76 (n 3, sangat cepat); Atorvastatin 96,99 (n 5) dengan peringatan RSD 26,4% pada 5 menit dan 10,6% pada 20 menit.
**Ketidaksesuaian dokumen lama (tidak dipaksakan):** `RINGKASAN_SKENARIO_DEMO.md` menyebut Empagliflozin pH 4,5 ≈ 74,2, pH 6,8 ≈ 72,8, Air ≈ 68,5 dan Candesartan 31,15; `verify_scenarios.py` memotong titik hanya bila KEDUA produk ≥ 85% (31,15; 92,15 n 5) sedangkan modul Studio memotong bila SALAH SATU ≥ 85% (29,92 untuk Candesartan). Angka Studio = yang resmi. Lembar rujukan dan skrip verifikasi perlu diperbarui oleh pemilik dokumen (keputusan manusia).

## 3. Keseragaman (arahan Wahyu, A)
- Akar: shell tidak memakai nilai terhitung Studio (bilah atas 54 vs 64, logo 40 vs 44, judul 15,5 vs 20, stepper kapsul vs tab bergaris bawah) dan lebar 1100/1400/1480/1360 vs 1600.
- Perbaikan: token tunggal `--udt-wrap-max:1600px`, `--udt-pad-x:24px` (14px atas, 80px bawah) di `shell.css` untuk Beranda, Record, Architecture, Compiler (header, main, formulir, pengguna); bilah atas dan stepper meniru nilai terhitung Studio (`scripts/f17_style_diff.mjs` membuktikan selisih gaya hilang). Record: sidebar kini kartu bertepi penuh di dalam kontainer 1600.
- Bukti: `evidence/f17/layout/` (`layout_sebelum.md` vs `layout_sesudah.md`, `layout_uji.json` dari tes, `style_diff_sebelum.txt`, tangkapan layar 1366/1920 terang/gelap). Tes `tests/23` A: tinggi bilah atas, tinggi stepper, tinggi tombol Tampilan, ukuran font judul: selisih <= 1 px terhadap Studio; lebar isi 1920 sama (1600); inset kiri efektif 1366 sama; tanpa gulir horizontal; 5 halaman x 2 lebar x 2 tema.
- Catatan: di 1366 lebar total berbeda karena sidebar 232 px (ruang kerja lebih sempit); yang dikunci adalah token dan tepi dalam.

## 4. Matriks f2 (B)
- Grid: centang | Batch (min 150, 220 bila > 4 medium) | N medium | kolom peringatan tetap | kolom **Aksi** tetap (Kelola rata kanan, header "Aksi"). Chip varian DI BAWAH nama batch; tanggal di bawahnya. Bila > 4 medium: matriks LEBAR PENUH di atas, grafik 2x2 di bawah (`.split.wide`).
- Sel "ditahan": ukuran dan tipografi sel nilai, tanda jeda (sama dengan legenda). Legenda memuat: Similar, sangat cepat, Not Similar, ditahan, tidak valid, ⚠ temuan, penanda grafik (bentuk/warna), baru dikirim, dan "Angka resmi = Langkah 4".
- Tes `tests/23` B (DOM nyata, CDP 9222): Empagliflozin 25 mg dan 10 mg, semua baris, 1366 dan 1920, terang dan gelap: tanpa tumpang tindih, tanpa isi keluar kotak, Kelola lurus dan sejajar header, tinggi baris ber-chip <= baris lain + 22 px, lebar penuh, legenda lengkap. B2: Vastrol (<= 4 medium) tetap dua kolom.
- Pengamatan, bukan perubahan: kurva pH 6,8 untuk batch ditahan F0058D26A 500mL tetap tergambar (data profil, bukan angka f2); apakah kurva ditahan juga disembunyikan = keputusan manusia.

## 5. Parity keluaran (F16-02, F16-03)
- Ekspor xlsx memuat SEMUA sel matriks (`withOfficialF2(data, dashboard)`: himpunan perbandingan = himpunan sel). Sel yang tidak tersimpan di sheet diberi catatan "[dihitung Langkah 4; tidak tercetak di sheet lama]".
- Blok ditahan: matriks, chip, ekspor xlsx/csv/tsv tanpa angka. xlsx: blok memuat catatan "DITAHAN saat impor" dan nilai vessel dikosongkan; CSV/TSV: satu baris penanda "Ditahan" tanpa angka; chip: "· ditahan". Cetak dan PNG membaca chip dari DOM yang sama.
- Tes `tests/24` P1 (semua 5 produk: himpunan f2 matriks = himpunan f2 ekspor, jumlah penanda "dihitung" dan "ditahan" sama), P2 (Empagliflozin 25 mg F0058D26A 500mL pH 6,8), P3 (sumber kode); `tests/23` B (chip ditahan di DOM).
- Pengecualian yang diketahui: untuk profil IDENTIK (Total persis 0) ExcelJS tidak menyimpan nilai cache rumus (0); Excel menghitung ulang saat dibuka, tetapi pembaca sheet kita tidak membaca balik dua sel itu; tes pergi-pulang (tests/10) mengecualikannya dengan catatan.

## 6. Record (F16-04)
Keadaan awal (judul, penjelasan, legenda tulis/admin/hanya baca), keterangan (title) pada badge, label "baris" pada jumlah, pemisah ribuan format Indonesia (`toLocaleString('id-ID')`).

## 7. Lingkungan uji dan pelewatan (183/188 di lingkungan AGNI)
Lima pelewatan di `t01_npm_test_165d80e.txt` (kode dari `git archive`): (1-3) tiga tes impor .xlsx membaca `../data/sheets/*.xlsx` yang berada di luar repo; (4-5) dua tes membaca `../docs/KONTRAK_API_COMPILER.md`, juga di luar repo. Perbaikan: tiga fixture kecil sintetis `tests/fixtures/Development of Mini{a,b,c} ...xlsx` (dibuat `tests/fixtures/make_mini_xlsx.mjs`; tes memakai berkas asli bila ada, selain itu fixture dengan hitungannya sendiri; diverifikasi dengan `data/sheets` dipindah) dan salinan kontrak di `repo/docs/KONTRAK_API_COMPILER.md` (**dua salinan: ubah keduanya**). Hasil: 0 dilewati di lingkungan ini (203 tes). Dua lari awal saya sempat menunjukkan puluhan gagal "password authentication failed for udt_app": penyebabnya uji lain berjalan bersamaan di `udt-f4-pg` yang berbagi peran `udt_app` (setiap `createTestDb` mengubah kata sandinya); kini lari saya memakai container sendiri `udt-f17-pg` (`kerja/f17/run_tests.sh`). Lari bersamaan dengan lari AGNI sebelum itu mungkin mengganggu uji AGNI sesaat; mohon diulang bila ada kegagalan sandi di log AGNI.

## 8. Berkas
`server/f2resmi.js` (baru), `server/dashboard.js`, `server/export.js`, `server/app.js`, `server/products.js`, `compiler/{app.js,index.html,compiler-f14.css}`, `shell/{shell.css,record.css,record.js,architecture.css}`, `server/shell.js`, `scripts/f17_*.mjs`, `tests/22..24`, fixture mini, `docs/KONTRAK_API_COMPILER.md`. Bukti: `evidence/f17/` (hasil tes, layout, tabel perbedaan, demo Studio vs lembar rujukan).
