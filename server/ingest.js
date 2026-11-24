// Penyimpanan paket data (Studio atau impor sheet): validasi, klasifikasi, peringatan, simpan idempoten dalam satu transaksi.
import { createHash } from 'node:crypto';
import { MEDIUM_CODES } from './import/sheetReader.js';
import * as step4 from './step4.js';
import { runProfile, f2Between } from './lib/udtBridge.js';

export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

const MAX_RUNS = 300, MAX_VESSEL = 99, MAX_POINTS = 99, MAX_STR = 500, MAX_NOTE = 4000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
// Tanggal harus ada di kalender (2026-13-45 lolos regex tetapi ditolak PostgreSQL = 500 pada F5). NUL tidak boleh ada di teks (PostgreSQL menolaknya).
export const isRealDate = (s) => { if (typeof s !== 'string' || !ISO.test(s)) return false; const d = new Date(s + 'T00:00:00Z'); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; };
export const hasNul = (s) => typeof s === 'string' && s.includes(String.fromCharCode(0));

// ---------- validasi bentuk (REQ-061): tidak ada HTML mentah di sini; teks disimpan apa adanya dan dirender sebagai teks ----------
export function validatePackage(p, { kind }) {
  const err = [];
  const str = (v, path, { max = MAX_STR, req = false } = {}) => {
    if (v === undefined || v === null || v === '') { if (req) err.push(`${path}: wajib`); return null; }
    if (typeof v !== 'string') { err.push(`${path}: harus teks`); return null; }
    if (hasNul(v)) { err.push(`${path}: karakter tidak valid`); return null; }
    if (v.length > max) { err.push(`${path}: terlalu panjang (maks ${max})`); return null; }
    return v;
  };
  const num = (v, path, req = true) => { if (v === null || v === undefined) { if (req) err.push(`${path}: wajib`); return null; } if (typeof v !== 'number' || !Number.isFinite(v)) { err.push(`${path}: harus angka hingga`); return null; } return v; };
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw new HttpError(400, 'Paket tidak valid');

  const out = { mediums: [], runs: [], comparisons: [], notes: [], checks: [] };
  if (kind === 'studio') { if (!Number.isSafeInteger(p.compile_id) || p.compile_id < 1) err.push('compile_id: wajib (bilangan bulat positif)'); out.compile_id = p.compile_id; }
  if (p.compile) {
    out.compile = { product_name: str(p.compile.product_name, 'compile.product_name', { req: true }), strength: str(p.compile.strength, 'compile.strength', { req: true }), dosage_form: str(p.compile.dosage_form, 'compile.dosage_form', { req: true }), api: str(p.compile.api, 'compile.api'), title: str(p.compile.title, 'compile.title') };
    out.compile.title ??= `Development of ${out.compile.product_name} ${out.compile.strength} ${out.compile.dosage_form}`;
  } else if (kind === 'sheet') err.push('compile: wajib untuk impor');
  if (Array.isArray(p.mediums) && new Set(p.mediums.map((m) => m?.code)).size !== p.mediums.length) err.push('mediums: kode medium ganda (satu produk satu medium per kode)');
  if (!Array.isArray(p.mediums)) err.push('mediums: harus daftar'); else p.mediums.slice(0, 20).forEach((m, i) => {
    const code = str(m.code, `mediums[${i}].code`, { req: true });
    if (code && !MEDIUM_CODES.includes(code)) err.push(`mediums[${i}].code: kode medium tidak dikenal`);
    out.mediums.push({ code, full_name: str(m.full_name, `mediums[${i}].full_name`, { req: true }), volume_text: str(m.volume_text, 'volume_text'), apparatus: str(m.apparatus, 'apparatus'), rpm_text: str(m.rpm_text, 'rpm_text'), method: str(m.method, 'method'), method_ref: str(m.method_ref, 'method_ref') });
  });
  if (!Array.isArray(p.runs) || !p.runs.length) err.push('runs: minimal satu run');
  else if (p.runs.length > MAX_RUNS) err.push(`runs: maksimal ${MAX_RUNS} per paket`);
  else p.runs.forEach((r, i) => {
    const P = `runs[${i}]`;
    const run = { key: str(r.key, `${P}.key`, { req: true }), medium_code: str(r.medium_code, `${P}.medium_code`, { req: true }), brand_name: str(r.brand_name, `${P}.brand_name`, { req: true }), batch_no: str(r.batch_no, `${P}.batch_no`, { req: true }), role: r.role, variant: str(r.variant, `${P}.variant`) ?? '', test_date: null, manufacturer_site: str(r.manufacturer_site, `${P}.manufacturer_site`), note: str(r.note, `${P}.note`, { max: MAX_NOTE }), is_valid: r.is_valid !== false, invalid_reason: str(r.invalid_reason, `${P}.invalid_reason`, { max: MAX_NOTE }), timepoints: [], values: [], sourceBlocks: [] };
    if (!['reference', 'uji'].includes(run.role)) err.push(`${P}.role: harus reference atau uji`);
    if (r.test_date != null && r.test_date !== '') { if (isRealDate(r.test_date)) run.test_date = r.test_date; else err.push(`${P}.test_date: tanggal YYYY-MM-DD yang ada di kalender`); }
    if (!run.is_valid && !(run.invalid_reason || '').trim()) err.push(`${P}: status Tidak valid wajib beralasan`);
    if (!Array.isArray(r.timepoints) || !r.timepoints.length) err.push(`${P}.timepoints: wajib`);
    else if (r.timepoints.length > MAX_POINTS) err.push(`${P}.timepoints: maks ${MAX_POINTS}`);
    else r.timepoints.forEach((m, j) => { const v = num(m, `${P}.timepoints[${j}]`); if (v !== null && v <= 0) err.push(`${P}.timepoints[${j}]: titik 0 tidak disimpan`); run.timepoints.push(v); });
    if (!Array.isArray(r.values) || !r.values.length) err.push(`${P}.values: wajib`);
    else if (r.values.length > MAX_VESSEL) err.push(`${P}.values: maks ${MAX_VESSEL} vessel`);
    else r.values.forEach((v, j) => {
      if (!Number.isInteger(v.no) || v.no < 1 || v.no > MAX_VESSEL) err.push(`${P}.values[${j}].no: 1..${MAX_VESSEL}`);
      if (!Array.isArray(v.values) || v.values.length !== run.timepoints.length) { err.push(`${P}.values[${j}].values: panjang harus sama dengan timepoints`); return; }
      run.values.push({ no: v.no, values: v.values.map((x, k) => (x === null ? null : num(x, `${P}.values[${j}].values[${k}]`))) });
      if (kind === 'studio' && run.values.at(-1).values.some((x) => x !== null && (x < -5 || x > 150))) err.push(`${P}.values[${j}]: persen terlarut di luar rentang wajar (-5 sampai 150)`);   // F11 K-4 (impor sheet lama tidak diubah)
    });
    if (new Set(run.values.map(v => v.no)).size !== run.values.length) err.push(`${P}.values: nomor vessel ganda`);
    if (new Set(run.timepoints).size !== run.timepoints.length) err.push(`${P}.timepoints: menit ganda`);
    if (Array.isArray(r.sourceBlocks)) for (const b of r.sourceBlocks.slice(0, 50)) run.sourceBlocks.push({ tab: str(b.tab, 'sourceBlocks.tab', { req: true }), avg_row: Number.isInteger(b.avg_row) ? b.avg_row : (err.push('sourceBlocks.avg_row: bilangan bulat'), null), block_date: isRealDate(b.block_date) ? b.block_date : null, ref_avg_row: Number.isInteger(b.ref_avg_row) ? b.ref_avg_row : null, product_printed: str(b.product_printed, 'sourceBlocks.product_printed'), role_raw: str(b.role_raw, 'sourceBlocks.role_raw'), section_header_row: Number.isInteger(b.section_header_row) ? b.section_header_row : null, import_outcome: b.import_outcome === 'ditahan' ? 'ditahan' : 'diimpor', hold_reason: str(b.hold_reason, 'sourceBlocks.hold_reason', { max: MAX_NOTE }) });
    out.runs.push(run);
  });
  if (new Set(out.runs.map(r => r.key)).size !== out.runs.length) err.push('runs: key ganda');
  if (!out.runs.every(r => out.mediums.some(m => m.code === r.medium_code))) err.push('runs: medium_code tidak ada pada daftar mediums');
  const keys = new Set(out.runs.map(r => r.key));
  for (const [i, c] of (Array.isArray(p.comparisons) ? p.comparisons : []).entries()) {
    const P = `comparisons[${i}]`;
    if (!keys.has(c.testKey) || !keys.has(c.refKey)) { err.push(`${P}: testKey/refKey tidak merujuk run pada paket`); continue; }
    const f2_source = kind === 'sheet' ? 'sheet' : 'studio';
    const cmp = { testKey: c.testKey, refKey: c.refKey, total_sq: num(c.total_sq, `${P}.total_sq`, false), n_points: num(c.n_points, `${P}.n_points`), f2: num(c.f2, `${P}.f2`, false), conclusion_code: str(c.conclusion_code, `${P}.conclusion_code`), conclusion_printed: str(c.conclusion_printed, `${P}.conclusion_printed`, { max: MAX_NOTE }), conclusion_is_printed: c.conclusion_is_printed === true, source_avg_row: Number.isInteger(c.source_avg_row) ? c.source_avg_row : null, f2_source, points: [] };
    if (cmp.n_points !== null && (!Number.isInteger(cmp.n_points) || cmp.n_points < 1)) err.push(`${P}.n_points: bilangan bulat > 0`);
    if (f2_source === 'studio' && !cmp.conclusion_code) err.push(`${P}.conclusion_code: wajib untuk data Studio`);
    for (const pt of (Array.isArray(c.points) ? c.points : [])) cmp.points.push({ seq: pt.seq, sq_diff: num(pt.sq_diff, `${P}.points.sq_diff`) });
    out.comparisons.push(cmp);
  }
  if (kind === 'sheet') {
    for (const n of (Array.isArray(p.notes) ? p.notes : []).slice(0, 2000)) out.notes.push({ kind: n.kind, sheet_tab: str(n.sheet_tab, 'note.sheet_tab'), cell_range: str(n.cell_range, 'note.cell_range'), message: str(n.message, 'note.message', { max: MAX_NOTE, req: true }) });
    for (const c of (Array.isArray(p.checks) ? p.checks : [])) out.checks.push({ testKey: c.testKey, refKey: c.refKey, f2_recomputed: num(c.f2_recomputed, 'checks.f2_recomputed') });
    out.source_name = str(p.source_name, 'source_name', { req: true });
  }
  if (err.length) throw new HttpError(400, 'Masukan tidak valid', { details: err.slice(0, 20) });
  return out;
}

