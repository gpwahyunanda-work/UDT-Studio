// F15: /record = penelusur tabel database ternormalisasi (baca untuk semua peran) + CRUD TERKONTROL lewat lapisan aplikasi.
// Aturan keras (REQ-080..086):
//  - Tabel dan kolom hanya dari DAFTAR PUTIH di bawah. Nama dari klien (tabel, kolom urut, kolom filter) dicocokkan ke daftar; di luar daftar = 400/404 TANPA menyentuh SQL. Nilai selalu parameter terikat.
//  - Kolom rahasia (password_hash, token_version, ip_hash, email_key) tidak ada di daftar => tidak pernah dipilih, tidak pernah dikirim.
//  - Tulis: hanya kolom deskriptif master; nama analis diketik + alasan wajib; jejak audit (nilai lama/baru); kunci optimistik (row_token, 409); peran penulis atau admin.
//  - Hapus = hanya hapus lunak (run_removal) + pulihkan. Hapus keras TIDAK ADA (peran DB tanpa hak DELETE).
//  - Nilai terukur (run_value, run_timepoint) dan turunan (comparison*, f2, total, n) hanya baca (ALCOA+, keterlacakan): koreksi lewat Studio/Timpa.
import { HttpError, ensureAnalyst, hasNul, isRealDate, aliasKey, cleanText, BAD_TEXT_MSG } from './ingest.js';
import { validateAnalystName } from './accounts.js';
import { removeRun, restoreRun } from './runs.js';

export const PAGE_SIZE = 50, CSV_CAP = 20000, MAX_FILTERS = 8, MAX_Q = 200, MAX_PAGE = 1000000;
// Kolom yang tidak boleh keluar dari tabel mana pun (uji integritas memeriksa tak satu pun ada di daftar putih).
export const FORBIDDEN = ['password_hash', 'token_version', 'ip_hash', 'email_key'];
const NOTE_RUN = 'Nilai terukur: tidak dapat diedit langsung di Record (ALCOA+: data asli dan keterlacakan). Koreksi lewat Studio dengan pilihan Timpa; run lama tetap tercatat sebagai ditimpa.';
const NOTE_DER = 'Nilai turunan (f2, total, n, kesimpulan): dihitung dari nilai terukur, tidak diedit langsung. Perbaiki nilai terukurnya lewat Studio dengan pilihan Timpa.';
const RO = {
  terukur: { kind: 'terukur', note: NOTE_RUN, action: { label: 'Perbaiki lewat Studio/Timpa', href: '/studio' } },
  turunan: { kind: 'turunan', note: NOTE_DER, action: { label: 'Perbaiki lewat Studio/Timpa', href: '/studio' } },
  jejak: { kind: 'jejak', note: 'Ditulis otomatis oleh aplikasi sebagai bukti asal dan jejak; tidak diedit di Record.' },
  kode: { kind: 'kode', note: 'Tabel kode baku; berubah hanya lewat migrasi basis data.' },
  akun: { kind: 'akun', note: 'Akun dikelola di panel Pengguna (admin). Record tidak pernah menampilkan atau mengubah kata sandi, hash, atau sesi.' },
};
const C = (s) => s.trim().split(/\s+/).map((x) => { const [name, type] = x.split(':'); return { name, type }; });

