// Sprint 3 (F4c): ubah status/catatan/varian, hapus + pulihkan, jejak perubahan dengan nilai lama (REQ-003, 045, 046, 067).
// Semua penulisan hanya menambah baris (audit_*, run_removal) atau mengubah 4 kolom run yang diizinkan hak akses.
import { HttpError, ensureAnalyst } from './ingest.js';
import { brandOf } from './compileData.js';

const MAX_NOTE = 4000, MAX_VARIANT = 500;

async function audit(db, { analystId, action, runId, reason, requestId, ipHash, changes }) {
  const e = await db.query('INSERT INTO audit_event(analyst_id,action,entity_type,entity_id,reason,request_id,ip_hash) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING event_id', [analystId, action, 'run', runId, reason ?? null, requestId ?? null, ipHash ?? null]);
  for (const [f, o, n] of changes) await db.query('INSERT INTO audit_change(event_id,field_name,old_value,new_value) VALUES ($1,$2,$3,$4)', [e.rows[0].event_id, f, o ?? null, n ?? null]);
}
const lastRemoval = async (db, id) => (await db.query('SELECT kind, seq FROM run_removal WHERE run_id=$1 ORDER BY seq DESC LIMIT 1', [id])).rows[0] || null;
const lockRun = async (db, id) => {
  await db.query('SELECT pg_advisory_xact_lock($1::bigint)', [id]);   // serialisasi hapus/pulihkan/ubah pada run yang sama
  const r = (await db.query('SELECT run_id, is_valid, invalid_reason, note, variant FROM run WHERE run_id=$1', [id])).rows[0];
  if (!r) throw new HttpError(404, 'Run tidak ditemukan');
  return r;
};

export async function patchRun(db, { id, body, analystName, requestId, ipHash }) {
  const allowed = ['is_valid', 'invalid_reason', 'note', 'variant'];
  const keys = Object.keys(body || {}).filter((k) => allowed.includes(k));
  const unknown = Object.keys(body || {}).filter((k) => !allowed.includes(k));
  if (unknown.length) throw new HttpError(400, 'Masukan tidak valid', { details: unknown.map((k) => `${k}: tidak boleh diubah`) });
  if (!keys.length) throw new HttpError(400, 'Tidak ada perubahan');
  const aid = await ensureAnalyst(db, analystName);
  const cur = await lockRun(db, id);
  const lr = await lastRemoval(db, id);
  if (lr && lr.kind !== 'pulihkan') throw new HttpError(409, 'Run sudah dihapus atau ditimpa; pulihkan dulu sebelum mengubah');
  const next = { is_valid: cur.is_valid, invalid_reason: cur.invalid_reason, note: cur.note, variant: cur.variant };
  const err = [];
  if ('is_valid' in body) { if (typeof body.is_valid !== 'boolean') err.push('is_valid: harus true atau false'); else next.is_valid = body.is_valid; }
  if ('invalid_reason' in body) { if (body.invalid_reason !== null && typeof body.invalid_reason !== 'string') err.push('invalid_reason: harus teks'); else next.invalid_reason = body.invalid_reason?.trim() || null; }
  if ('note' in body) { if (body.note !== null && typeof body.note !== 'string') err.push('note: harus teks'); else next.note = body.note?.trim() || null; }
  if ('variant' in body) { if (typeof body.variant !== 'string') err.push('variant: harus teks'); else next.variant = body.variant.trim(); }
  if ((next.note || '').length > MAX_NOTE || (next.invalid_reason || '').length > MAX_NOTE) err.push('teks terlalu panjang');
  if (next.variant.length > MAX_VARIANT) err.push('variant: terlalu panjang');
  if (next.is_valid) { if (!('invalid_reason' in body)) next.invalid_reason = null; }   // kembali Valid: alasan lama tersimpan di jejak
  else if (!(next.invalid_reason || '').trim()) err.push('Status Tidak valid wajib beralasan');
  if (err.length) throw new HttpError(400, 'Masukan tidak valid', { details: err });
  const changes = [];
  for (const f of allowed) if (String(cur[f] ?? '') !== String(next[f] ?? '')) changes.push([f, cur[f] === null ? null : String(cur[f]), next[f] === null ? null : String(next[f])]);
  if (!changes.length) return { run_id: id, changed: [], unchanged: true };
  await db.query('UPDATE run SET is_valid=$2, invalid_reason=$3, note=$4, variant=$5 WHERE run_id=$1', [id, next.is_valid, next.invalid_reason, next.note, next.variant]);
  await audit(db, { analystId: aid, action: 'run_update', runId: id, reason: next.is_valid ? null : next.invalid_reason, requestId, ipHash, changes });
  return { run_id: id, changed: changes.map((c) => c[0]), unchanged: false };
}

