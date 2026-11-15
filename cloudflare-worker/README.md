# UDT Studio — Backend Cloudflare Worker + Composio Platform

Backend tipis ini menggantikan **Google Apps Script (`Code.gs`)** sepenuhnya untuk:
1. Ekspor **Calculation**, **Report**, dan **Summary** ke **Google Sheets & Google Drive** via **Composio Platform** (1 akun Google bersama, token dikelola permanen oleh Composio tanpa kedaluwarsa tiap 1 jam).
2. Proxy fitur **`✨ Rapikan dengan AI` (Gemini API)** melalui `GEMINI_API_KEY` yang tersimpan aman di sisi server Cloudflare.

---

## Cara Deploy Paling Mudah (Tanpa Install Node.js / Wrangler di PC)

### Langkah 1 — Siapkan Key di Composio Platform Dashboard
1. Buka **https://app.composio.dev** → pastikan berada di mode **Platform**.
2. Buka **Settings → Project Settings → API Keys** dan salin **Project API Key** (`COMPOSIO_API_KEY`, biasanya diawali `ak_...`).

### Langkah 2 — Buat Worker di Cloudflare
1. Masuk ke **Cloudflare Dashboard** → **Workers & Pages** → **Create** → **Create Worker** (atau **Hello World** template).
2. Beri nama misal `udt-studio-api` lalu klik **Deploy**.
3. Klik **Edit code**, hapus isi bawaan, lalu salin seluruh isi file **`cloudflare-worker/worker.js`** dan klik **Deploy**.

### Langkah 3 — Pasang Variables & Secrets di Cloudflare
Masuk ke tab **Settings → Variables and Secrets** pada Worker Anda, lalu tambahkan:

* **Variables (Plaintext):**
  * `COMPOSIO_USER_ID` = `udt_lab_shared`
  * `ALLOWED_ORIGINS` = `*` *(atau isi domain GitHub Pages Anda, mis. `https://yonathanchristyanto.github.io`)*
* **Secrets (Encrypted):**
  * `COMPOSIO_API_KEY` = *(Project API Key `ak_...` dari Composio Platform)*
  * `GEMINI_API_KEY` = *(API Key Gemini untuk fitur `✨ Rapikan dengan AI`)*
  * *(Opsional)* `UDT_ACCESS_TOKEN` = *(isi hanya jika ingin endpoint Worker diproteksi kunci akses tambahan)*

### Langkah 4 — Hubungkan URL Worker & Otorisasi Google Sekali Saja
1. Salin URL Worker Anda (contoh: `https://udt-studio-api.<subdomain>.workers.dev`).
2. Buka **UDT Studio (`index.html`)** → masuk ke **Langkah 5 (`Export ke Sheets`)**.
3. Tempel URL Worker tersebut pada panel **Koneksi Google** (`Cloudflare Worker + Composio`) lalu klik **Hubungkan Worker**.
4. Akan muncul dua tombol status **Google Drive** dan **Google Sheets**:
   * Klik **`Hubungkan ↗`** pada Google Drive → selesaikan login & klik *Allow* pada tab Connect Link Composio.
   * Klik **`Hubungkan ↗`** pada Google Sheets → selesaikan login & klik *Allow* pada tab Connect Link Composio.
5. Kembali ke UDT Studio lalu klik **`Uji Koneksi & Template`** hingga keduanya berstatus **`Aktif`** dan akses ke **Master Calculation**, **Master Report**, dan **Master Summary** berstatus **OK**.
6. *(Opsional untuk tim lain)*: Supaya analis lain tidak perlu menempel URL Worker, masukkan URL Worker tersebut ke `DEFAULT_BACKEND_URL` di `index.html` (lalu kosongkan `DEFAULT_GAS_URL = ""`), commit ke GitHub Pages, dan bagikan. Analis langsung siap ekspor tanpa login & tanpa GAS.

---

## Cara Deploy via CLI (Jika Menggunakan Node.js + Wrangler)

```bash
cd cloudflare-worker
npx wrangler secret put COMPOSIO_API_KEY
npx wrangler secret put GEMINI_API_KEY
npx wrangler deploy
```