// cols: kolom yang BOLEH tampil. hidden: kolom ada di basis data tetapi tidak pernah tampil (uji: cols + hidden = katalog nyata).
// fk: kolom -> tabel.kolom induk (tautan lompat). admin: hanya admin yang boleh melihat tabel.
export const TABLES = {
  compile: { label: 'compile (produk)', group: 'Master', pk: ['compile_id'], cols: C('compile_id:int product_name:text strength:text dosage_form:text api:text api_uncertain:bool project_code:text title:text name_key:text created_by:int created_at:ts'), fk: { created_by: 'analyst.analyst_id' }, hidden: [], dir: 'asc', ro: null },
  medium: { label: 'medium', group: 'Master', pk: ['medium_id'], cols: C('medium_id:int compile_id:int code:text full_name:text volume_text:text apparatus:text rpm_text:text method:text method_ref:text method_reference_product_text:text'), fk: { compile_id: 'compile.compile_id', code: 'medium_code.code' }, hidden: [], dir: 'asc' },
  batch: { label: 'batch', group: 'Master', pk: ['batch_id'], cols: C('batch_id:int compile_id:int batch_no:text brand_name:text role:text'), fk: { compile_id: 'compile.compile_id' }, hidden: [], dir: 'asc' },
  compile_alias: { label: 'compile_alias (alias nama)', group: 'Master', pk: ['alias_id'], cols: C('alias_id:int compile_id:int alias:text alias_key:text source:text created_by:int created_at:ts'), fk: { compile_id: 'compile.compile_id', created_by: 'analyst.analyst_id' }, hidden: [], dir: 'asc' },
  analyst: { label: 'analyst (nama diketik)', group: 'Master', pk: ['analyst_id'], cols: C('analyst_id:int name:text created_at:ts'), fk: {}, hidden: [], dir: 'asc', ro: RO.jejak },
  medium_code: { label: 'medium_code (kode medium)', group: 'Kode', pk: ['code'], cols: C('code:text label:text sort_no:int'), fk: {}, hidden: [], dir: 'asc', ro: RO.kode },
  conclusion_code: { label: 'conclusion_code (kode kesimpulan)', group: 'Kode', pk: ['code'], cols: C('code:text label:text'), fk: {}, hidden: [], dir: 'asc', ro: RO.kode },
  run: { label: 'run', group: 'Run dan nilai', pk: ['run_id'], cols: [...C('run_id:int compile_id:int batch_id:int medium_id:int variant:text test_date:date manufacturer_site:text note:text is_valid:bool invalid_reason:text content_hash:text source:text push_id:uuid import_id:int created_by:int created_at:ts'),
      { name: 'status', type: 'text', virtual: true, sql: "COALESCE((SELECT CASE x.kind WHEN 'hapus' THEN 'Dihapus' WHEN 'ditimpa' THEN 'Ditimpa' ELSE 'Terlihat' END FROM run_removal x WHERE x.run_id=t.run_id ORDER BY x.seq DESC LIMIT 1),'Terlihat')" }],
    fk: { compile_id: 'compile.compile_id', batch_id: 'batch.batch_id', medium_id: 'medium.medium_id', push_id: 'studio_push.push_id', import_id: 'import_run.import_id', created_by: 'analyst.analyst_id' }, hidden: [], dir: 'desc' },
  run_timepoint: { label: 'run_timepoint (titik waktu)', group: 'Run dan nilai', pk: ['run_id', 'seq'], cols: C('run_id:int seq:int minute:num'), fk: { run_id: 'run.run_id' }, hidden: [], dir: 'asc', ro: RO.terukur },
  run_value: { label: 'run_value (nilai % terlarut)', group: 'Run dan nilai', pk: ['run_id', 'vessel_no', 'seq'], cols: C('run_id:int vessel_no:int seq:int pct:num'), fk: { run_id: 'run.run_id' }, hidden: [], dir: 'asc', ro: RO.terukur },
  run_removal: { label: 'run_removal (hapus lunak dan timpa)', group: 'Run dan nilai', pk: ['run_id', 'seq'], cols: C('run_id:int seq:int kind:text replaced_by_run_id:int at_utc:ts analyst_id:int reason:text'), fk: { run_id: 'run.run_id', replaced_by_run_id: 'run.run_id', analyst_id: 'analyst.analyst_id' }, hidden: [], dir: 'desc', ro: RO.jejak },
  run_source_block: { label: 'run_source_block (asal blok sheet)', group: 'Impor dan push', pk: ['source_block_id'], cols: C('source_block_id:int run_id:int import_id:int tab_name:text avg_row:int block_date:date ref_avg_row:int product_printed:text role_raw:text section_header_row:int comparison_id:int import_outcome:text hold_reason:text'), fk: { run_id: 'run.run_id', import_id: 'import_run.import_id', comparison_id: 'comparison.comparison_id' }, hidden: [], dir: 'asc', ro: RO.jejak },
  import_run: { label: 'import_run (impor sheet)', group: 'Impor dan push', pk: ['import_id'], cols: C('import_id:int source_name:text analyst_id:int started_at:ts f2_tolerance:num'), fk: { analyst_id: 'analyst.analyst_id' }, hidden: [], dir: 'desc', ro: RO.jejak },
  import_note: { label: 'import_note (catatan impor)', group: 'Impor dan push', pk: ['import_id', 'seq'], cols: C('import_id:int seq:int kind:text sheet_tab:text cell_range:text message:text'), fk: { import_id: 'import_run.import_id' }, hidden: [], dir: 'asc', ro: RO.jejak },
  import_check: { label: 'import_check (hitung ulang f2 impor)', group: 'Impor dan push', pk: ['import_id', 'comparison_id'], cols: C('import_id:int comparison_id:int f2_recomputed:num'), fk: { import_id: 'import_run.import_id', comparison_id: 'comparison.comparison_id' }, hidden: [], dir: 'asc', ro: RO.turunan },
  studio_push: { label: 'studio_push (kiriman Studio)', group: 'Impor dan push', pk: ['push_id'], cols: C('push_id:uuid compile_id:int analyst_id:int payload_sha256:text received_at:ts outcome:text'), fk: { compile_id: 'compile.compile_id', analyst_id: 'analyst.analyst_id' }, hidden: [], dir: 'desc', ro: RO.jejak },
  comparison: { label: 'comparison (perbandingan f2)', group: 'Perbandingan', pk: ['comparison_id'], cols: C('comparison_id:int medium_id:int test_run_id:int ref_run_id:int total_sq:num n_points:int f2:num conclusion_code:text conclusion_printed:text conclusion_is_printed:bool f2_source:text'), fk: { medium_id: 'medium.medium_id', test_run_id: 'run.run_id', ref_run_id: 'run.run_id', conclusion_code: 'conclusion_code.code' }, hidden: [], dir: 'asc', ro: RO.turunan },
  comparison_point: { label: 'comparison_point (selisih kuadrat)', group: 'Perbandingan', pk: ['comparison_id', 'seq'], cols: C('comparison_id:int seq:int sq_diff:num'), fk: { comparison_id: 'comparison.comparison_id' }, hidden: [], dir: 'asc', ro: RO.turunan },
  // ---- hanya admin ----
  app_user: { label: 'app_user (akun)', group: 'Akun dan audit', admin: true, pk: ['user_id'], cols: C('user_id:int display_name:text email:text role:text is_active:bool'), fk: {}, hidden: ['password_hash', 'token_version', 'must_change_password', 'last_login_at', 'created_at', 'analyst_id', 'is_system', 'username'], dir: 'asc', ro: RO.akun },
  audit_event: { label: 'audit_event (jejak audit)', group: 'Akun dan audit', admin: true, pk: ['event_id'], cols: C('event_id:int at_utc:ts analyst_id:int user_id:int action:text entity_type:text entity_id:int reason:text request_id:text'), fk: { analyst_id: 'analyst.analyst_id', user_id: 'app_user.user_id' }, hidden: ['ip_hash'], dir: 'desc', ro: RO.jejak },
  audit_change: { label: 'audit_change (nilai lama dan baru)', group: 'Akun dan audit', admin: true, pk: ['event_id', 'field_name'], cols: C('event_id:int field_name:text old_value:text new_value:text'), fk: { event_id: 'audit_event.event_id' }, hidden: [], dir: 'desc', ro: RO.jejak },
  login_attempt: { label: 'login_attempt (percobaan masuk, tanpa IP)', group: 'Akun dan audit', admin: true, pk: ['attempt_id'], cols: C('attempt_id:int at_utc:ts ok:bool'), fk: {}, hidden: ['ip_hash', 'email_key'], dir: 'desc', ro: RO.jejak },
  schema_migration: { label: 'schema_migration (versi skema)', group: 'Akun dan audit', admin: true, pk: ['version'], cols: C('version:int name:text sha256:text applied_at:ts'), fk: {}, hidden: [], dir: 'asc', ro: RO.jejak },
};
for (const [n, t] of Object.entries(TABLES)) { t.name = n; t.ro ??= null; }

