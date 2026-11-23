// Satu fungsi untuk seluruh /api/* tab 6 (DS-05). /api/bridge dinonaktifkan (F11 K-1): ditangani app.js (404); kodenya ada di cloudflare-worker/.
import { handle } from '../server/app.js';
export const GET = handle, POST = handle, PUT = handle, PATCH = handle, DELETE = handle;