// S-4 (F5): paket Studio tidak dipercaya untuk f2/Total/n. Server menghitung ulang dari nilai vessel dengan fungsi Langkah 4 asli;
// f2 kiriman yang menyimpang dari hitung ulang lebih dari toleransi README (+-1) ditolak 400; nilai yang disimpan selalu hasil server.
export const F2_TOLERANCE = 1;
export function verifyStudioComparisons(pkg) {
  const byKey = new Map(pkg.runs.map((r) => [r.key, r]));
  const profile = (r) => runProfile(step4, r.timepoints, Object.fromEntries(r.values.map((v) => [v.no, v.values])));
  const err = [];
  pkg.comparisons.forEach((c, i) => {
    const t = byKey.get(c.testKey), r = byKey.get(c.refKey);
    const l4 = f2Between(step4, profile(r), profile(t));
    const ok = !l4.error && Number.isFinite(l4.f2);
    if (!ok) { if (c.f2 !== null) err.push(`comparisons[${i}].f2: tidak dapat dihitung ulang dari data vessel`); return; }
    if (c.f2 === null || Math.abs(c.f2 - l4.f2) > F2_TOLERANCE) { err.push(`comparisons[${i}].f2: tidak cocok dengan hitung ulang server (toleransi ${F2_TOLERANCE})`); return; }
    c.f2 = l4.f2; c.n_points = l4.n; c.total_sq = l4.usedRef.reduce((a, x, k) => a + (x - l4.usedTest[k]) ** 2, 0);
    c.conclusion_code = l4.outcome.code; c.conclusion_printed = l4.outcome.statusText; c.conclusion_is_printed = false;
    c.points = l4.usedRef.map((x, k) => ({ seq: k + 1, sq_diff: (x - l4.usedTest[k]) ** 2 }));
  });
  if (err.length) throw new HttpError(400, 'Masukan tidak valid', { details: err.slice(0, 20) });
  return pkg;
}

