// Titik akhir Compiler F6: daftar produk, info produk, pratinjau run dan simpan run dari formulir "Tambah data run".
// Semua angka (rata-rata, RSD, f2) dihitung di sini; penyimpanan memakai commitPackage yang sama dengan Kirim ke Compiler (push_id idempoten, jejak audit).
import { createHash } from 'node:crypto';
import * as step4 from './step4.js';
import { runProfile, f2Between } from './lib/udtBridge.js';
import { loadCompileData } from './compileData.js';
import { f2Tim } from './f2tim.js';
import { alignedAvg, productLabel, shortBrand, MEDIUM_BAKU, labelOfCode, rsdLimit, fmt1 } from './dashboard.js';
import { HttpError, validatePackage, classifyRuns, qualityWarnings, commitPackage, ensureAnalyst } from './ingest.js';
import { MEDIUM_CODES } from './import/sheetReader.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fin = (x) => typeof x === 'number' && Number.isFinite(x);

export async function listProducts(query) {
  const r = await query(`SELECT c.compile_id, c.product_name, c.strength, c.dosage_form, c.api, c.api_uncertain, c.project_code,
      (SELECT count(*) FROM medium m WHERE m.compile_id=c.compile_id) AS medium_count,
      (SELECT count(*) FROM run_visible v WHERE v.compile_id=c.compile_id) AS run_count,
      (SELECT to_char(max(v.test_date),'YYYY-MM-DD') FROM run_visible v WHERE v.compile_id=c.compile_id) AS last_test_date
    FROM compile c ORDER BY c.product_name, c.strength, c.dosage_form`);
  return { products: r.rows.map((x) => ({ id: Number(x.compile_id), name: productLabel(x), product_name: x.product_name, strength: x.strength, dosage_form: x.dosage_form, api: x.api, api_uncertain: x.api_uncertain, project_code: x.project_code, medium_count: Number(x.medium_count), run_count: Number(x.run_count), last_test_date: x.last_test_date })) };
}

// Isian formulir yang diturunkan dari produk dan medium (f-vol, f-app, f-met) + pembanding + merek uji bawaan.
export async function productInfo(query, id) {
  const data = await loadCompileData(query, id);
  if (!data) return null;
  const mediums = MEDIUM_CODES.map((code) => {
    const m = data.mediums.find((x) => x.code === code);
    return { code, name: labelOfCode(code), full_name: m ? m.full_name : (MEDIUM_BAKU[code] || labelOfCode(code)), in_product: !!m, volume_text: m?.volume_text ?? null, apparatus: m?.apparatus ?? null, rpm_text: m?.rpm_text ?? null, method: m?.method ?? null };
  });
  const first = data.mediums[0];
  for (const m of mediums) if (!m.in_product && first) { m.volume_text = first.volume_text; m.apparatus = first.apparatus; m.rpm_text = first.rpm_text; m.method = first.method; m.inherited = true; }
  const refIds = new Set(data.comparisons.map((c) => c.ref_run_id));
  const comps = new Map();
  for (const r of data.runs) if (refIds.has(r.run_id) || r.role === 'reference') { const e = comps.get(r.batch_no) || comps.set(r.batch_no, { lot: r.batch_no, name: shortBrand(r.brand_name), used: 0 }).get(r.batch_no); e.used += data.comparisons.filter((c) => c.ref_run_id === r.run_id).length; }
  const tests = new Map();
  for (const r of data.runs) if (!comps.has(r.batch_no)) tests.set(r.brand_name, (tests.get(r.brand_name) || 0) + 1);
  const brand = [...tests.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || productLabel(data.compile);
  return { product: { id, name: productLabel(data.compile), api: data.compile.api, api_uncertain: !!data.compile.api_uncertain }, mediums, comparators: [...comps.values()].sort((a, b) => b.used - a.used), test_brand: brand, batches: [...new Set(data.runs.map((r) => r.batch_no))] };
}

// ---------- validasi isian run ----------
function readRun(body) {
  const err = [];
  const code = body.medium;
  if (!MEDIUM_CODES.includes(code)) err.push('medium: kode medium tidak dikenal');
  const batch = typeof body.batch === 'string' ? body.batch.trim() : '';
  if (!batch || batch.length > 100) err.push('batch: wajib (maks 100 karakter)');
  const variant = typeof body.variant === 'string' ? body.variant.trim() : '';
  if (variant.length > 100) err.push('varian: maks 100 karakter');
  let date = null;
  if (body.test_date) { if (typeof body.test_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.test_date)) date = body.test_date; else err.push('tanggal uji: format YYYY-MM-DD'); }
  const tp = Array.isArray(body.timepoints) ? body.timepoints : [];
  if (!tp.length || tp.length > 9 || tp.some((t) => !fin(t) || t <= 0)) err.push('titik waktu: 1 sampai 9 menit, semuanya lebih dari 0');
  if (new Set(tp).size !== tp.length) err.push('titik waktu: menit ganda');
  const vs = Array.isArray(body.vessels) ? body.vessels : [];
  const values = [];
  if (!vs.length || vs.length > 12) err.push('vessel: 1 sampai 12 vessel');
  vs.forEach((v, j) => {
    if (!Number.isInteger(v?.no) || v.no < 1 || v.no > 12) { err.push(`vessel[${j}].no: 1 sampai 12`); return; }
    if (!Array.isArray(v.values) || v.values.length !== tp.length) { err.push(`vessel ${v.no}: jumlah nilai harus sama dengan jumlah titik waktu`); return; }
    if (v.values.some((x) => x !== null && !fin(x))) { err.push(`vessel ${v.no}: nilai harus angka`); return; }
    if (v.values.some((x) => x !== null)) values.push({ no: v.no, values: v.values });
  });
  if (!values.length && !err.length) err.push('vessel: minimal satu vessel terisi');
  if (new Set(values.map((v) => v.no)).size !== values.length) err.push('vessel: nomor ganda');
  if (err.length) throw new HttpError(400, 'Masukan tidak valid', { details: err.slice(0, 20) });
  // urut menurut menit; nilai ikut
  const order = tp.map((t, i) => [t, i]).sort((a, b) => a[0] - b[0]);
  return { code, batch, variant, date, minutes: order.map((o) => o[0]), values: values.map((v) => ({ no: v.no, values: order.map((o) => v.values[o[1]]) })) };
}

