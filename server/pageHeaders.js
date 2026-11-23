// F8 S-5: header keamanan halaman HTML (/ dan /compiler). Satu sumber untuk server Node; vercel.json memuat nilai yang sama (tes 16 membandingkan keduanya).
// CSP: tanpa CDN atau domain luar. 'unsafe-inline' diperlukan karena Studio (berkas tunggal lama) memakai skrip dan atribut gaya sebaris; blob: untuk unduhan PNG grafik.
export const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
export const PAGE_HEADERS = {
  'content-security-policy': CSP,
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};