export const nameKey = (p, s, f) => [p, s, f].filter(Boolean).join(' ').replace(/^development of\s+/i, '').replace(/\s+/g, '').toLowerCase();
export const aliasKey = (t) => String(t || '').replace(/^development of\s+/i, '').replace(/\s+/g, '').toLowerCase();

export function validateCompile(c) {
  if (!c || typeof c !== 'object') throw new HttpError(400, 'Masukan tidak valid', { details: ['compile: wajib'] });
  const err = [], f = (k, req, max = MAX_STR) => { const v = c[k]; if (v === undefined || v === null || v === '') { if (req) err.push(`${k}: wajib`); return null; } if (typeof v !== 'string' || v.length > max) { err.push(`${k}: harus teks maks ${max} karakter`); return null; } return v.trim(); };
  const out = { product_name: f('product_name', true), strength: f('strength', true), dosage_form: f('dosage_form', true), api: f('api', false), title: f('title', false), project_code: f('project_code', false, 60) };
  if (err.length) throw new HttpError(400, 'Masukan tidak valid', { details: err });
  out.title ??= `Development of ${out.product_name} ${out.strength} ${out.dosage_form}`;
  return out;
}

export function contentHash(run) {
  const v = [...run.values].sort((a, b) => a.no - b.no).map(x => [x.no, x.values.map(y => (y === null ? null : String(y)))]);
  return createHash('sha256').update(JSON.stringify({ t: run.timepoints.map(String), v })).digest('hex');
}

