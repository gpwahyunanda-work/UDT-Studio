// F10: SATU tabel kebenaran peran x endpoint. Dipakai server (guard) dan tes (matriks); docs/KONTRAK_API_COMPILER.md memuat tabel yang sama (tes membandingkan).
// min: 'any' (peran apa pun yang sudah masuk), lalu pembaca < penulis < admin. Rute tidak terdaftar: 404 setelah masuk.
export const RANK = { pembaca: 1, penulis: 2, admin: 3 };
export const ROLES = ['pembaca', 'penulis', 'admin'];
export const RULES = [
  // [method, pola, min, contoh path untuk tes]
  ['GET', /^\/api\/me$/, 'any', '/api/me'],
  ['POST', /^\/api\/auth\/logout$/, 'any', '/api/auth/logout'],
  ['POST', /^\/api\/auth\/password$/, 'any', '/api/auth/password'],
  ['PUT', /^\/api\/me\/analyst$/, 'any', '/api/me/analyst'],
  ['GET', /^\/api\/products$/, 'pembaca', '/api/products'],
  ['GET', /^\/api\/products\/\d+$/, 'pembaca', '/api/products/1'],
  ['GET', /^\/api\/products\/\d+\/dashboard$/, 'pembaca', '/api/products/1/dashboard'],
  ['GET', /^\/api\/products\/\d+\/export$/, 'pembaca', '/api/products/1/export'],
  ['GET', /^\/api\/compiles$/, 'pembaca', '/api/compiles'],
  ['GET', /^\/api\/compiles\/\d+$/, 'pembaca', '/api/compiles/1'],
  ['GET', /^\/api\/compiles\/\d+\/data$/, 'pembaca', '/api/compiles/1/data'],
  ['GET', /^\/api\/compiles\/\d+\/export$/, 'pembaca', '/api/compiles/1/export'],
  ['GET', /^\/api\/compiles\/match$/, 'penulis', '/api/compiles/match'],
  ['GET', /^\/api\/products\/match$/, 'penulis', '/api/products/match'],
  ['GET', /^\/api\/compiles\/\d+\/removed$/, 'penulis', '/api/compiles/1/removed'],
  ['GET', /^\/api\/runs\/\d+\/audit$/, 'penulis', '/api/runs/1/audit'],
  ['GET', /^\/api\/imports\/\d+\/report$/, 'penulis', '/api/imports/1/report'],
  ['POST', /^\/api\/products$/, 'penulis', '/api/products'],
  ['POST', /^\/api\/products\/\d+\/runs\/preview$/, 'penulis', '/api/products/1/runs/preview'],
  ['POST', /^\/api\/products\/\d+\/runs$/, 'penulis', '/api/products/1/runs'],
  ['POST', /^\/api\/compiles$/, 'penulis', '/api/compiles'],
  ['POST', /^\/api\/compiles\/\d+\/aliases$/, 'penulis', '/api/compiles/1/aliases'],
  ['PATCH', /^\/api\/runs\/\d+$/, 'penulis', '/api/runs/1'],
  ['POST', /^\/api\/runs\/\d+\/delete$/, 'penulis', '/api/runs/1/delete'],
  ['POST', /^\/api\/runs\/\d+\/restore$/, 'penulis', '/api/runs/1/restore'],
  ['POST', /^\/api\/imports\/xlsx$/, 'penulis', '/api/imports/xlsx'],
  ['POST', /^\/api\/imports$/, 'penulis', '/api/imports'],
  ['POST', /^\/api\/ingest\/preview$/, 'penulis', '/api/ingest/preview'],
  ['POST', /^\/api\/ingest\/commit$/, 'penulis', '/api/ingest/commit'],
  ['GET', /^\/api\/record\/tables$/, 'pembaca', '/api/record/tables'],
  ['GET', /^\/api\/record\/tables\/[a-z_]+$/, 'pembaca', '/api/record/tables/compile'],
  ['GET', /^\/api\/record\/tables\/[a-z_]+\/csv$/, 'pembaca', '/api/record/tables/compile/csv'],
  ['POST', /^\/api\/record\/tables\/[a-z_]+\/rows$/, 'penulis', '/api/record/tables/compile/rows'],
  ['PATCH', /^\/api\/record\/tables\/[a-z_]+\/rows\/\d+$/, 'penulis', '/api/record/tables/compile/rows/1'],
  ['POST', /^\/api\/record\/tables\/[a-z_]+\/rows\/\d+\/delete$/, 'penulis', '/api/record/tables/run/rows/1/delete'],
  ['POST', /^\/api\/record\/tables\/[a-z_]+\/rows\/\d+\/restore$/, 'penulis', '/api/record/tables/run/rows/1/restore'],
  ['GET', /^\/api\/admin\/users$/, 'admin', '/api/admin/users'],
  ['POST', /^\/api\/admin\/users$/, 'admin', '/api/admin/users'],
  ['PATCH', /^\/api\/admin\/users\/\d+$/, 'admin', '/api/admin/users/1'],
];
// Tanpa sesi: hanya login dan health (dikelola langsung di handler).
export const PUBLIC_ROUTES = [['GET', '/api/health'], ['POST', '/api/auth/login']];

export function requiredRole(method, path) {
  const hit = RULES.find(([m, re]) => m === method && re.test(path));
  return hit ? hit[2] : null;
}
export const allowed = (role, min) => min === 'any' || RANK[role] >= RANK[min];