const vesselMap = (values) => Object.fromEntries(values.map((v) => [v.no, v.values]));
const CODE_LABEL = { very_rapid: 'sangat cepat', similar: 'Similar', not_similar: 'Not Similar', na: 'belum dapat dihitung' };

async function context(query, id, body) {
  const data = await loadCompileData(query, id);
  if (!data) throw new HttpError(404, 'Produk tidak ditemukan');
  const run = readRun(body);
  const refIds = new Set(data.comparisons.map((c) => c.ref_run_id));
  const compBatches = new Set(data.runs.filter((r) => refIds.has(r.run_id) || r.role === 'reference').map((r) => r.batch_no));
  if (compBatches.has(run.batch)) throw new HttpError(400, 'Masukan tidak valid', { details: ['batch: nomor batch ini sudah dipakai sebagai pembanding'] });
  const medium = data.mediums.find((m) => m.code === run.code) || null;
  let ref = null;
  if (typeof body.comparator === 'string' && body.comparator) {
    const cands = data.runs.filter((r) => r.batch_no === body.comparator && r.is_valid && data.mediums.find((m) => m.medium_id === r.medium_id)?.code === run.code && compBatches.has(r.batch_no));
    cands.sort((a, b) => (b.test_date || '').localeCompare(a.test_date || '') || b.run_id - a.run_id);
    ref = cands[0] || null;
    if (!ref && !compBatches.has(body.comparator)) throw new HttpError(400, 'Masukan tidak valid', { details: ['pembanding: batch bukan pembanding produk ini'] });
  }
  return { data, run, medium, ref };
}

