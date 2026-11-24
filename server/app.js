// Satu handler Web-standar (Request -> Response); dipanggil dari api/[...rute].js (Vercel) atau server Node biasa (portabel, REQ-066).
import { randomUUID, createHash } from 'node:crypto';
import { tx, query } from './db.js';
import { withOfficialF2 } from './f2resmi.js';
import { verifyPassword, signSession, readSession, parseCookies, ipHash, dummyHash } from './auth.js';
import { emailKey, findByIdentity, loginBlocked, recordAttempt, changeOwnPassword, listUsers, createUser, patchUser, normEmail, validateAnalystName } from './accounts.js';
import { requiredRole, allowed } from './authz.js';
import { servePage, isPagePath } from './pages.js';
import { loadCompileData } from './compileData.js';
import { buildDashboard } from './dashboard.js';
import { listProducts, productInfo, previewRun, saveRun } from './products.js';
import { patchRun, removeRun, restoreRun, runAudit, removedRuns } from './runs.js';
import { buildXlsx, buildDelimited } from './export.js';
import { routeRecord } from './record.js';
import { readXlsxTabs } from './import/xlsxReader.js';
import { readWorkbook } from './import/sheetReader.js';
import { HttpError, nameKey, aliasKey, validateCompile, validatePackage, verifyStudioComparisons, classifyRuns, qualityWarnings, ensureAnalyst, commitPackage } from './ingest.js';

const MAX_BODY = 1024 * 1024, MAX_XLSX = 4 * 1024 * 1024, SESSION_MS = 12 * 3600 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEC = { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store', 'x-frame-options': 'DENY' };

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...SEC, ...extra } });
const cfg = () => ({ secret: process.env.SESSION_SECRET || '', env: process.env.APP_ENV || 'prod', build: process.env.VERCEL_GIT_COMMIT_SHA || process.env.BUILD_ID || 'dev' });