// ---- Penulisan: daftar putih tabel, kolom, dan validator tipe ----
const T = (max, req = false, extra = {}) => ({ t: 'text', max, req, ...extra });
export const WRITE = {
  compile: { fields: { product_name: T(200, true), strength: T(100, true), dosage_form: T(100, true), api: T(200), api_uncertain: { t: 'bool' }, project_code: T(60), title: T(300, true) }, insert: ['product_name', 'strength', 'dosage_form', 'api', 'api_uncertain', 'project_code', 'title'] },
  medium: { fields: { full_name: T(300, true), volume_text: T(200), apparatus: T(200), rpm_text: T(100), method: T(500), method_ref: T(500) }, insertKeys: { compile_id: { t: 'int', req: true }, code: { t: 'code', req: true } }, insert: ['full_name', 'volume_text', 'apparatus', 'rpm_text', 'method', 'method_ref'] },
  batch: { fields: { brand_name: T(300) }, insertKeys: { compile_id: { t: 'int', req: true }, batch_no: T(100, true) }, insert: ['brand_name'] },
  compile_alias: { fields: { alias: T(200, true) }, insertKeys: { compile_id: { t: 'int', req: true } }, insert: ['alias'] },
  run: { fields: { note: T(4000, false, { multiline: true }), variant: T(500, false, { notnull: true }), manufacturer_site: T(300), is_valid: { t: 'bool' }, invalid_reason: T(4000, false, { multiline: true }) }, insert: null, soft: true },
};
const MAX_REASON = 4000;