function analyse({ data, run, ref }) {
  const tp = runProfile(step4, run.minutes, vesselMap(run.values));
  if (tp.error) throw new HttpError(400, 'Masukan tidak valid', { details: [tp.error] });
  const out = { times: run.minutes, stats: { avg: tp.means, min: tp.stats.map((s) => s.min), max: tp.stats.map((s) => s.max), rsd: tp.stats.map((s) => s.rsd) }, n_vessels: run.values.length, f2: null, _tp: tp };
  if (ref) {
    const rp = runProfile(step4, ref.minutes, ref.vessels);
    const TM = [0, ...[...new Set([...run.minutes, ...ref.minutes])].sort((a, b) => a - b)];
    const A = alignedAvg(rp, TM), B = alignedAvg(tp, TM);
    const t = f2Tim(A.avg.slice(1), B.avg.slice(1));
    const l4 = f2Between(step4, rp, tp);
    out.f2 = {
      sheet: { f2: fin(t.f2) ? t.f2 : null, kind: t.kind, n: t.n, minutes: t.idx.map((i) => TM[i + 1]), sumsq: fin(t.sumsq) ? t.sumsq : null, a: fin(t.a) ? t.a : null },
      langkah4: l4.error ? { f2: null, kind: 'na', n: 0, error: l4.error } : { f2: fin(l4.f2) ? l4.f2 : null, kind: { very_rapid: 'rap', similar: 'sim', not_similar: 'not', na: 'na' }[l4.outcome.code], code: l4.outcome.code, n: l4.n, minutes: l4.usedTimes, reason: l4.reason, rsd_exceeded: l4.rsdExceeded },
      ref: { lot: ref.batch_no, name: shortBrand(ref.brand_name), run_id: ref.run_id, avg: B && alignedAvg(rp, TM).avg, times: TM },
      test_avg: B.avg,
    };
    out._rp = rp; out._l4 = l4;
  }
  return out;
}

function checksOf(a, run, dup) {
  const checks = [];
  const bad = []; a.times.forEach((t, i) => { const r = a.stats.rsd[i]; if (fin(r) && r > rsdLimit(t)) bad.push({ t, r, lim: rsdLimit(t) }); });
  if (!bad.length) { const mx = a.stats.rsd.reduce((m, r, i) => (fin(r) && r > m.r ? { r, t: a.times[i] } : m), { r: -1, t: 0 }); checks.push({ level: 'ok', text: `RSD semua titik dalam batas (tertinggi ${fmt1(mx.r)}% pada ${mx.t} menit, batas ${rsdLimit(mx.t)}%).` }); }
  else checks.push({ level: 'warn', text: `RSD di atas batas: ${bad.map((b) => `${fmt1(b.r)}% pada ${b.t} menit (batas ${b.lim}%)`).join('; ')}.` });
  if (dup.status === 'baru') checks.push({ level: 'ok', text: 'Identitas run belum ada di database, jadi bukan duplikat.' });
  else if (dup.status === 'sama_persis') checks.push({ level: 'warn', text: 'Run yang sama persis (identitas dan semua nilai) sudah ada di database. Menyimpan tidak menambah data.' });
  else if (dup.status === 'terhapus') checks.push({ level: 'warn', text: 'Run yang sama persis pernah dihapus; menyimpan akan memulihkannya.' });
  else checks.push({ level: 'warn', text: 'Identitas run sudah ada di database dengan nilai yang berbeda. Pilih: timpa, simpan sebagai run ulang, atau batal.' });
  checks.push({ level: 'info', text: `${a.n_vessels} dari 12 vessel terisi. Rata-rata dihitung dari vessel yang terisi.` });
  return checks;
}

function packageOf(ctx, a, brand) {
  const { run, medium } = ctx;
  return {
    compile_id: ctx.data.compile.compile_id,
    mediums: [{ code: run.code, full_name: medium ? medium.full_name : (MEDIUM_BAKU[run.code] || labelOfCode(run.code)), volume_text: medium?.volume_text ?? ctx.data.mediums[0]?.volume_text ?? null, apparatus: medium?.apparatus ?? ctx.data.mediums[0]?.apparatus ?? null, rpm_text: medium?.rpm_text ?? ctx.data.mediums[0]?.rpm_text ?? null, method: medium?.method ?? ctx.data.mediums[0]?.method ?? null, method_ref: medium?.method_ref ?? null }],
    runs: [{ key: 'f6', medium_code: run.code, brand_name: brand, batch_no: run.batch, role: 'uji', variant: run.variant, test_date: run.date, manufacturer_site: null, note: null, is_valid: true, invalid_reason: null, timepoints: run.minutes, values: run.values }],
    comparisons: [],
  };
}
async function brandFor(query, id) { return (await productInfo(query, id)).test_brand; }