function cookie(name, value, { env, maxAge }) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${env === 'dev' ? '' : '; Secure'}`;
}

async function readJson(req) {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BODY) throw new HttpError(413, 'Badan permintaan terlalu besar');
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_BODY) throw new HttpError(413, 'Badan permintaan terlalu besar');
  if (text.includes(String.fromCharCode(0)) || text.includes(String.fromCharCode(92) + 'u0000')) throw new HttpError(400, 'Masukan tidak valid', { details: ['karakter NUL tidak diizinkan'] });
  let v; try { v = text ? JSON.parse(text) : {}; } catch { throw new HttpError(400, 'JSON tidak valid'); }
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'Badan permintaan harus berupa objek JSON');   // F11 K-2: null/angka/larik bukan 500
  return v;
}

// Laporan pencocokan impor (sebelum atau sesudah simpan): hanya dari hasil pembaca, tanpa menyimpan.
function importSummary(w) {
  const notes = {}; for (const n of w.notes) (notes[n.kind] ||= []).push({ tab: n.sheet_tab, range: n.cell_range, message: n.message });
  return {
    source_name: w.source_name, compile: w.compile, mediums: w.mediums.map((m) => ({ code: m.code, full_name: m.full_name })), runs: w.runs.length, comparisons: w.comparisons.length,
    f2_cocok: w.checks.filter((x) => x.ok).length, f2_tidak_cocok: w.checks.filter((x) => !x.ok).length,
    tab_diabaikan: (notes.ignored || []).filter((n) => n.tab && !n.range).map((n) => n.tab), ditahan: (notes.hold || []).length, notes,
    ditahan_blok: w.runs.flatMap((r) => (r.sourceBlocks || []).filter((b) => b.import_outcome === 'ditahan').map((b) => ({ batch: r.batch_no, variant: r.variant, medium: r.medium_code, tab: b.tab, avg_row: b.avg_row, alasan: b.hold_reason }))),
  };
}

// F17: rewrite Vercel menambahkan parameter kueri rute (catch-all) / path / nxtP* ke request.url. Dibuang SEKALI di sini, sebelum daftar putih parameter endpoint mana pun; parameter lain dari klien tetap diperiksa dan ditolak apa adanya.
export const INJECTED = /^(rute|\.\.\.rute|path|nxtP.*)$/;
export function stripInjected(url) { for (const k of [...new Set(url.searchParams.keys())]) if (INJECTED.test(k)) url.searchParams.delete(k); return url; }
export async function handle(req) {
  const requestId = randomUUID();
  const c = cfg();
  try {
    const url = new URL(req.url); stripInjected(url);   // F17: buang parameter injeksi rewrite Vercel sebelum validasi apa pun
    const cookieTok = parseCookies(req.headers.get('cookie')).udt_session;
    // Pengguna dari sesi: SELALU dibaca ulang dari database (peran, aktif, token_version); klaim di cookie tidak dipercaya (F10).
    const resolveUser = async () => {
      if (!c.secret || c.secret.length < 32) return null;
      const s0 = readSession(cookieTok, c.secret); if (!s0) return null;
      const u = (await query('SELECT user_id, email, display_name, role, must_change_password, is_active, token_version, analyst_id, is_system FROM app_user WHERE user_id=$1', [s0.uid])).rows[0];
      if (!u || !u.is_active || u.is_system || u.token_version !== s0.tv) return null;
      return { ...u, user_id: Number(u.user_id), analyst_id: Number(u.analyst_id), exp: s0.exp };
    };
    if (!url.pathname.startsWith('/api/')) {
      if (!isPagePath(url.pathname)) throw new HttpError(404, 'Tidak ditemukan');
      const pr = await servePage(req, url, cookieTok ? await resolveUser() : null);
      if (pr) return pr; throw new HttpError(404, 'Tidak ditemukan');
    }
    let path = url.pathname.replace(/\/+$/, ''); const method = req.method.toUpperCase();
    if (path.split('/').some((seg) => /^\d{16,}$/.test(seg))) throw new HttpError(400, 'Id tidak valid');   // di atas batas aman bilangan bulat (F5 S-3): 400, bukan 500
    if (url.search.includes('%00')) throw new HttpError(400, 'Masukan tidak valid');
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    const ipH = ipHash(ip, c.secret || 'x');

    if (path === '/api/bridge') throw new HttpError(404, 'Tidak ditemukan: rute ini dinonaktifkan pada deployment ini');   // F11 K-1: jembatan Google/Gemini bukan bagian aplikasi ini; tanpa ACAO, tanpa cek login

    if (path === '/api/health' && method === 'GET') {
      let schema = null;
      try { schema = Number((await query('SELECT max(version) AS v FROM schema_migration')).rows[0].v); } catch { /* tanpa detail galat */ }
      return json(schema === null ? 503 : 200, { ok: schema !== null, version: c.build, schema_version: schema, env: c.env, request_id: requestId });
    }
    if (!c.secret || c.secret.length < 32) throw new Error('konfigurasi sesi belum lengkap');

    const write = method !== 'GET' && method !== 'HEAD';
    if (write) {
      const origin = req.headers.get('origin');
      if (!origin || origin !== url.origin) throw new HttpError(403, 'Asal permintaan ditolak');
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const body = await readJson(req);
      const GENERIC = 'Masuk gagal. Periksa email/username dan kata sandi, atau tunggu sebelum mencoba lagi.';
      const idn = [body.identity, body.email, body.username].find((x) => typeof x === 'string' && x.trim());   // F12: email ATAU username, tanpa beda huruf besar-kecil
      const em = typeof idn === 'string' && idn.length <= 254 ? normEmail(idn) : '', pw = typeof body.password === 'string' && body.password.length <= 256 ? body.password : '';
      const u = em ? await findByIdentity({ query }, em) : null;
      const ek = emailKey(u ? u.email : em, c.secret);   // kunci laju = akun (email dan username akun yang sama berbagi hitungan); hanya per (identitas, IP) dan per IP
      if (await loginBlocked({ query }, { emailK: ek, ipH })) throw new HttpError(401, GENERIC);   // pesan dan status sama dengan salah kata sandi
      const usable = u && u.is_active && !u.is_system;
      const ok = (await verifyPassword(pw, usable ? u.password_hash : await dummyHash())) && !!usable && !!pw && !!em;   // pekerjaan scrypt sama untuk email tidak dikenal (timing seragam)
      await recordAttempt({ query }, { emailK: ek, ipH, ok });
      if (!ok) throw new HttpError(401, GENERIC);
      await query('UPDATE app_user SET last_login_at=now() WHERE user_id=$1', [u.user_id]);
      const tok = signSession({ exp: Date.now() + SESSION_MS, uid: Number(u.user_id), tv: u.token_version }, c.secret);
      return json(200, { ok: true, role: u.role, display_name: u.display_name, must_change_password: u.must_change_password, request_id: requestId }, { 'set-cookie': cookie('udt_session', tok, { env: c.env, maxAge: SESSION_MS / 1000 }) });
    }

    const me = await resolveUser();
    if (!me) throw new HttpError(401, 'Belum masuk');
    const min = requiredRole(method, path);
    if (min === null) throw new HttpError(404, 'Tidak ditemukan');
    const SELF = ['/api/me', '/api/auth/logout', '/api/auth/password'];
    if (me.must_change_password && !SELF.includes(path)) throw new HttpError(403, 'Ganti kata sandi sementara dulu', { must_change_password: true });
    if (!allowed(me.role, min)) throw new HttpError(403, min === 'admin' ? 'Hanya admin' : 'Peran Anda tidak boleh menulis data');
    const role = me.role;
    // F12: nama analis/pemeriksa DIKETIK pengguna pada tiap simpan/impor/ubah/hapus (tidak lagi diambil dari akun). Audit mencatat akun (user_id) DAN nama yang diketik (analyst_id).
        const noName = (b) => { const { analyst_name, ...rest } = b; return rest; };

    if (path === '/api/auth/logout' && method === 'POST') {   // cabut SEMUA sesi akun ini (token_version naik)
      await query('UPDATE app_user SET token_version=token_version+1 WHERE user_id=$1', [me.user_id]);
      return json(200, { ok: true }, { 'set-cookie': cookie('udt_session', '', { env: c.env, maxAge: 0 }) });
    }
    if (path === '/api/me' && method === 'GET') return json(200, { authenticated: true, user_id: me.user_id, email: me.email, display_name: me.display_name, role, must_change_password: me.must_change_password, expires_at: me.exp });
    if (path === '/api/me/analyst' && method === 'PUT') throw new HttpError(410, 'Nama analis diketik pada tiap simpan (analyst_name); tidak disimpan di akun');
    if (path === '/api/auth/password' && method === 'POST') {
      const b = await readJson(req);
      const ek = emailKey(me.email, c.secret);   // sesi curian tidak boleh dipakai menebak kata sandi saat ini: dibatasi seperti login
      if (await loginBlocked({ query }, { emailK: ek, ipH })) throw new HttpError(429, 'Terlalu banyak percobaan. Tunggu sebelum mencoba lagi.');
      let tv;
      try { tv = await tx((db) => changeOwnPassword(db, { user: me, current: b.current_password, next: b.new_password, requestId, ipHash: ipH })); }
      catch (e) { if (e.wrongCurrent) await recordAttempt({ query }, { emailK: ek, ipH, ok: false }); throw e; }
      const tok = signSession({ exp: me.exp, uid: me.user_id, tv }, c.secret);
      return json(200, { ok: true }, { 'set-cookie': cookie('udt_session', tok, { env: c.env, maxAge: Math.max(1, Math.floor((me.exp - Date.now()) / 1000)) }) });
    }
    if (path === '/api/admin/users' && method === 'GET') return json(200, { users: await listUsers({ query }) });
    if (path === '/api/admin/users' && method === 'POST') {
      if (process.env.UDT_ALLOW_ACCOUNT_CREATE !== '1') throw new HttpError(403, 'Pembuatan akun lewat aplikasi dinonaktifkan: hanya dua akun bersama (Formdev, Andev) dari scripts/user_admin.mjs seed-env');
      const b = await readJson(req);
      const out = await tx((db) => createUser(db, { email: b.email, displayName: b.display_name, role: b.role, actorAnalystId: me.analyst_id, requestId, ipHash: ipH }));
      return json(201, out);   // temporary_password hanya di sini, sekali
    }
    let am;
    if ((am = /^\/api\/admin\/users\/(\d+)$/.exec(path)) && method === 'PATCH') {
      const b = await readJson(req);
      return json(200, await tx((db) => patchUser(db, { id: Number(am[1]), actor: me, body: b, requestId, ipHash: ipH })));
    }

    // ---- F15: /record (penelusur + CRUD terkontrol; docs/KONTRAK_API_COMPILER.md bagian Record) ----
    if (path.startsWith('/api/record/')) {
      const rr = await routeRecord({ method, path, url, role, me, query, tx, readJson: () => readJson(req), requestId, ipHash: ipH });
      if (rr) return rr.raw !== undefined ? new Response(rr.raw, { status: rr.status, headers: { ...SEC, ...rr.headers } }) : json(rr.status, rr.body);
    }

    // ---- F6: kontrak Compiler (docs/KONTRAK_API_COMPILER.md). /api/compiles/* tetap ada (Studio dan alat lama). ----
    let pm;
    if (path === '/api/products' && method === 'GET') return json(200, await listProducts(query));
    if (path === '/api/products' || path === '/api/products/match') path = path.replace('/api/products', '/api/compiles');   // buat produk baru dan kunci produk: logika yang sama
    else if ((pm = /^\/api\/products\/(\d+)$/.exec(path)) && method === 'GET') {
      const info = await productInfo(query, Number(pm[1])); if (!info) throw new HttpError(404, 'Produk tidak ditemukan');
      return json(200, info);
    } else if ((pm = /^\/api\/products\/(\d+)\/dashboard$/.exec(path)) && method === 'GET') {
      const d = await buildDashboard(query, Number(pm[1])); if (!d) throw new HttpError(404, 'Produk tidak ditemukan');
      return json(200, d);
    } else if ((pm = /^\/api\/products\/(\d+)\/runs\/preview$/.exec(path)) && method === 'POST') return json(200, await previewRun(query, Number(pm[1]), await readJson(req)));
    else if ((pm = /^\/api\/products\/(\d+)\/runs$/.exec(path)) && method === 'POST') {
      const body = await readJson(req), analystName = validateAnalystName(body.analyst_name);
      const out = await tx((db) => saveRun(db, query, Number(pm[1]), noName(body), { analystName, userId: me.user_id, requestId, ipHash: ipH }));
      return json(out.replay ? 200 : 201, out);
    } else if ((pm = /^\/api\/products\/(\d+)\/export$/.exec(path)) && method === 'GET') path = `/api/compiles/${pm[1]}/export`;

    if (path === '/api/compiles' && method === 'GET') {
      const r = await query(`SELECT c.compile_id, c.product_name, c.strength, c.dosage_form, c.api, c.api_uncertain, c.project_code, c.title, c.created_at,
          (SELECT count(*) FROM medium m WHERE m.compile_id=c.compile_id) AS medium_count,
          (SELECT count(*) FROM run_visible v WHERE v.compile_id=c.compile_id) AS run_count
        FROM compile c ORDER BY c.product_name, c.strength`);
      return json(200, { compiles: r.rows.map(x => ({ ...x, compile_id: Number(x.compile_id), medium_count: Number(x.medium_count), run_count: Number(x.run_count) })) });
    }
    if (path === '/api/compiles' && method === 'POST') {
      const b = await readJson(req), analystName = validateAnalystName(b.analyst_name);
      const cm = validateCompile(noName(b));
      try {
        const id = await tx(async (db) => {
          const aid = await ensureAnalyst(db, analystName);
          const r = await db.query('INSERT INTO compile(product_name,strength,dosage_form,api,title,created_by,project_code) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING compile_id', [cm.product_name, cm.strength, cm.dosage_form, cm.api, cm.title, aid, cm.project_code]);
          await db.query("INSERT INTO audit_event(analyst_id,action,entity_type,entity_id,request_id,ip_hash,user_id) VALUES ($1,'compile_create','compile',$2,$3,$4,$5)", [aid, r.rows[0].compile_id, requestId, ipH, me.user_id]);
          return Number(r.rows[0].compile_id);
        });
        return json(201, { compile_id: id, title: cm.title });
      } catch (e) { if (e.code === '23505') throw new HttpError(409, 'Compile untuk produk, kekuatan, dan bentuk ini sudah ada'); throw e; }
    }
    let m;
    if (path === '/api/compiles/match' && method === 'GET') {   // kunci produk: kode project/SKU dulu, lalu nama ternormalisasi, lalu alias; hanya kandidat, tidak ada gabung otomatis
      const sp = url.searchParams, code = (sp.get('code') || '').trim(), prod = sp.get('product') || '', st = sp.get('strength') || '', fm = sp.get('form') || '';
      const nk = nameKey(prod, st, fm), ak = aliasKey([prod, st, fm].join(' '));
      const cand = new Map();
      const COLS = 'c.compile_id, c.product_name, c.strength, c.dosage_form, c.project_code, c.title';
      const add = async (sql, p, by) => { for (const r of (await query(sql, p)).rows) if (!cand.has(Number(r.compile_id))) cand.set(Number(r.compile_id), { ...r, compile_id: Number(r.compile_id), matched_by: by }); };
      if (code) await add(`SELECT ${COLS} FROM compile c WHERE lower(c.project_code)=lower($1)`, [code], 'kode');
      if (nk) await add(`SELECT ${COLS} FROM compile c WHERE c.name_key=$1`, [nk], 'nama');
      if (ak) await add(`SELECT ${COLS} FROM compile c JOIN compile_alias a ON a.compile_id=c.compile_id WHERE a.alias_key=$1`, [ak], 'alias');
      return json(200, { candidates: [...cand.values()] });
    }
    if ((m = /^\/api\/compiles\/(\d+)\/aliases$/.exec(path)) && method === 'POST') {
      const b = await readJson(req); const al = typeof b.alias === 'string' ? b.alias.trim() : '';
      const analystName = validateAnalystName(b.analyst_name);
      if (!al || al.length > 200) throw new HttpError(400, 'Alias wajib (1 sampai 200 karakter)');
      await tx(async (db) => { const aid = await ensureAnalyst(db, analystName); await db.query("INSERT INTO compile_alias(compile_id,alias,alias_key,source,created_by) VALUES ($1,$2,$3,'analis',$4) ON CONFLICT (compile_id,alias_key) DO NOTHING", [Number(m[1]), al, aliasKey(al), aid]); });
      return json(201, { ok: true });
    }
    if ((m = /^\/api\/compiles\/(\d+)$/.exec(path)) && method === 'GET') {
      const id = Number(m[1]);
      const c1 = (await query('SELECT * FROM compile WHERE compile_id=$1', [id])).rows[0];
      if (!c1) throw new HttpError(404, 'Compile tidak ditemukan');
      const med = await query(`SELECT m.medium_id, m.code, m.full_name, m.volume_text, m.apparatus, m.rpm_text, m.method, m.method_ref, mc.label, (SELECT count(*) FROM run_visible v WHERE v.medium_id=m.medium_id) AS run_count
        FROM medium m JOIN medium_code mc ON mc.code=m.code WHERE m.compile_id=$1 ORDER BY mc.sort_no, m.full_name`, [id]);
      return json(200, { compile: { ...c1, compile_id: Number(c1.compile_id) }, mediums: med.rows.map(x => ({ ...x, medium_id: Number(x.medium_id), run_count: Number(x.run_count) })) });
    }

    if ((m = /^\/api\/compiles\/(\d+)\/data$/.exec(path)) && method === 'GET') {   // Sprint 2: data baca untuk dashboard (run terlihat saja, termasuk Tidak valid; UI menyembunyikannya)
      const id = Number(m[1]);
      const data = await loadCompileData(query, Number(m[1]));
      if (!data) throw new HttpError(404, 'Compile tidak ditemukan');
      return json(200, data);
    }

    // ---- Sprint 3: ubah, hapus, pulihkan, jejak (hanya penulis; guard peran di atas) ----
    if ((m = /^\/api\/runs\/(\d+)$/.exec(path)) && method === 'PATCH') {
      const body = await readJson(req), analystName = validateAnalystName(body.analyst_name);
      return json(200, await tx((db) => patchRun(db, { id: Number(m[1]), body: noName(body), analystName, userId: me.user_id, requestId, ipHash: ipH })));
    }
    if ((m = /^\/api\/runs\/(\d+)\/(delete|restore)$/.exec(path)) && method === 'POST') {
      const fn = m[2] === 'delete' ? removeRun : restoreRun, body = await readJson(req), analystName = validateAnalystName(body.analyst_name);
      return json(200, await tx((db) => fn(db, { id: Number(m[1]), body: noName(body), analystName, userId: me.user_id, requestId, ipHash: ipH })));
    }
    if ((m = /^\/api\/runs\/(\d+)\/audit$/.exec(path)) && method === 'GET') return json(200, { events: await runAudit((t, p) => query(t, p), Number(m[1])) });
    if ((m = /^\/api\/compiles\/(\d+)\/removed$/.exec(path)) && method === 'GET') return json(200, { runs: await removedRuns((t, p) => query(t, p), Number(m[1])) });
    if ((m = /^\/api\/compiles\/(\d+)\/export$/.exec(path)) && method === 'GET') {   // ekspor satu arah; tidak ada baca-balik
      const raw = await loadCompileData(query, Number(m[1]), { withPoints: true });
      if (!raw) throw new HttpError(404, 'Compile tidak ditemukan');
      const data = withOfficialF2(raw);   // F17: f2/Total/n di ekspor = Langkah 4
      const fmt = url.searchParams.get('format') || 'xlsx';
      const base = data.compile.title.replace(/[^\w .,()-]+/g, '_');
      const dl = (ctype, ext, body) => new Response(body, { status: 200, headers: { ...SEC, 'content-type': ctype, 'content-disposition': `attachment; filename="${base}.${ext}"` } });
      if (fmt === 'xlsx') return dl('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx', await buildXlsx(data));
      if (fmt === 'csv') return dl('text/csv; charset=utf-8', 'csv', '﻿' + buildDelimited(data, ','));
      if (fmt === 'tsv') return dl('text/tab-separated-values; charset=utf-8', 'tsv', '﻿' + buildDelimited(data, '	'));
      throw new HttpError(400, 'format: xlsx, csv, atau tsv');
    }
    if (path === '/api/imports/xlsx' && method === 'POST') {   // impor dari UI: .xlsx mentah; ?dry=1 = laporan pencocokan tanpa menyimpan
      const buf = Buffer.from(await req.arrayBuffer());
      if (!buf.length || buf.length > MAX_XLSX) throw new HttpError(413, 'Berkas kosong atau lebih dari 4 MB');
      if (buf[0] !== 0x50 || buf[1] !== 0x4b) throw new HttpError(400, 'Bukan berkas .xlsx');
      const fileName = decodeURIComponent(req.headers.get('x-file-name') || '').replace(/^.*[\/]/, '');
      const dry = url.searchParams.get('dry') === '1';
      let rawName = ''; try { rawName = decodeURIComponent(req.headers.get('x-analyst-name') || ''); } catch { /* tidak valid: ditolak validator */ }
      const analystName = dry ? null : validateAnalystName(rawName);   // pratinjau (dry) tidak menulis, nama tidak wajib
      let tabs; try { tabs = await readXlsxTabs(buf); } catch { throw new HttpError(400, 'Berkas .xlsx tidak dapat dibaca'); }
      const raw = readWorkbook({ fileName, tabs });
      for (const t of tabs) if (t.emptyComments) raw.notes.push({ kind: 'info', sheet_tab: t.name, cell_range: null, message: `${t.emptyComments} komentar sel tanpa teks yang terbaca (komentar berutas Google tidak dibaca dari .xlsx; periksa di sheet asli)` });
      const pkg = validatePackage(raw, { kind: 'sheet' });
      const summary = importSummary(raw);
      if (dry) return json(200, { dry: true, ...summary, warnings: qualityWarnings(pkg) });
      const out = await tx(async (db) => commitPackage(db, { pkg, kind: 'sheet', analystId: await ensureAnalyst(db, analystName), userId: me.user_id, requestId, ipHash: ipH }));
      return json(201, { ...out.result, ...summary, warnings: qualityWarnings(pkg) });
    }

    if (path === '/api/ingest/preview' && method === 'POST') {
      const pkg = verifyStudioComparisons(validatePackage(await readJson(req), { kind: 'studio' }));
      const cls = await classifyRuns({ query }, pkg.compile_id, pkg);   // tidak menulis apa pun
      const counts = {}; for (const x of cls) counts[x.status] = (counts[x.status] || 0) + 1;
      return json(200, { compile_id: pkg.compile_id, runs: cls.map(x => ({ key: x.key, status: x.status, existing_run_ids: x.existing_run_ids })), counts, warnings: qualityWarnings(pkg), comparisons: pkg.comparisons.length });
    }
    if (path === '/api/ingest/commit' && method === 'POST') {
      const body = await readJson(req), analystName = validateAnalystName(body.analyst_name);
      if (typeof body.push_id !== 'string' || !UUID.test(body.push_id)) throw new HttpError(400, 'push_id (UUID) wajib');
      const decisions = body.decisions && typeof body.decisions === 'object' ? body.decisions : {};
      const pkg = verifyStudioComparisons(validatePackage(body.package, { kind: 'studio' }));
      const out = await tx(async (db) => {
        const aid = await ensureAnalyst(db, analystName);
        await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [body.push_id]);
        const prev = (await db.query('SELECT outcome, payload_sha256 FROM studio_push WHERE push_id=$1', [body.push_id])).rows[0];
        if (prev) {
          if (prev.payload_sha256 !== createHash('sha256').update(JSON.stringify(pkg)).digest('hex')) throw new HttpError(409, 'push_id ini sudah dipakai untuk isi yang berbeda; mulai kirim baru');
          return { replay: true, result: JSON.parse(prev.outcome) };
        }
        return { replay: false, ...(await commitPackage(db, { pkg, kind: 'studio', analystId: aid, userId: me.user_id, pushId: body.push_id, decisions, requestId, ipHash: ipH })), warnings: qualityWarnings(pkg) };
      });
      return json(out.replay ? 200 : 201, { ...out.result, replay: out.replay, warnings: out.warnings || [] });
    }

    if (path === '/api/imports' && method === 'POST') {
      const b = await readJson(req), analystName = validateAnalystName(b.analyst_name);
      const pkg = validatePackage(noName(b), { kind: 'sheet' });
      const out = await tx(async (db) => commitPackage(db, { pkg, kind: 'sheet', analystId: await ensureAnalyst(db, analystName), userId: me.user_id, requestId, ipHash: ipH }));
      return json(201, { ...out.result, warnings: qualityWarnings(pkg) });
    }
    if ((m = /^\/api\/imports\/(\d+)\/report$/.exec(path)) && method === 'GET') {
      const id = Number(m[1]);
      const imp = (await query('SELECT import_id, source_name, started_at, f2_tolerance FROM import_run WHERE import_id=$1', [id])).rows[0];
      if (!imp) throw new HttpError(404, 'Impor tidak ditemukan');
      const q1 = async (sql, p = [id]) => (await query(sql, p)).rows[0];
      const runs = await q1('SELECT count(*) AS n FROM run WHERE import_id=$1');
      const vess = await q1('SELECT count(DISTINCT (rv.run_id, rv.vessel_no)) AS vessels, count(*) AS vals FROM run_value rv JOIN run r ON r.run_id=rv.run_id WHERE r.import_id=$1');
      const cmp = await q1('SELECT count(*) AS n FROM comparison c JOIN run r ON r.run_id=c.test_run_id WHERE r.import_id=$1');
      const chk = await q1(`SELECT count(*) FILTER (WHERE abs(c.f2 - k.f2_recomputed) <= $2) AS cocok, count(*) FILTER (WHERE abs(c.f2 - k.f2_recomputed) > $2) AS tidak_cocok FROM import_check k JOIN comparison c ON c.comparison_id=k.comparison_id WHERE k.import_id=$1`, [id, imp.f2_tolerance]);
      const notes = await query('SELECT kind, sheet_tab, cell_range, message FROM import_note WHERE import_id=$1 ORDER BY seq', [id]);
      const held = (await query("SELECT b.batch_no AS batch, r.variant, m.code AS medium, s.tab_name AS tab, s.avg_row, s.hold_reason AS alasan FROM run_source_block s JOIN run r ON r.run_id=s.run_id JOIN batch b ON b.batch_id=r.batch_id JOIN medium m ON m.medium_id=r.medium_id WHERE s.import_id=$1 AND s.import_outcome='ditahan' ORDER BY s.source_block_id", [id])).rows;
      const merged = await q1('SELECT count(*) AS n FROM (SELECT run_id FROM run_source_block WHERE import_id=$1 GROUP BY run_id HAVING count(*) > 1) x');
      const grouped = {}; for (const n of notes.rows) (grouped[n.kind] ||= []).push(n);
      return json(200, { import: { ...imp, import_id: Number(imp.import_id), f2_tolerance: Number(imp.f2_tolerance) }, runs: Number(runs.n), vessels: Number(vess.vessels), values: Number(vess.vals), comparisons: Number(cmp.n), ditahan_blok: held, f2_cocok: Number(chk.cocok), f2_tidak_cocok: Number(chk.tidak_cocok), runs_dari_blok_ganda: Number(merged.n), notes: grouped });
    }
    throw new HttpError(404, 'Tidak ditemukan');
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message, request_id: requestId, ...(e.extra || {}) });
    if (e?.code === '23503') { console.error(`[${requestId}] rujukan data tidak ada atau bentrok: ${e.constraint || '?'}`); return json(409, { error: 'Data merujuk ke data yang tidak ada atau bentrok dengan data tersimpan; tidak ada yang disimpan', request_id: requestId }); }
    if (typeof e?.code === 'string' && (e.code.startsWith('22') || e.code === '23514' || e.code === '23502')) { console.error(`[${requestId}] masukan ditolak basis data: ${e.code}`); return json(400, { error: 'Masukan tidak valid', request_id: requestId }); }
    if (e?.code === '23505') console.error(`[${requestId}] bentrok kunci unik: ${e.constraint || '?'}`);
    if (e?.code === '23505') return json(409, { error: 'Data bentrok dengan data tersimpan (kunci unik); tidak ada yang disimpan', request_id: requestId });
    console.error(`[${requestId}] galat ${e?.code || e?.name || 'tak_dikenal'}`);   // tanpa jejak tumpukan, kata sandi, alamat DB, atau nilai data
    return json(500, { error: 'Terjadi galat pada server', request_id: requestId });
  }
}
