// Satu handler Web-standar (Request -> Response); dipanggil dari api/[...rute].js (Vercel) atau server Node biasa (portabel, REQ-066).
import { randomUUID } from 'node:crypto';
import { tx, query } from './db.js';
import { verifyPassword, signSession, readSession, parseCookies, ipHash } from './auth.js';
import { loadCompileData } from './compileData.js';
import { patchRun, removeRun, restoreRun, runAudit, removedRuns } from './runs.js';
import { buildXlsx, buildDelimited } from './export.js';
import { readXlsxTabs } from './import/xlsxReader.js';
import { readWorkbook } from './import/sheetReader.js';
import { HttpError, validateCompile, validatePackage, classifyRuns, qualityWarnings, ensureAnalyst, commitPackage } from './ingest.js';

const MAX_BODY = 1024 * 1024, MAX_XLSX = 4 * 1024 * 1024, SESSION_MS = 12 * 3600 * 1000, LOGIN_WINDOW_MIN = 15, LOGIN_MAX_FAIL = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEC = { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store', 'x-frame-options': 'DENY' };

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...SEC, ...extra } });
const cfg = () => ({ secret: process.env.SESSION_SECRET || '', pwHash: process.env.UDT_WRITER_PASSWORD_HASH || process.env.UDT_SHARED_PASSWORD_HASH || '', rdHash: process.env.UDT_READER_PASSWORD_HASH || '', env: process.env.APP_ENV || 'prod', build: process.env.VERCEL_GIT_COMMIT_SHA || process.env.BUILD_ID || 'dev' });

