# Panduan Handover Pengembangan — UDT Studio

Dokumen ini disiapkan untuk developer baru yang melanjutkan pengembangan **UDT Studio** menggunakan alur **Fork (Opsi A)** agar lingkungan produksi (`https://udt-studio.vercel.app/` dan Google Drive lab) tetap aman dan tidak terganggu.

---

## 1. Arsitektur Singkat

| Komponen | Lokasi | Fungsi |
| :--- | :--- | :--- |
| **Frontend + Kalkulasi + Export** | `index.html` & `UDT Studio.html` | Single-file web app (HTML/CSS/JS vanilla): parser CSV & PDF (PDF.js), validasi standar/bracketing, perhitungan disolusi & $f_2$ (BPOM/EMA/FDA), grafik SVG, cetak PDF (jsPDF), serta ekspor Google Sheets. **Kedua file ini harus selalu identik.** |
| **Backend Vercel (Produksi)** | `api/bridge.js`, `vercel.json`, `package.json` | Vercel Serverless Function (`/api/bridge`) yang meneruskan request ke handler utama di `cloudflare-worker/worker.js` menggunakan `process.env`. |
| **Logika Bridge API** | `cloudflare-worker/worker.js` | Handler standar Web Fetch API untuk menjembatani `googledrive`, `googlesheets` (via Composio Platform `v3.1`), dan `resolve_samples_ai` (via Gemini API). |
| **Data Uji & Verifikasi** | `sample-data/demo-package/`, `verify_scenarios.py` | 4 skenario data uji (CSV & PDF) beserta skrip Python referensi perhitungan $f_2$ dan RSD. |

---

## 2. Alur Kerja Pengembangan (Opsi A: Fork)

1. **Fork Repository**
   - Fork `https://github.com/yonathanchristyanto/UDT-Studio` ke akun GitHub Anda sendiri.
   - Clone hasil fork ke komputer lokal:
     ```bash
     git clone https://github.com/<akun-anda>/UDT-Studio.git
     ```
2. **Deploy Sandbox di Vercel**
   - Login ke [Vercel](https://vercel.com), pilih **Add New → Project**, lalu import repo hasil **fork** Anda (`Framework Preset: Other`, `Root Directory: ./`).
   - Tambahkan **Environment Variables** milik Anda sendiri di **Settings → Environment Variables**:
     - `COMPOSIO_API_KEY`: Project API Key (`ak_...`) dari akun [Composio Platform](https://app.composio.dev) Anda sendiri.
     - `GEMINI_API_KEY`: API Key dari [Google AI Studio](https://aistudio.google.com/apikey) Anda sendiri.
     - *(Opsional)* `COMPOSIO_USER_ID` (default: `udt_lab_shared`), `UDT_ACCESS_TOKEN`, `ALLOWED_ORIGINS` (default: `*`).
   - Setelah deploy selesai, Anda akan memiliki URL dev sendiri (mis. `https://udt-studio-dev.vercel.app`).
3. **Arahkan Aplikasi ke Backend Dev Tanpa Mengubah Kode**
   - Buka aplikasi dev Anda, masuk ke **Langkah 5 (Export ke Sheets)** → klik **Ganti / Putus** pada panel *Koneksi Google* → masukkan `https://<proyek-dev-anda>.vercel.app/api/bridge` → klik **Hubungkan Backend**.
   - Lakukan otorisasi **Google Drive** & **Google Sheets** sekali menggunakan akun Google testing Anda.

---

## 3. Setup Google Drive Sandbox (Wajib untuk Uji Ekspor)

Jangan menguji ekspor ke folder produksi lab. Siapkan di Google Drive Anda:
1. Buat 1 folder output khusus testing (mis. `UDT Output - DEV`).
2. Minta pemilik proyek membagikan (*Viewer*) 3 Master Template produksi, lalu buat **Make a copy** ke Drive Anda:
   - `Master Calculation`
   - `Master Report`
   - `Master Summary`
3. Untuk menguji tanpa mengubah `CONFIG` produksi, Anda dapat menempelkan ID folder `UDT Output - DEV` di kolom **Folder Output di Drive** pada Langkah 5, atau mengganti ID di `CONFIG` (`index.html` sekitar baris `4213–4226`) **khusus di branch/commit testing** (jangan ikut di-PR!).

---

## 4. Peta Kode Penting (`index.html`)

- **Konfigurasi Backend & ID Drive/Template:** `DEFAULT_BACKEND_URL`, `DEFAULT_GAS_URL`, `CONFIG` (sekitar baris `4208–4226`).
- **Parser CSV & PDF:** `readPdf`, `parsePdfText`, `parseCaryPdfPages`, `parseCSV`, `textEntry` (sekitar baris `4478–4570` dan blok fungsi di atasnya).
- **Klasifikasi Sampel & Resolusi Pra-Langkah 2:** `classifyName`, `analyzePendingResolutions`, `openPreStep2Modal`, `handleAutoResolveWithAI`.
- **Perhitungan Disolusi & $f_2$:** `calcBatchWithStdMapping`, `calcBatchProfile`, `evalSimilarityF2`, `classifyF2Outcome` (sekitar baris `3894–4127`).
- **Penulisan Google Sheets & Ekspor:** `buildTabWrites` (`4131–4203`), `sendCalculationMedium`, `sendReportMedium`, `sendSummaryMedium`, `executeExportCommand` (sekitar baris `8807–9607`).

---

## 5. Verifikasi Sebelum Pull Request (PR)

1. Uji keempat skenario di `sample-data/demo-package/` (CSV dan PDF):
   - `01_Empagliflozin_HPLC_Similar_and_VeryRapid` (4 media, Very Rapid ≥ 85% @ 15')
   - `02_Candesartan_HPLC_NotSimilar` (Not Similar, $f_2 < 50$)
   - `03_Metformin_UV_Cary60_Rapid` (format UV Cary 60)
   - `04_Atorvastatin_HPLC_HighRSD_Warning` (peringatan % RSD PerBPOM No. 11/2022)
2. Pastikan sebelum membuka **Pull Request** ke `yonathanchristyanto/UDT-Studio` (`main`):
   - `DEFAULT_BACKEND_URL` tetap `"https://udt-studio.vercel.app/api/bridge"`.
   - `CONFIG` tetap menggunakan ID folder & template produksi.
   - File `UDT Studio.html` sudah disalin identik dari `index.html`:
     ```powershell
     Copy-Item index.html "UDT Studio.html" -Force
     ```
   - Tidak ada file secret (`.env`, `.dev.vars`) yang ikut ter-commit.