export async function previewRun(query, id, body) {
  const ctx = await context(query, id, body);
  const a = analyse(ctx);
  const pkg = validatePackage(packageOf(ctx, a, await brandFor(query, id)), { kind: 'studio' });
  const cls = (await classifyRuns({ query }, id, pkg))[0];
  const { _tp, _rp, _l4, ...pub } = a;
  return { ...pub, duplicate: { status: cls.status, existing_run_ids: cls.existing_run_ids }, comparator: ctx.ref ? { lot: ctx.ref.batch_no, name: shortBrand(ctx.ref.brand_name) } : null, checks: checksOf(a, ctx.run, cls), warnings: qualityWarnings(pkg).filter((w) => w.code !== 'W-tanpa-reference') };
}

// db = klien dalam transaksi
export async function saveRun(db, query, id, body, { analystName, requestId, ipHash }) {
  if (typeof body.push_id !== 'string' || !UUID.test(body.push_id)) throw new HttpError(400, 'push_id (UUID) wajib');
  if (!analystName) throw new HttpError(400, 'Nama analis wajib diisi sebelum menulis data');
  const ctx = await context(query, id, body);
  const a = analyse(ctx);
  const pkg = validatePackage(packageOf(ctx, a, await brandFor(query, id)), { kind: 'studio' });
  const decision = ['timpa', 'ulang', 'batal'].includes(body.decision) ? body.decision : null;
  const decisions = decision ? { f6: decision } : {};
  const aid = await ensureAnalyst(db, analystName);
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [body.push_id]);
  const prev = (await db.query('SELECT outcome, payload_sha256 FROM studio_push WHERE push_id=$1', [body.push_id])).rows[0];
  if (prev) {
    if (prev.payload_sha256 !== createHash('sha256').update(JSON.stringify(pkg)).digest('hex')) throw new HttpError(409, 'push_id ini sudah dipakai untuk isi yang berbeda; mulai kirim baru');
    const r = JSON.parse(prev.outcome); return { replay: true, ...summary(r, a) };
  }
  const { result } = await commitPackage(db, { pkg, kind: 'studio', analystId: aid, pushId: body.push_id, decisions, requestId, ipHash });
  const row = result.runs[0];
  if (row.run_id && ['baru', 'ditimpa', 'run_ulang'].includes(row.status) && ctx.ref && a._l4 && !a._l4.error && Number.isFinite(a._l4.f2)) {
    const f = a._l4, out = f.usedRef.map((x, i) => (x - f.usedTest[i]) ** 2);
    const mid = Number((await db.query('SELECT medium_id FROM medium WHERE compile_id=$1 AND code=$2 ORDER BY medium_id LIMIT 1', [id, ctx.run.code])).rows[0].medium_id);
    const ins = await db.query("INSERT INTO comparison(medium_id,test_run_id,ref_run_id,total_sq,n_points,f2,conclusion_code,conclusion_printed,conclusion_is_printed,f2_source) VALUES ($1,$2,$3,$4::numeric,$5,$6::numeric,$7,$8,false,'studio') ON CONFLICT (test_run_id,ref_run_id) DO NOTHING RETURNING comparison_id", [mid, row.run_id, ctx.ref.run_id, String(out.reduce((s, x) => s + x, 0)), f.n, String(f.f2), a.f2.langkah4.code, a._l4.outcome.statusText]);
    if (ins.rowCount) for (const [i, x] of out.entries()) await db.query('INSERT INTO comparison_point(comparison_id,seq,sq_diff) VALUES ($1,$2,$3::numeric)', [ins.rows[0].comparison_id, i + 1, String(x)]);
  }
  return { replay: false, ...summary(result, a) };
}
function summary(result, a) {
  const row = result.runs[0];
  return { run_id: row.run_id, status: row.status, counts: result.counts, f2_sheet: a.f2?.sheet?.f2 ?? null, kind_sheet: a.f2?.sheet?.kind ?? null, f2_langkah4: a.f2?.langkah4?.f2 ?? null, kind_langkah4: a.f2?.langkah4?.kind ?? null, comparator: a.f2?.ref ? { lot: a.f2.ref.lot, name: a.f2.ref.name } : null };
}