const q = (s) => `"${s}"`;
const sel = (c) => (c.virtual ? c.sql : c.type === 'date' ? `to_char(t.${q(c.name)},'YYYY-MM-DD')` : c.type === 'ts' ? `to_char(t.${q(c.name)} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')` : `t.${q(c.name)}`);
const sortExpr = (c) => (c.virtual ? c.sql : `t.${q(c.name)}`);
const txt = (c) => `(${sel(c)})::text`;
const likeEsc = (s) => s.replace(/[\\%_]/g, (m) => '\\' + m);
const col = (tbl, n) => tbl.cols.find((c) => c.name === n) || null;
const isNum = (type) => type === 'int' || type === 'num';
const shapeValue = (c, v) => (v === null || v === undefined ? null : c.type === 'int' ? (Number.isSafeInteger(Number(v)) ? Number(v) : String(v)) : v);

export function tableOf(name, role) {
  const t = Object.hasOwn(TABLES, name) ? TABLES[name] : null;
  if (!t) throw new HttpError(404, 'Tabel tidak ditemukan');
  if (t.admin && role !== 'admin') throw new HttpError(403, 'Hanya admin');
  return t;
}

export function describe(t, role) {
  const w = WRITE[t.name], canWrite = role === 'penulis' || role === 'admin';
  const fk = (n) => { const x = t.fk[n]; return x ? { table: x.split('.')[0], col: x.split('.')[1] } : null; };
  return {
    name: t.name, label: t.label, group: t.group, admin_only: !!t.admin, pk: t.pk, default_dir: t.dir,
    columns: t.cols.map((c) => ({ name: c.name, type: c.type, pk: t.pk.includes(c.name), fk: fk(c.name), virtual: !!c.virtual, editable: !!(w && w.fields[c.name] && canWrite) })),
    readonly: t.ro && !w ? t.ro : (w ? null : { kind: 'baca', note: 'Hanya baca.' }),
    write: w && canWrite ? { update: Object.keys(w.fields), insert: w.insert ? [...Object.keys(w.insertKeys || {}), ...w.insert] : null, soft_delete: !!w.soft, fields: { ...(w.insertKeys || {}), ...w.fields } } : null,
    can_write: !!(w && canWrite), page_size: PAGE_SIZE,
    measured_note: t.name === 'run' ? NOTE_RUN : null,
  };
}

function parseView(t, sp) {
  const bad = (m) => { throw new HttpError(400, 'Masukan tidak valid', { details: [m] }); };
  const out = { page: 1, sort: null, dir: t.dir, q: '', filters: [] };
  const val = (v, nm) => { if (typeof v !== 'string' || v.length > MAX_Q || hasNul(v)) bad(`${nm}: nilai tidak valid (maks ${MAX_Q} karakter)`); return v; };
  for (const [k, v] of sp) {
    if (k === 'page') { if (!/^\d{1,7}$/.test(v) || Number(v) < 1 || Number(v) > MAX_PAGE) bad('page: harus bilangan bulat 1 sampai ' + MAX_PAGE); out.page = Number(v); }
    else if (k === 'sort') { const c = col(t, v); if (!c) bad('sort: kolom tidak ada di daftar'); out.sort = c; }
    else if (k === 'dir') { if (v !== 'asc' && v !== 'desc') bad('dir: asc atau desc'); out.dir = v; }
    else if (k === 'q') out.q = val(v, 'q').trim();
    else { const m = /^(f|fx)\.([a-z_]{1,60})$/.exec(k); if (!m) bad('parameter tidak dikenal'); const c = col(t, m[2]); if (!c) bad('filter: kolom tidak ada di daftar'); if (out.filters.length >= MAX_FILTERS) bad('filter terlalu banyak'); out.filters.push({ c, exact: m[1] === 'fx', v: val(v, k) }); }
  }
  return out;
}