// ---------- peringatan mutu data (REQ-032): tidak menolak, tidak menghapus ----------
export function qualityWarnings(pkg) {
  const w = [];
  const cmpKeys = new Set(pkg.comparisons.map(c => c.testKey));
  const byKey = new Map(pkg.runs.map(r => [r.key, r]));
  const seen = new Map();
  for (const r of pkg.runs) {
    const id = `${r.brand_name} ${r.batch_no}${r.variant ? ' ' + r.variant : ''} (${r.medium_code})`;
    if (r.values.length > 12) w.push({ code: 'W-vessel>12', run: r.key, message: `${id}: ${r.values.length} vessel (lebih dari 12)` });
    if (r.timepoints.length > 9) w.push({ code: 'W-titik>9', run: r.key, message: `${id}: ${r.timepoints.length} titik waktu (lebih dari 9)` });
    if (r.values.some(v => v.values.some(x => x !== null && (x < 0 || x > 120)))) w.push({ code: 'W-nilai', run: r.key, message: `${id}: ada nilai di luar 0 sampai 120%` });
    if (r.role === 'uji' && !cmpKeys.has(r.key)) w.push({ code: 'W-tanpa-reference', run: r.key, message: `${id}: run Uji tanpa reference tertaut` });
    if (!r.test_date) w.push({ code: 'W-tanggal', run: r.key, message: `${id}: tanggal kosong` });
    const sig = contentHash(r);
    if (seen.has(sig) && seen.get(sig).id !== id) w.push({ code: 'W-identik', run: r.key, message: `${id} dan ${seen.get(sig).id}: seluruh nilai vessel identik (kemungkinan salin-tempel atau salah label)` });
    seen.set(sig, { id, key: r.key });
  }
  for (const c of pkg.comparisons) {
    if (c.n_points < 3 || c.n_points > 7) w.push({ code: 'W-n', run: c.testKey, message: `n = ${c.n_points} di luar 3 sampai 7` });
    if (byKey.get(c.testKey) && byKey.get(c.refKey) && contentHash(byKey.get(c.testKey)) === contentHash(byKey.get(c.refKey))) w.push({ code: 'W-identik-keras', run: c.testKey, message: `${c.testKey}: data uji identik dengan pembanding ${c.refKey}; f2 mentah akan 100, periksa kemungkinan salin-tempel` });
  }
  return w;
}

