// F11 K-1: DINONAKTIFKAN pada deployment UDT Apps (bukan fungsi Vercel lagi; dipindah dari api/bridge.js, kode dipertahankan).
// Untuk mengaktifkan lagi di proyek Vercel terpisah: salin berkas ini ke api/bridge.js dan ganti impor jadi '../cloudflare-worker/worker.js'.
import worker from './worker.js';

/**
 * Vercel Serverless Function entrypoint for the UDT Studio Google/Gemini bridge.
 * Delegates standard Web Fetch Request/Response directly to the shared bridge handler.
 */
export default {
  async fetch(request) {
    return worker.fetch(request, process.env);
  }
};