function whereOf(t, view, params) {
  const w = [];
  if (view.q) { params.push('%' + likeEsc(view.q) + '%'); w.push('(' + t.cols.map((c) => `${txt(c)} ILIKE $${params.length}`).join(' OR ') + ')'); }
  for (const f of view.filters) { if (f.exact) { params.push(f.v); w.push(`${txt(f.c)} = $${params.length}`); } else { params.push('%' + likeEsc(f.v) + '%'); w.push(`${txt(f.c)} ILIKE $${params.length}`); } }
  return w.length ? ' WHERE ' + w.join(' AND ') : '';
}
const orderOf = (t, view) => ' ORDER BY ' + [view.sort ? `${sortExpr(view.sort)} ${view.dir.toUpperCase()} NULLS LAST` : null, ...t.pk.map((p) => `t.${q(p)} ${view.sort ? 'ASC' : view.dir.toUpperCase()}`)].filter(Boolean).join(', ');
const tokenSql = (t) => (WRITE[t.name] ? `, md5(jsonb_build_array(${t.cols.map(sel).join(',')})::text) AS "_tok"` : '');
const selectList = (t) => t.cols.map((c) => `${sel(c)} AS ${q(c.name)}`).join(', ') + tokenSql(t);

function shapeRow(t, r) {
  const c = {}; for (const k of t.cols) c[k.name] = shapeValue(k, r[k.name]);
  const pk = {}; for (const p of t.pk) pk[p] = c[p];
  return { pk, c, ...(r._tok ? { token: r._tok } : {}) };
}

export async function listTables(query, role) {
  const vis = Object.values(TABLES).filter((t) => role === 'admin' || !t.admin);
  const cnt = (await query(vis.map((t) => `SELECT '${t.name}' AS t, count(*)::bigint AS n FROM ${q(t.name)}`).join(' UNION ALL '))).rows;   // nama dari daftar putih (konstanta), bukan dari klien
  const n = Object.fromEntries(cnt.map((r) => [r.t, Number(r.n)]));
  return { tables: vis.map((t) => ({ name: t.name, label: t.label, group: t.group, rows: n[t.name], admin_only: !!t.admin, writable: !!WRITE[t.name], readonly_kind: WRITE[t.name] ? null : (t.ro ? t.ro.kind : 'baca') })) };
}

export async function readTable(query, t, sp, role) {
  const view = parseView(t, sp), params = [], where = whereOf(t, view, params);
  const total = Number((await query(`SELECT count(*)::bigint AS n FROM ${q(t.name)} t${where}`, params)).rows[0].n);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE)), page = view.page;
  if (page > pages) throw new HttpError(400, 'Masukan tidak valid', { details: [`page: ${page} melebihi jumlah halaman (${pages})`] });   // F18-02: konsisten 400
  const rows = (await query(`SELECT ${selectList(t)} FROM ${q(t.name)} t${where}${orderOf(t, view)} LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`, params)).rows;
  const meta = describe(t, role);
  if (t.name === 'medium') meta.options = { code: (await query('SELECT code, label FROM medium_code ORDER BY sort_no')).rows };
  return { table: meta, page, pages, total, page_size: PAGE_SIZE, sort: view.sort ? view.sort.name : null, dir: view.dir, rows: rows.map((r) => shapeRow(t, r)) };
}

// ---- CSV: tabel yang sedang dilihat (filter dan urut sama), tanpa paginasi, batas CSV_CAP baris. Cegah CSV injection. ----
export function csvCell(v, type) {
  let s = v === null || v === undefined ? '' : String(v);
  const safeNum = isNum(type) && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s);
  if (/^[=+\-@\t\r]/.test(s) && !safeNum) s = "'" + s;   // OWASP: awalan = + - @ (juga tab, CR) diberi tanda kutip agar tidak jadi rumus
  return /[",\r\n]|^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export async function csvTable(query, t, sp) {
  const view = parseView(t, sp), params = [], where = whereOf(t, view, params);
  const rows = (await query(`SELECT ${t.cols.map((c) => `${sel(c)} AS ${q(c.name)}`).join(', ')} FROM ${q(t.name)} t${where}${orderOf(t, view)} LIMIT ${CSV_CAP + 1}`, params)).rows;
  const cut = rows.length > CSV_CAP; if (cut) rows.pop();
  const lines = [t.cols.map((c) => csvCell(c.name, 'text')).join(',')];
  for (const r of rows) lines.push(t.cols.map((c) => csvCell(shapeValue(c, r[c.name]), c.type)).join(','));
  return { body: '﻿' + lines.join('\r\n') + '\r\n', rows: rows.length, truncated: cut };
}

