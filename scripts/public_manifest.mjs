// F8 S-1 + F10: dua daftar. PUBLIK = tersaji tanpa login (hanya tema/font/ikon; halaman masuk dibuat server). GATED = berkas aplikasi, tersaji hanya untuk sesi sah (server/pages.js).
// Selain keduanya (server/, db/, tests/, docs/, scripts/, cloudflare-worker/, google-apps-script/, ui-lama/, sample-data/, HANDOVER.md, NOTES_*.md, neon.ts, ...) TIDAK tersaji sama sekali.
export const PUBLIC_FILES = [];
export const PUBLIC_DIRS = ['theme', 'icons', 'vendor'];   // F22: vendor/ = pdf.js, jsPDF, autotable (self-host; pustaka publik, tanpa rahasia)
export const PUBLIC_PATTERNS = [/^theme\//, /^icons\//, /^vendor\//];
export const GATED_FILES = ['index.html'];
export const GATED_DIRS = ['compiler', 'studio-ext', 'shell', 'architecture'];
export const GATED_PATTERNS = [/^index\.html$/, /^compiler\//, /^studio-ext\//, /^shell\//, /^architecture\//];   // F15: architecture/ = diagram + index.json + ERD_relasi.*, tersaji hanya setelah masuk
