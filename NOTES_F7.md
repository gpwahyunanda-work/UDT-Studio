# NOTES F7: Tema Pharos untuk UDT Studio dan UDT Compiler (kartu t_173ac660)

Tanggal 23 Nov 2026. Lokal saja: tanpa push, tanpa deploy (INDRA). Cabang `feat/compile-s1`, dasar HEAD fa7c670. Skill dimuat: draft-review-commit tidak dipakai (lokasi final disebut kartu), browser-use (bukti layar), token-saver, ponytail.

## Keputusan desain
- **Satu berkas tema bersama**: `theme/pharos-theme.css` (token `--pharos-*`) dipakai Studio dan Compiler. Huruf Google Sans (OFL, merek Pharos) tertanam lokal sebagai woff2 variabel (`theme/fonts/`, subset Latin, 86 KB + 90 KB miring), cadangan Arial, tanpa CDN. Logo Pharos (`media/image1.png`, dipangkas dan diperkecil) di `theme/pharos-logo.png`, dipasang di header Studio dan di tiga tajuk Compiler (login, dashboard, formulir). Favicon Studio dan Compiler diganti logo Pharos.
- **Warna**: biru #0064A2 utama; hijau #009042 aksen/valid (untuk TEKS hijau dipakai turunan gelap #00703A karena #009042 di atas putih hanya 4,14:1); navy #0C132B untuk bilah nav Compiler dan mode gelap; slate #353744; mint #63D297 (aksen mode gelap); kuning #FFE239 hanya peringatan (isi kuning-muda, teks #5C4A00); merah #980000 hanya Not Similar/bahaya; oranye hanya sebagai seri grafik pembanding (turunan gelap #B85C00 agar kontras 4,6:1). Tint dan garis netral (#E6F0F6, #E3F4EA, #F6E6E6, #D9DCDD, #8E9496 dst.) adalah turunan dari warna merek dan terdaftar di bagian token.
- **Bentuk**: latar putih, garis tipis, radius 4 px seragam (bukan kapsul/10 px), tanpa bayangan dekoratif, tanpa gradien (kartu "berbagi" Uji+Pembanding di Studio, lencana, header laporan), bilah langkah Studio jadi tab datar bergaris bawah biru. Judul 700 dan lebih tegas. Emoji hias dibuang (⏳ ✨ di tombol AI Studio).
- **Uji = biru, Pembanding = slate** di Studio (sebelumnya teal dan ungu-indigo); dibedakan juga oleh label "Uji"/"Pembanding" dan penanda, bukan warna saja.
- **Grafik aman buta warna**: seri dibedakan warna DAN bentuk penanda (lingkaran, kotak, segitiga, dst., sudah ada dan dipertahankan) plus garis putus-putus. Palet seri: biru #0064A2, oranye tua #B85C00, biru muda #4F8FB8, abu #6E7387; komparator Compiler hitam tebal, "lainnya" putus-putus. Studio: pembanding oranye putus-putus + kotak, uji biru + lingkaran. Semua ≥ 3:1 di atas putih.
- **Chip Similar di Compiler** diubah dari biru ke hijau (hijau = valid). Biru dipakai hanya untuk interaksi/pilihan.
- **Mode gelap Studio** (tombol Tampilan atau preferensi sistem) = navy Pharos; grafik tetap di kanvas putih supaya warna seri kontras. Seri biru di atas navy tidak diuji lain di luar itu.
- Kontras: `evidence/f7/kontras.txt` (dibangkitkan `kerja/f7/kontras.mjs` dari token). Semua pasangan teks ≥ 4,5 (terendah 4,99: abu #666 di #EFEFEF), grafis/kontrol ≥ 3 (terendah 3,08: tepi kontrol #8E9496). 0 gagal. Fokus keyboard: cincin 2 px biru (mint di atas navy) + halo putih; terbukti `outline: solid rgb(0,100,162) 2px` pada elemen terfokus di Studio dan Compiler.

## Batas yang dijaga
- Studio: HANYA lapisan tampilan. Rumus dan logika tidak disentuh; perubahan di `index.html` = kait `<link>` tema, ikon, logo header, daftar warna seri/kanvas grafik, gaya dokumen laporan cetak (warna/huruf), tombol AI tanpa emoji. Tanpa perubahan pada fungsi terkunci maupun markup p1..p5. `index.html` = `UDT Studio.html` (disalin).
- Satu ✨ tersisa di teks bantuan p1 (daftar SOP): bagian p1 dikunci hash `modules.lock` (IQ-01), jadi sengaja TIDAK diubah. Bila Wahyu mau hilang juga, kunci perlu dibangkitkan ulang (keputusan manusia).
- Compiler: struktur, id, kelas, teks tim tidak berubah (tes 14 tetap menjaga). Hanya warna/huruf/radius/bayangan diganti token; `compiler.css` kini tanpa @font-face Inter/Space Grotesk, dan `compiler/fonts/` (Inter, Space Grotesk) dihapus. Tes 14 butir "CSS apa adanya" diganti jadi "daftar selektor sama + tanpa font stok + tema dimuat dahulu".
- Server dev `server/node-server.mjs`: `/theme/` ditambahkan ke daftar publik dan `.woff2` ke tabel MIME. (Vercel menyajikan `theme/` dari akar; belum diuji di Vercel karena tanpa deploy.)

## Bukti
- `npm test` bersih: **92/92 lulus** [LAPTOP] (86 lama termasuk IQ-01/02/03 modules.lock + 6 baru di `tests/15_tema_pharos.test.js`); `evidence/f7/npm_test.txt`. Nilai f2 Studio sama sebelum/sesudah pada data demo (98/94/90/86, n = 4).
- Tangkapan layar di `evidence/f7/` (1360 px Compiler, ±1280 px Studio, mode terang kecuali ditandai): `sebelum_studio_1_unggah` dan `_2` .. `_5`, `sesudah_studio_*` (semua langkah), `sebelum_compiler_login|dashboard|form`, `sesudah_compiler_login|dashboard|form`, `sesudah_studio_1_gelap`, `sesudah_studio_4_gelap`, `sesudah_studio_fokus_papan_ketik`, `sesudah_compiler_fokus_papan_ketik`.
- Cara ambil: peramban agen menolak 127.0.0.1, jadi (a) Studio dibuka lewat `file://` dengan CSV demo (skenario 01 Empagliflozin) dan parameter standar diisi; "sebelum" = `index.html` HEAD fa7c670 di `kerja/f7/before/`; (b) Compiler lewat harness `file://` dengan API disimulasikan dari snapshot DB dev lokal (data Vastrol; `kerja/f7/snap.mjs`, `mk_harness.py`). Itu tangkapan layar tampilan, BUKAN uji API.

## Daftar berkas berubah (repo, cabang feat/compile-s1)
Baru: `theme/pharos-theme.css`, `theme/pharos-logo.png`, `theme/fonts/GoogleSans-var.woff2`, `GoogleSans-Italic-var.woff2`, `OFL-GoogleSans.txt` (pindah dari OFL-SpaceGrotesk), `tests/15_tema_pharos.test.js`. Diubah: `index.html`, `UDT Studio.html`, `compiler/index.html`, `compiler/compiler.css`, `compiler/app.js`, `server/node-server.mjs`, `tests/14_compiler_html_tim.test.js`. Dihapus: `compiler/fonts/Inter.ttf`, `SpaceGrotesk.ttf`. Skrip dan bukti kerja di `kerja/f7/` (`edit_studio.py` = langkah awal; keadaan akhir ada di git), `evidence/f7/`.

## Tidak diverifikasi / catatan jujur
- Tidak diuji di Vercel/produksi dan tidak di peramban selain Chrome agen. Tampilan ponsel/layar sempit tidak diuji.
- Bila Studio dibuka sebagai satu berkas tanpa folder `theme/` (mis. dikirim lewat surel), tema tidak termuat dan tampilan kembali ke gaya lama, karena huruf, logo, dan token ada di luar `index.html`. Pilihan: sematkan base64 (membengkak ±250 KB) atau selalu serahkan bersama folder `theme/`. Belum diputuskan.
- Penilaian "tidak terkesan AI slop" bersifat subjektif; saya hanya mengukur hal yang terukur (palet, huruf, kontras, bentuk). Sebagian kritik model visi (kartu seragam, jumlah chip) tidak diubah karena menyentuh tata letak tim.
- Teks ganda di formulir Compiler (f2 36,6 vs 36,5, n=3 vs n=2) berasal dari dua nilai f2 (Q-16 menunggu Yonathan), bukan dari tema.
- Titik pantau: kunci `modules.lock` p1 membuat panel Langkah 1 tidak bisa diubah teksnya tanpa regenerasi kunci.
- Server dev (port 8791) saya nyalakan untuk snapshot; sandi role `udt_app` di DB dev direset kembali setelah `npm test` mengubahnya (tes menimpa sandi itu setiap kali jalan; sudah dicatat di NOTES_F6).