// ---- Validasi tulis ----
function norm(spec, v, name, err) {
  if (spec.t === 'bool') { if (typeof v !== 'boolean') { err.push(`${name}: harus true atau false`); return undefined; } return v; }
  if (spec.t === 'int') { if (!Number.isSafeInteger(v) || v < 1) { err.push(`${name}: harus bilangan bulat positif`); return undefined; } return v; }
  if (spec.t === 'date') { if (typeof v !== 'string' || !isRealDate(v)) { err.push(`${name}: tanggal tidak valid (YYYY-MM-DD)`); return undefined; } return v; }
  // text / code
  if (v === null || v === undefined || v === '') { if (spec.req) { err.push(`${name}: wajib`); return undefined; } return spec.notnull ? '' : null; }
  if (typeof v !== 'string') { err.push(`${name}: harus teks`); return undefined; }
  const s = cleanText(v, { multiline: !!spec.multiline });
  if (s === null) { err.push(`${name}: harus teks ${BAD_TEXT_MSG}`); return undefined; }
  if (!s) { if (spec.req) { err.push(`${name}: wajib`); return undefined; } return spec.notnull ? '' : null; }
  if (s.length > (spec.max || 500)) { err.push(`${name}: terlalu panjang (maks ${spec.max || 500})`); return undefined; }
  return s;
}
function validReason(r) {
  const s = typeof r === 'string' ? cleanText(r, { multiline: true }) : '';
  if (s === null) throw new HttpError(400, 'Alasan tidak valid', { details: ['reason: ' + BAD_TEXT_MSG] });
  if (!s) throw new HttpError(400, 'Alasan perubahan wajib', { details: ['reason: wajib diisi'] });
  if (s.length > MAX_REASON || hasNul(s)) throw new HttpError(400, 'Alasan tidak valid', { details: ['reason: terlalu panjang atau tidak valid'] });
  return s;
}
async function audit(db, { analystId, userId, action, entityType, entityId, reason, requestId, ipHash, changes }) {
  const e = await db.query('INSERT INTO audit_event(analyst_id,action,entity_type,entity_id,reason,request_id,ip_hash,user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING event_id', [analystId, action, entityType, entityId, reason, requestId ?? null, ipHash ?? null, userId ?? null]);
  for (const [f, o, n] of changes) await db.query('INSERT INTO audit_change(event_id,field_name,old_value,new_value) VALUES ($1,$2,$3,$4)', [e.rows[0].event_id, f, o ?? null, n ?? null]);
}
const str = (v) => (v === null || v === undefined ? null : String(v));
function writeTable(name) {
  const t = TABLES[name], w = WRITE[name];
  if (!w) throw new HttpError(403, `Tabel ${name} hanya baca di Record. ${t.ro ? t.ro.note : ''}`.trim(), { read_only: true, kind: t.ro ? t.ro.kind : 'baca', action: t.ro?.action || null });
  return { t, w };
}
async function fetchRow(db, t, id, lock = false) {
  const r = (await db.query(`SELECT ${selectList(t)} FROM ${q(t.name)} t WHERE t.${q(t.pk[0])} = $1${lock ? ' FOR UPDATE OF t' : ''}`, [id])).rows[0];
  return r ? shapeRow(t, r) : null;
}
const lockKey = (db, name, id) => db.query('SELECT pg_advisory_xact_lock(hashtext($1), $2::int)', ['record:' + name, Number(id) % 2147483647]);