// ---------- klasifikasi terhadap data tersimpan ----------
export async function classifyRuns(db, compileId, pkg) {
  const res = [];
  for (const r of pkg.runs) {
    const h = contentHash(r);
    let status = 'baru', existing = [];
    if (compileId) {
      const q = await db.query(
        `SELECT r.run_id, r.content_hash, (v.run_id IS NOT NULL) AS visible
           FROM run r JOIN batch b ON b.batch_id=r.batch_id JOIN medium m ON m.medium_id=r.medium_id
           LEFT JOIN run_visible v ON v.run_id=r.run_id
          WHERE r.compile_id=$1 AND b.batch_no=$2 AND m.code=$3 AND r.variant=$4`,
        [compileId, r.batch_no, r.medium_code, r.variant]);
      existing = q.rows;
      const same = q.rows.find(x => x.content_hash === h);
      if (same) status = same.visible ? 'sama_persis' : 'terhapus';
      else if (q.rows.some(x => x.visible)) status = 'bentrok';
    }
    res.push({ key: r.key, status, hash: h, existing_run_ids: existing.map(x => Number(x.run_id)), same_run_id: existing.find(x => x.content_hash === h)?.run_id ?? null });
  }
  return res;
}

export async function findCompile(db, c) {
  const q = await db.query('SELECT compile_id FROM compile WHERE product_name=$1 AND strength=$2 AND dosage_form=$3', [c.product_name, c.strength, c.dosage_form]);
  return q.rows[0]?.compile_id ? Number(q.rows[0].compile_id) : null;
}