export async function removeRun(db, { id, body, analystName, requestId, ipHash }) {
  if (body?.confirm !== true) throw new HttpError(400, 'Konfirmasi hapus wajib (confirm: true)');
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!reason || reason.length > MAX_NOTE) throw new HttpError(400, 'Alasan hapus wajib');
  const aid = await ensureAnalyst(db, analystName);
  await lockRun(db, id);
  const lr = await lastRemoval(db, id);
  if (lr && lr.kind !== 'pulihkan') throw new HttpError(409, 'Run sudah tidak terlihat');
  await db.query("INSERT INTO run_removal(run_id,seq,kind,analyst_id,reason) VALUES ($1,$2,'hapus',$3,$4)", [id, (lr?.seq ?? 0) + 1, aid, reason]);
  await audit(db, { analystId: aid, action: 'run_delete', runId: id, reason, requestId, ipHash, changes: [['visible', 'true', 'false']] });
  return { run_id: id, removed: true };
}

export async function restoreRun(db, { id, body, analystName, requestId, ipHash }) {
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (!reason || reason.length > MAX_NOTE) throw new HttpError(400, 'Alasan pulihkan wajib');
  const aid = await ensureAnalyst(db, analystName);
  await lockRun(db, id);
  const lr = await lastRemoval(db, id);
  if (!lr || lr.kind === 'pulihkan') throw new HttpError(409, 'Run tidak sedang dihapus');
  if (lr.kind === 'ditimpa') throw new HttpError(409, 'Run ditimpa oleh run lain; tidak dapat dipulihkan dari sini');
  await db.query("INSERT INTO run_removal(run_id,seq,kind,analyst_id,reason) VALUES ($1,$2,'pulihkan',$3,$4)", [id, lr.seq + 1, aid, reason]);
  await audit(db, { analystId: aid, action: 'run_restore', runId: id, reason, requestId, ipHash, changes: [['visible', 'false', 'true']] });
  return { run_id: id, restored: true };
}

export async function runAudit(q, id) {
  if (!(await q('SELECT 1 FROM run WHERE run_id=$1', [id])).rowCount) throw new HttpError(404, 'Run tidak ditemukan');
  const ev = await q(`SELECT e.event_id, e.at_utc, a.name AS analyst, e.action, e.reason,
      (SELECT json_agg(json_build_object('field',c.field_name,'old',c.old_value,'new',c.new_value) ORDER BY c.field_name) FROM audit_change c WHERE c.event_id=e.event_id) AS changes
    FROM audit_event e JOIN analyst a ON a.analyst_id=e.analyst_id WHERE e.entity_type='run' AND e.entity_id=$1 ORDER BY e.event_id`, [id]);
  return ev.rows.map((x) => ({ ...x, event_id: Number(x.event_id), changes: x.changes || [] }));
}

export async function removedRuns(q, compileId) {
  const r = await q(`SELECT r.run_id, (SELECT x.product_printed FROM run_source_block x WHERE x.run_id=r.run_id AND x.product_printed IS NOT NULL ORDER BY x.source_block_id LIMIT 1) AS printed, b.brand_name, b.batch_no, r.variant, m.code AS medium_code, rm.kind, rm.reason, a.name AS analyst, rm.at_utc
    FROM run r JOIN batch b ON b.batch_id=r.batch_id JOIN medium m ON m.medium_id=r.medium_id
    JOIN LATERAL (SELECT * FROM run_removal x WHERE x.run_id=r.run_id ORDER BY x.seq DESC LIMIT 1) rm ON true
    JOIN analyst a ON a.analyst_id=rm.analyst_id
    WHERE r.compile_id=$1 AND rm.kind IN ('hapus','ditimpa') ORDER BY r.run_id`, [compileId]);
  return r.rows.map(({ printed, ...x }) => ({ ...x, brand_name: brandOf(printed) || x.brand_name, run_id: Number(x.run_id), restorable: x.kind === 'hapus' }));
}