export async function updateRow(db, { name, id, body, analystName, userId, requestId, ipHash }) {
  const { t, w } = writeTable(name);
  const reason = validReason(body.reason);
  if (typeof body.row_token !== 'string' || !/^[0-9a-f]{32}$/.test(body.row_token)) throw new HttpError(400, 'Masukan tidak valid', { details: ['row_token: wajib (dari baris yang dibuka)'] });
  const ch = body.changes;
  if (!ch || typeof ch !== 'object' || Array.isArray(ch)) throw new HttpError(400, 'Masukan tidak valid', { details: ['changes: wajib berupa objek'] });
  const unknown = Object.keys(ch).filter((k) => !Object.hasOwn(w.fields, k));
  if (unknown.length) throw new HttpError(400, 'Masukan tidak valid', { details: unknown.map((k) => `${String(k).slice(0, 60)}: kolom tidak boleh diubah di Record`) });
  if (!Object.keys(ch).length) throw new HttpError(400, 'Tidak ada perubahan');
  const aid = await ensureAnalyst(db, analystName);
  if (name === 'run') await db.query('SELECT pg_advisory_xact_lock($1::bigint)', [id]); else await lockKey(db, name, id);   // run: kunci yang sama dengan ubah/hapus run lain
  const cur = await fetchRow(db, t, id, name !== 'run');
  if (!cur) throw new HttpError(404, 'Baris tidak ditemukan');
  if (cur.token !== body.row_token) throw new HttpError(409, 'Baris berubah sejak dibuka. Muat ulang baris lalu ulangi perubahan.', { conflict: true, current: cur });
  if (name === 'run' && cur.c.status !== 'Terlihat') throw new HttpError(409, 'Run sudah dihapus atau ditimpa; pulihkan dulu sebelum mengubah', { conflict: true, current: cur });
  const err = [], next = {};
  for (const [k, v] of Object.entries(ch)) { const x = norm(w.fields[k], v, k, err); if (x !== undefined) next[k] = x; }
  if (name === 'compile' && 'api' in next && !('api_uncertain' in next) && cur.c.api_uncertain && next.api) next.api_uncertain = false;   // INDRA: mengoreksi API = zat aktif sudah pasti (tercatat sebagai perubahan terpisah)
  if (name === 'run') {
    const valid = 'is_valid' in next ? next.is_valid : cur.c.is_valid;
    if ('is_valid' in next && next.is_valid && !('invalid_reason' in next)) next.invalid_reason = null;   // kembali Valid: alasan lama tersimpan di jejak
    if (!valid && !('invalid_reason' in next ? next.invalid_reason : cur.c.invalid_reason)) err.push('invalid_reason: status Tidak valid wajib beralasan');
  }
  if (err.length) throw new HttpError(400, 'Masukan tidak valid', { details: err });
  const changes = Object.keys(next).filter((k) => str(cur.c[k]) !== str(next[k])).map((k) => [k, str(cur.c[k]), str(next[k])]);
  if (!changes.length) throw new HttpError(400, 'Tidak ada perubahan: nilai sama dengan yang tersimpan');
  const sets = changes.map(([k], i) => `${q(k)}=$${i + 2}`);
  const vals = changes.map(([k]) => next[k]);
  if (name === 'compile_alias') { sets.push(`"alias_key"=$${vals.length + 2}`); vals.push(aliasKey(next.alias)); }
  await db.query(`UPDATE ${q(name)} SET ${sets.join(',')} WHERE ${q(t.pk[0])}=$1`, [id, ...vals]);
  await audit(db, { analystId: aid, userId, action: 'record_update', entityType: name, entityId: id, reason, requestId, ipHash, changes });
  return { updated: true, changed: changes.map((c) => c[0]), row: await fetchRow(db, t, id) };
}

export async function insertRow(db, { name, body, analystName, userId, requestId, ipHash }) {
  const { t, w } = writeTable(name);
  if (!w.insert) throw new HttpError(403, `Tabel ${name} tidak menerima baris baru di Record (data masuk lewat Studio atau impor).`, { read_only: true });
  const reason = validReason(body.reason);
  const v = body.values;
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'Masukan tidak valid', { details: ['values: wajib berupa objek'] });
  const specs = { ...(w.insertKeys || {}), ...Object.fromEntries(w.insert.map((k) => [k, w.fields[k]])) };
  if (name === 'compile') specs.title = { ...specs.title, req: false };   // judul bawaan "Development of ..."
  const unknown = Object.keys(v).filter((k) => !Object.hasOwn(specs, k));
  if (unknown.length) throw new HttpError(400, 'Masukan tidak valid', { details: unknown.map((k) => `${String(k).slice(0, 60)}: kolom tidak boleh diisi di Record`) });
  const err = [], row = {};
  for (const [k, s] of Object.entries(specs)) { if (!(k in v) && !s.req) continue; const x = norm(s, v[k], k, err); if (x !== undefined) row[k] = x; }
  if (name === 'compile') { row.api_uncertain ??= false; row.title ??= `Development of ${row.product_name} ${row.strength} ${row.dosage_form}`; }
  if (err.length) throw new HttpError(400, 'Masukan tidak valid', { details: err });
  if (row.compile_id && !(await db.query('SELECT 1 FROM compile WHERE compile_id=$1', [row.compile_id])).rowCount) throw new HttpError(400, 'Masukan tidak valid', { details: ['compile_id: compile tidak ditemukan'] });
  if (row.code && !(await db.query('SELECT 1 FROM medium_code WHERE code=$1', [row.code])).rowCount) throw new HttpError(400, 'Masukan tidak valid', { details: ['code: kode medium tidak dikenal'] });
  const aid = await ensureAnalyst(db, analystName);
  if (name === 'compile' || name === 'compile_alias') row.created_by = aid;
  if (name === 'compile_alias') { row.alias_key = aliasKey(row.alias); row.source = 'analis'; }
  const cols = Object.keys(row);
  const r = await db.query(`INSERT INTO ${q(name)}(${cols.map(q).join(',')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING ${q(t.pk[0])} AS id`, cols.map((c) => row[c]));
  const id = Number(r.rows[0].id);
  await audit(db, { analystId: aid, userId, action: 'record_insert', entityType: name, entityId: id, reason, requestId, ipHash, changes: cols.map((c) => [c, null, str(row[c])]) });
  return { inserted: true, id, row: await fetchRow(db, t, id) };
}