export async function ensureAnalyst(db, name) {
  await db.query('INSERT INTO analyst(name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
  return Number((await db.query('SELECT analyst_id FROM analyst WHERE name=$1', [name])).rows[0].analyst_id);
}

async function audit(db, { analystId, userId, action, entityType, entityId, reason, requestId, ipHash, changes }) {   // F12: analystId = nama yang DIKETIK; userId = akun (Formdev/Andev); keduanya tercatat
  const e = await db.query('INSERT INTO audit_event(analyst_id,action,entity_type,entity_id,reason,request_id,ip_hash,user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING event_id', [analystId, action, entityType, entityId ?? null, reason ?? null, requestId ?? null, ipHash ?? null, userId ?? null]);
  for (const [f, o, n] of changes || []) await db.query('INSERT INTO audit_change(event_id,field_name,old_value,new_value) VALUES ($1,$2,$3,$4)', [e.rows[0].event_id, f, o ?? null, n ?? null]);
}

// db = klien dalam transaksi. kind: 'studio' (push_id) atau 'sheet' (impor).
export async function commitPackage(db, { pkg, kind, analystId, userId, pushId, decisions = {}, requestId, ipHash }) {
  let compileId;
  if (kind === 'studio') {
    compileId = pkg.compile_id;
    if (!(await db.query('SELECT 1 FROM compile WHERE compile_id=$1', [compileId])).rowCount) throw new HttpError(404, 'Compile tidak ditemukan');
  } else {
    compileId = await findCompile(db, pkg.compile);
    if (!compileId) {
      const apiBad = pkg.notes.some((n) => n.kind === 'api_mismatch');   // B3-8: D5 bertentangan dengan D10 -> zat aktif belum pasti
      compileId = Number((await db.query('INSERT INTO compile(product_name,strength,dosage_form,api,title,created_by,api_uncertain) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING compile_id', [pkg.compile.product_name, pkg.compile.strength, pkg.compile.dosage_form, pkg.compile.api, pkg.compile.title, analystId, apiBad])).rows[0].compile_id);
    }
    if (kind === 'sheet') {   // judul sheet lama disimpan sebagai alias (tanpa gabung otomatis)
      await db.query("INSERT INTO compile_alias(compile_id,alias,alias_key,source,created_by) VALUES ($1,$2,$3,'sheet',$4) ON CONFLICT (compile_id,alias_key) DO NOTHING", [compileId, pkg.compile.title, aliasKey(pkg.compile.title), analystId]);
    }
  }
  const cls = await classifyRuns(db, compileId, pkg);
  if (kind === 'studio') {
    const unresolved = cls.filter(c => c.status === 'bentrok' && !['timpa', 'ulang', 'batal'].includes(decisions[c.key]));
    if (unresolved.length) throw new HttpError(409, 'Ada run bentrok: pilih timpa, ulang, atau batal', { conflicts: unresolved.map(c => c.key) });
  }

  let importId = null;
  if (kind === 'sheet') importId = Number((await db.query('INSERT INTO import_run(source_name,analyst_id) VALUES ($1,$2) RETURNING import_id', [pkg.source_name, analystId])).rows[0].import_id);
  if (kind === 'studio') {
    // FK run.push_id ditunda sampai COMMIT; baris studio_push (dengan hasil) ditulis di akhir
  }

  // medium dan batch (sisipan; tidak pernah diubah)
  const mediumId = new Map(), batchId = new Map();
  for (const m of pkg.mediums) {
    // F8 R1 (D1): identitas medium = (compile_id, code). Nama berbeda untuk kode yang sama = 409 jelas, tidak ada yang disimpan.
    await db.query('INSERT INTO medium(compile_id,code,full_name,volume_text,apparatus,rpm_text,method,method_ref) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (compile_id,code) DO NOTHING', [compileId, m.code, m.full_name, m.volume_text, m.apparatus, m.rpm_text, m.method, m.method_ref]);
    const have = (await db.query('SELECT medium_id, full_name FROM medium WHERE compile_id=$1 AND code=$2', [compileId, m.code])).rows[0];
    if (have.full_name !== m.full_name) throw new HttpError(409, `Produk ini sudah punya medium berkode ${m.code} dengan nama lain; satu produk hanya boleh punya satu medium per kode. Pakai nama yang tersimpan: ${have.full_name}`, { medium_code: m.code, stored_full_name: have.full_name });
    mediumId.set(m.code, Number(have.medium_id));
  }
  const notes = [...pkg.notes];
  for (const r of pkg.runs) {
    const k = r.batch_no;
    if (!batchId.has(k)) {
      // F8 R3/R4 (D4): batch.role tidak ditulis lagi (peran dihitung dari comparison). batch.brand_name hanya ditulis untuk data Studio, yang tidak punya blok sumber; data sheet memakai run_source_block.product_printed.
      await db.query('INSERT INTO batch(compile_id,brand_name,batch_no) VALUES ($1,$2,$3) ON CONFLICT (compile_id,batch_no) DO NOTHING', [compileId, kind === 'studio' ? r.brand_name : null, r.batch_no]);
      const row = (await db.query('SELECT batch_id FROM batch WHERE compile_id=$1 AND batch_no=$2', [compileId, r.batch_no])).rows[0];
      batchId.set(k, Number(row.batch_id));
    }
  }

  const runId = new Map(), status = new Map();
  for (const [i, r] of pkg.runs.entries()) {
    const c = cls[i], dec = decisions[r.key];
    if (c.status === 'sama_persis' || c.status === 'terhapus') { runId.set(r.key, Number(c.same_run_id)); status.set(r.key, c.status); }
    else if (c.status === 'bentrok' && dec === 'batal') { status.set(r.key, 'dibatalkan'); continue; }
    else {
      const ins = await db.query(
        `INSERT INTO run(compile_id,batch_id,medium_id,variant,test_date,manufacturer_site,note,is_valid,invalid_reason,content_hash,source,push_id,import_id,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING run_id`,
        [compileId, batchId.get(r.batch_no), mediumId.get(r.medium_code), r.variant, r.test_date, r.manufacturer_site, r.note, r.is_valid, r.invalid_reason, c.hash, kind === 'studio' ? 'studio' : 'sheet', kind === 'studio' ? pushId : null, importId, analystId]);
      const rid = Number(ins.rows[0].run_id);
      runId.set(r.key, rid);
      await db.query('INSERT INTO run_timepoint(run_id,seq,minute) SELECT $1, s, m::numeric FROM unnest($2::int[], $3::text[]) AS t(s, m)', [rid, r.timepoints.map((_, j) => j + 1), r.timepoints.map(String)]);   // satu perjalanan ke database per run
      const vn = [], sq = [], pc = [];
      for (const v of r.values) v.values.forEach((x, j) => { if (x !== null) { vn.push(v.no); sq.push(j + 1); pc.push(String(x)); } });
      if (vn.length) await db.query('INSERT INTO run_value(run_id,vessel_no,seq,pct) SELECT $1, v, s, p::numeric FROM unnest($2::int[], $3::int[], $4::text[]) AS t(v, s, p)', [rid, vn, sq, pc]);
      status.set(r.key, c.status === 'bentrok' ? (dec === 'timpa' ? 'ditimpa' : 'run_ulang') : 'baru');
      if (c.status === 'bentrok' && dec === 'timpa') {
        for (const old of c.existing_run_ids) {
          if (!(await db.query('SELECT 1 FROM run_visible WHERE run_id=$1', [old])).rowCount) continue;
          const seq = Number((await db.query('SELECT coalesce(max(seq),0)+1 AS s FROM run_removal WHERE run_id=$1', [old])).rows[0].s);
          await db.query("INSERT INTO run_removal(run_id,seq,kind,replaced_by_run_id,analyst_id,reason) VALUES ($1,$2,'ditimpa',$3,$4,$5)", [old, seq, rid, analystId, `Ditimpa oleh run ${rid} (pilihan analis saat Tambahkan ke Compile)`]);
          await audit(db, { analystId, userId, action: 'run_timpa', entityType: 'run', entityId: old, reason: `Ditimpa oleh run ${rid}`, requestId, ipHash, changes: [['visible', 'true', 'false'], ['replaced_by_run_id', null, String(rid)]] });   // F11 K-6: jejak per run
        }
      }
    }
    if (kind === 'sheet') for (const b of r.sourceBlocks) await db.query('INSERT INTO run_source_block(run_id,import_id,tab_name,avg_row,block_date,ref_avg_row,product_printed,role_raw,section_header_row,import_outcome,hold_reason) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (import_id,tab_name,avg_row) DO NOTHING', [runId.get(r.key), importId, b.tab, b.avg_row, b.block_date, b.ref_avg_row, b.product_printed, b.role_raw, b.section_header_row, b.import_outcome, b.hold_reason]);
  }

  let cmpAdded = 0;
  const cmpId = new Map();
  for (const c of pkg.comparisons) {
    const t = runId.get(c.testKey), f = runId.get(c.refKey);
    if (!t || !f) continue;
    const mid = mediumId.get(pkg.runs.find(r => r.key === c.testKey).medium_code);
    const ins = await db.query('INSERT INTO comparison(medium_id,test_run_id,ref_run_id,total_sq,n_points,f2,conclusion_code,conclusion_printed,conclusion_is_printed,f2_source) VALUES ($1,$2,$3,$4::numeric,$5,$6::numeric,$7,$8,$9,$10) ON CONFLICT (test_run_id,ref_run_id) DO NOTHING RETURNING comparison_id', [mid, t, f, c.total_sq === null ? null : String(c.total_sq), c.n_points, c.f2 === null ? null : String(c.f2), c.conclusion_code, c.conclusion_printed, c.conclusion_is_printed, c.f2_source]);
    const comparisonId = ins.rowCount ? Number(ins.rows[0].comparison_id) : Number((await db.query('SELECT comparison_id FROM comparison WHERE test_run_id=$1 AND ref_run_id=$2', [t, f])).rows[0].comparison_id);
    if (ins.rowCount) { cmpAdded++; for (const pt of c.points) await db.query('INSERT INTO comparison_point(comparison_id,seq,sq_diff) VALUES ($1,$2,$3::numeric)', [comparisonId, pt.seq, String(pt.sq_diff)]); }
    cmpId.set(`${c.testKey}|${c.refKey}`, comparisonId);
    if (kind === 'sheet' && c.source_avg_row !== null) { const r = pkg.runs.find(x => x.key === c.testKey); const b = r?.sourceBlocks.find(x => x.avg_row === c.source_avg_row); if (b) await db.query('UPDATE run_source_block SET comparison_id=$1 WHERE import_id=$2 AND tab_name=$3 AND avg_row=$4', [comparisonId, importId, b.tab, b.avg_row]); }
  }
  if (kind === 'sheet') {
    for (const ck of pkg.checks) { const id = cmpId.get(`${ck.testKey}|${ck.refKey}`); if (id) await db.query('INSERT INTO import_check(import_id,comparison_id,f2_recomputed) VALUES ($1,$2,$3::numeric) ON CONFLICT (import_id,comparison_id) DO NOTHING', [importId, id, String(ck.f2_recomputed)]); }
    for (const [i, n] of notes.entries()) await db.query('INSERT INTO import_note(import_id,seq,kind,sheet_tab,cell_range,message) VALUES ($1,$2,$3,$4,$5,$6)', [importId, i + 1, n.kind, n.sheet_tab, n.cell_range, n.message]);
  }

  const counts = {}; for (const s of status.values()) counts[s] = (counts[s] || 0) + 1;
  const result = { compile_id: compileId, import_id: importId, runs: pkg.runs.map(r => ({ key: r.key, run_id: runId.get(r.key) ?? null, status: status.get(r.key) })), counts, comparisons_added: cmpAdded };
  const payloadSha = createHash('sha256').update(JSON.stringify(pkg)).digest('hex');
  if (kind === 'studio') await db.query('INSERT INTO studio_push(push_id,compile_id,analyst_id,payload_sha256,outcome) VALUES ($1,$2,$3,$4,$5)', [pushId, compileId, analystId, payloadSha, JSON.stringify(result)]);
  await audit(db, { analystId, userId, action: kind === 'studio' ? 'ingest_commit' : 'import_sheet', entityType: 'compile', entityId: compileId, requestId, ipHash, changes: [['runs_ditambah', null, String(Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(','))], ['perbandingan_ditambah', null, String(cmpAdded)], [kind === 'studio' ? 'push_id' : 'import_id', null, String(pushId ?? importId)]] });
  return { result, payloadSha };
}