function cookie(name, value, { env, maxAge }) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${env === 'dev' ? '' : '; Secure'}`;
}

async function readJson(req) {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BODY) throw new HttpError(413, 'Badan permintaan terlalu besar');
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_BODY) throw new HttpError(413, 'Badan permintaan terlalu besar');
  try { return text ? JSON.parse(text) : {}; } catch { throw new HttpError(400, 'JSON tidak valid'); }
}

// Laporan pencocokan impor (sebelum atau sesudah simpan): hanya dari hasil pembaca, tanpa menyimpan.
function importSummary(w) {
  const notes = {}; for (const n of w.notes) (notes[n.kind] ||= []).push({ tab: n.sheet_tab, range: n.cell_range, message: n.message });
  return {
    source_name: w.source_name, compile: w.compile, mediums: w.mediums.map((m) => ({ code: m.code, full_name: m.full_name })), runs: w.runs.length, comparisons: w.comparisons.length,
    f2_cocok: w.checks.filter((x) => x.ok).length, f2_tidak_cocok: w.checks.filter((x) => !x.ok).length,
    tab_diabaikan: (notes.ignored || []).filter((n) => n.tab && !n.range).map((n) => n.tab), ditahan: (notes.hold || []).length, notes,
  };
}

export async function handle(req) {
  const requestId = randomUUID();
  const c = cfg();
  try {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) throw new HttpError(404, 'Tidak ditemukan');
    const path = url.pathname.replace(/\/+$/, ''), method = req.method.toUpperCase();
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    const ipH = ipHash(ip, c.secret || 'x');

    if (path === '/api/health' && method === 'GET') {
      let schema = null;
      try { schema = Number((await query('SELECT max(version) AS v FROM schema_migration')).rows[0].v); } catch { /* tanpa detail galat */ }
      return json(schema === null ? 503 : 200, { ok: schema !== null, version: c.build, schema_version: schema, env: c.env, request_id: requestId });
    }
    if (!c.secret || c.secret.length < 32 || !c.pwHash) throw new Error('konfigurasi sesi belum lengkap');

    const write = method !== 'GET' && method !== 'HEAD';
    if (write) {
      const origin = req.headers.get('origin');
      if (!origin || origin !== url.origin) throw new HttpError(403, 'Asal permintaan ditolak');
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const body = await readJson(req);
      const fails = Number((await query(`SELECT count(*) AS n FROM login_attempt WHERE ip_hash=$1 AND ok=false AND at_utc > now() - ($2 || ' minutes')::interval`, [ipH, String(LOGIN_WINDOW_MIN)])).rows[0].n);
      const GENERIC = 'Masuk gagal. Periksa kata sandi, atau tunggu sebelum mencoba lagi.';
      if (fails >= LOGIN_MAX_FAIL) { await query('INSERT INTO login_attempt(ip_hash,ok) VALUES ($1,false)', [ipH]); throw new HttpError(401, GENERIC); }
      const pw = typeof body.password === 'string' ? body.password : '';
      const role = verifyPassword(pw, c.pwHash) ? 'penulis' : (c.rdHash && verifyPassword(pw, c.rdHash) ? 'pembaca' : null);   // dua peran: penulis (Studio, Andev) dan pembaca (Compiler)
      await query('INSERT INTO login_attempt(ip_hash,ok) VALUES ($1,$2)', [ipH, !!role]);
      if (!role) throw new HttpError(401, GENERIC);
      const tok = signSession({ exp: Date.now() + SESSION_MS, analyst: null, role }, c.secret);
      return json(200, { ok: true, role, request_id: requestId }, { 'set-cookie': cookie('udt_session', tok, { env: c.env, maxAge: SESSION_MS / 1000 }) });
    }

    const sess = readSession(parseCookies(req.headers.get('cookie')).udt_session, c.secret);
    if (!sess) throw new HttpError(401, 'Belum masuk');

    if (path === '/api/auth/logout' && method === 'POST') return json(200, { ok: true }, { 'set-cookie': cookie('udt_session', '', { env: c.env, maxAge: 0 }) });
    const role = sess.role || 'penulis';   // sesi lama tanpa peran = penulis
    if (path === '/api/me' && method === 'GET') return json(200, { authenticated: true, role, analyst: sess.analyst, expires_at: sess.exp });
    if (path === '/api/me/analyst' && method === 'PUT') {
      if (role !== 'penulis') throw new HttpError(403, 'Peran pembaca tidak menulis data');
      const b = await readJson(req); const name = typeof b.name === 'string' ? b.name.trim() : '';
      if (!name || name.length > 80) throw new HttpError(400, 'Nama analis wajib (1 sampai 80 karakter)');
      const tok = signSession({ exp: sess.exp, analyst: name, role }, c.secret);
      return json(200, { ok: true, analyst: name }, { 'set-cookie': cookie('udt_session', tok, { env: c.env, maxAge: Math.max(1, Math.floor((sess.exp - Date.now()) / 1000)) }) });
    }

    if (write && role !== 'penulis') throw new HttpError(403, 'Peran pembaca tidak boleh menulis data');
    if (write && !sess.analyst) throw new HttpError(400, 'Nama analis wajib diisi sebelum menulis data');

    if (path === '/api/compiles' && method === 'GET') {
      const r = await query(`SELECT c.compile_id, c.product_name, c.strength, c.dosage_form, c.api, c.title, c.created_at,
          (SELECT count(*) FROM medium m WHERE m.compile_id=c.compile_id) AS medium_count,
          (SELECT count(*) FROM run_visible v WHERE v.compile_id=c.compile_id) AS run_count
        FROM compile c ORDER BY c.product_name, c.strength`);
      return json(200, { compiles: r.rows.map(x => ({ ...x, compile_id: Number(x.compile_id), medium_count: Number(x.medium_count), run_count: Number(x.run_count) })) });
    }
    if (path === '/api/compiles' && method === 'POST') {
      const b = await readJson(req);
      const cm = validateCompile(b);
      const aid = await ensureAnalyst({ query }, sess.analyst);
      try {
        const id = await tx(async (db) => {
          const r = await db.query('INSERT INTO compile(product_name,strength,dosage_form,api,title,created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING compile_id', [cm.product_name, cm.strength, cm.dosage_form, cm.api, cm.title, aid]);
          await db.query("INSERT INTO audit_event(analyst_id,action,entity_type,entity_id,request_id,ip_hash) VALUES ($1,'compile_create','compile',$2,$3,$4)", [aid, r.rows[0].compile_id, requestId, ipH]);
          return Number(r.rows[0].compile_id);
        });
        return json(201, { compile_id: id, title: cm.title });
      } catch (e) { if (e.code === '23505') throw new HttpError(409, 'Compile untuk produk, kekuatan, dan bentuk ini sudah ada'); throw e; }
    }
    let m;
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
      const body = await readJson(req);
      return json(200, await tx((db) => patchRun(db, { id: Number(m[1]), body, analystName: sess.analyst, requestId, ipHash: ipH })));
    }
    if ((m = /^\/api\/runs\/(\d+)\/(delete|restore)$/.exec(path)) && method === 'POST') {
      const fn = m[2] === 'delete' ? removeRun : restoreRun, body = await readJson(req);
      return json(200, await tx((db) => fn(db, { id: Number(m[1]), body, analystName: sess.analyst, requestId, ipHash: ipH })));
    }
    if ((m = /^\/api\/runs\/(\d+)\/audit$/.exec(path)) && method === 'GET') return json(200, { events: await runAudit((t, p) => query(t, p), Number(m[1])) });
    if ((m = /^\/api\/compiles\/(\d+)\/removed$/.exec(path)) && method === 'GET') return json(200, { runs: await removedRuns((t, p) => query(t, p), Number(m[1])) });
    if ((m = /^\/api\/compiles\/(\d+)\/export$/.exec(path)) && method === 'GET') {   // ekspor satu arah; tidak ada baca-balik
      const data = await loadCompileData(query, Number(m[1]), { withPoints: true });
      if (!data) throw new HttpError(404, 'Compile tidak ditemukan');
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
      let tabs; try { tabs = await readXlsxTabs(buf); } catch { throw new HttpError(400, 'Berkas .xlsx tidak dapat dibaca'); }
      const raw = readWorkbook({ fileName, tabs });
      const pkg = validatePackage(raw, { kind: 'sheet' });
      const summary = importSummary(raw);
      if (url.searchParams.get('dry') === '1') return json(200, { dry: true, ...summary, warnings: qualityWarnings(pkg) });
      const aid = await ensureAnalyst({ query }, sess.analyst);
      const out = await tx((db) => commitPackage(db, { pkg, kind: 'sheet', analystId: aid, requestId, ipHash: ipH }));
      return json(201, { ...out.result, ...summary, warnings: qualityWarnings(pkg) });
    }

    if (path === '/api/ingest/preview' && method === 'POST') {
      const pkg = validatePackage(await readJson(req), { kind: 'studio' });
      const cls = await classifyRuns({ query }, pkg.compile_id, pkg);   // tidak menulis apa pun
      const counts = {}; for (const x of cls) counts[x.status] = (counts[x.status] || 0) + 1;
      return json(200, { compile_id: pkg.compile_id, runs: cls.map(x => ({ key: x.key, status: x.status, existing_run_ids: x.existing_run_ids })), counts, warnings: qualityWarnings(pkg), comparisons: pkg.comparisons.length });
    }
    if (path === '/api/ingest/commit' && method === 'POST') {
      const body = await readJson(req);
      if (typeof body.push_id !== 'string' || !UUID.test(body.push_id)) throw new HttpError(400, 'push_id (UUID) wajib');
      const decisions = body.decisions && typeof body.decisions === 'object' ? body.decisions : {};
      const pkg = validatePackage(body.package, { kind: 'studio' });
      const aid = await ensureAnalyst({ query }, sess.analyst);
      const out = await tx(async (db) => {
        await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [body.push_id]);
        const prev = (await db.query('SELECT outcome FROM studio_push WHERE push_id=$1', [body.push_id])).rows[0];
        if (prev) return { replay: true, result: JSON.parse(prev.outcome) };
        return { replay: false, ...(await commitPackage(db, { pkg, kind: 'studio', analystId: aid, pushId: body.push_id, decisions, requestId, ipHash: ipH })), warnings: qualityWarnings(pkg) };
      });
      return json(out.replay ? 200 : 201, { ...out.result, replay: out.replay, warnings: out.warnings || [] });
    }

    if (path === '/api/imports' && method === 'POST') {
      const pkg = validatePackage(await readJson(req), { kind: 'sheet' });
      const aid = await ensureAnalyst({ query }, sess.analyst);
      const out = await tx((db) => commitPackage(db, { pkg, kind: 'sheet', analystId: aid, requestId, ipHash: ipH }));
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
      const merged = await q1('SELECT count(*) AS n FROM (SELECT run_id FROM run_source_block WHERE import_id=$1 GROUP BY run_id HAVING count(*) > 1) x');
      const grouped = {}; for (const n of notes.rows) (grouped[n.kind] ||= []).push(n);
      return json(200, { import: { ...imp, import_id: Number(imp.import_id), f2_tolerance: Number(imp.f2_tolerance) }, runs: Number(runs.n), vessels: Number(vess.vessels), values: Number(vess.vals), comparisons: Number(cmp.n), f2_cocok: Number(chk.cocok), f2_tidak_cocok: Number(chk.tidak_cocok), runs_dari_blok_ganda: Number(merged.n), notes: grouped });
    }
    throw new HttpError(404, 'Tidak ditemukan');
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message, request_id: requestId, ...(e.extra || {}) });
    if (e?.code === '23505') console.error(`[${requestId}] bentrok kunci unik: ${e.constraint || '?'}`);
    if (e?.code === '23505') return json(409, { error: 'Data bentrok dengan data tersimpan (kunci unik); tidak ada yang disimpan', request_id: requestId });
    console.error(`[${requestId}] galat ${e?.code || e?.name || 'tak_dikenal'}`);   // tanpa jejak tumpukan, kata sandi, alamat DB, atau nilai data
    return json(500, { error: 'Terjadi galat pada server', request_id: requestId });
  }
}