export async function softDelete(db, { name, id, body, analystName, userId, requestId, ipHash, restore }) {
  const { t, w } = writeTable(name);
  if (!w.soft) throw new HttpError(403, `Tabel ${name} tidak punya hapus lunak. Hapus keras tidak ada di sistem ini.`, { read_only: true });
  const reason = validReason(body.reason);
  if (typeof body.row_token !== 'string' || !/^[0-9a-f]{32}$/.test(body.row_token)) throw new HttpError(400, 'Masukan tidak valid', { details: ['row_token: wajib (dari baris yang dibuka)'] });
  await db.query('SELECT pg_advisory_xact_lock($1::bigint)', [id]);
  const cur = await fetchRow(db, t, id);
  if (!cur) throw new HttpError(404, 'Baris tidak ditemukan');
  if (cur.token !== body.row_token) throw new HttpError(409, 'Baris berubah sejak dibuka. Muat ulang baris lalu ulangi.', { conflict: true, current: cur });
  const fn = restore ? restoreRun : removeRun;
  await fn(db, { id, body: { reason, confirm: true }, analystName, userId, requestId, ipHash });
  return { [restore ? 'restored' : 'removed']: true, row: await fetchRow(db, t, id) };
}

// ---- Perutean: kembalikan null bila bukan rute Record; selain itu { status, body } atau { status, raw, headers }. Guard peran sudah dijalankan pemanggil (server/authz.js). ----
export async function routeRecord({ method, path, url, role, me, query, tx, readJson, requestId, ipHash }) {
  const m = /^\/api\/record\/tables(?:\/([a-z_]+)(?:\/(csv)|\/(rows)(?:\/(\d+)(?:\/(delete|restore))?)?)?)?$/.exec(path);
  if (!m) return null;
  const [, name, csv, rows, idRaw, act] = m;
  if (!name) return { status: 200, body: await listTables(query, role) };
  const t = tableOf(name, role);
  if (method === 'GET' && csv) {
    const out = await csvTable(query, t, url.searchParams);
    return { status: 200, raw: out.body, headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="record_${name}.csv"`, 'x-row-count': String(out.rows), 'x-row-cap': String(CSV_CAP), 'x-truncated': out.truncated ? '1' : '0' } };
  }
  if (method === 'GET' && !rows) return { status: 200, body: await readTable(query, t, url.searchParams, role) };
  const id = idRaw ? Number(idRaw) : null;
  const { w } = writeTable(name);   // tabel hanya baca = 403 sebelum apa pun dibaca
  if (method === 'POST' && rows && !idRaw && !w.insert) throw new HttpError(403, `Tabel ${name} tidak menerima baris baru di Record (data masuk lewat Studio atau impor).`, { read_only: true });
  const body = await readJson();
  const analystName = validateAnalystName(body.analyst_name);
  const ctx = { name, body, analystName, userId: me.user_id, requestId, ipHash };
  if (method === 'POST' && rows && !idRaw) return { status: 201, body: await tx((db) => insertRow(db, ctx)) };
  if (method === 'PATCH' && idRaw && !act) return { status: 200, body: await tx((db) => updateRow(db, { ...ctx, id })) };
  if (method === 'POST' && act) return { status: 200, body: await tx((db) => softDelete(db, { ...ctx, id, restore: act === 'restore' })) };
  throw new HttpError(404, 'Tidak ditemukan');
}
