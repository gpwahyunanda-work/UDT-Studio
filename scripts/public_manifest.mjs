// F8 S-1: SATU daftar apa yang boleh tersaji ke klien. Dipakai pembuat folder public/ (Vercel) dan server Node.
// Selain ini (server/, db/, tests/, docs/, scripts/, cloudflare-worker/, google-apps-script/, ui-lama/, sample-data/, HANDOVER.md, NOTES_*.md, neon.ts, ...) TIDAK tersaji.
export const PUBLIC_FILES = ['index.html'];
export const PUBLIC_DIRS = ['compiler', 'theme', 'studio-ext', 'icons'];
export const PUBLIC_PATTERNS = [/^index\.html$/, /^compiler\//, /^theme\//, /^studio-ext\//, /^icons\//];
