#!/usr/bin/env node
// F23: ganti nama SATU analis (analyst.name). Dijalankan INDRA di produksi.
//   node scripts/rename_analyst.mjs --id 3 --name "Nama baru" --reason "..."            (DRY-RUN bawaan: tampilkan nama lama -> baru dan jumlah jejak terkait)
//   node scripts/rename_analyst.mjs --id 3 --name "Nama baru" --reason "..." --apply    (ubah + audit 'analyst_rename' dalam satu transaksi)
//   --url  URL PostgreSQL PEMILIK (udt_app tidak boleh mengubah analyst.name); bawaan env DATABASE_URL_UNPOOLED. Tidak pernah dicetak.
// Menolak: analis tidak ada, analis sistem, nama sudah dipakai analis lain (tidak menggabungkan), nama tidak valid. Jejak audit lama tetap menunjuk analyst_id yang sama.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { validateAnalystName } from '../server/accounts.js';
import { cleanText } from '../server/ingest.js';

export class RenameError extends Error {}

export async function renameAnalyst({ url, id, name, reason, apply }) {
  const aid = Number(id);
  if (!Number.isSafeInteger(aid) || aid < 1) throw new RenameError('--id wajib (analyst_id, bilangan bulat positif)');
  const why = typeof reason === 'string' ? reason.replace(/\s+/g, ' ').trim() : '';
  if ([...why].length < 5) throw new RenameError('--reason wajib (minimal 5 karakter): alasan dicatat di audit');
  let nm; try { nm = validateAnalystName(name); } catch (e) { throw new RenameError(`--name tidak valid: ${(e.extra?.details || [e.message]).join('; ')}`); }
  if (cleanText(nm) === null) throw new RenameError('--name tidak valid: memuat karakter tak terlihat atau kendali');
  const c = new pg.Client({ connectionString: url }); await c.connect();
  try {
    await c.query(apply ? 'BEGIN' : 'BEGIN READ ONLY');
    const a = (await c.query('SELECT a.analyst_id, a.name, u.user_id, u.is_system FROM analyst a LEFT JOIN app_user u ON u.analyst_id=a.analyst_id WHERE a.analyst_id=$1' + (apply ? ' FOR UPDATE OF a' : ''), [aid])).rows[0];
    if (!a) throw new RenameError(`analis ${aid} tidak ada`);
    if (a.is_system) throw new RenameError('ditolak: analis sistem tidak boleh diganti namanya');
    if (a.name === nm) throw new RenameError('nama baru sama dengan nama sekarang; tidak ada yang diubah');
    const dup = (await c.query('SELECT analyst_id FROM analyst WHERE name=$1 AND analyst_id<>$2', [nm, aid])).rows[0];
    if (dup) throw new RenameError(`ditolak: nama "${nm}" sudah dipakai analis ${dup.analyst_id} (tidak digabung otomatis)`);
    const ref = {};
    for (const [t, col] of [['audit_event', 'analyst_id'], ['run', 'created_by'], ['studio_push', 'analyst_id'], ['import_run', 'analyst_id'], ['run_removal', 'analyst_id'], ['compile', 'created_by']]) ref[t] = Number((await c.query(`SELECT count(*) AS n FROM ${t} WHERE ${col}=$1`, [aid])).rows[0].n);
    const out = { analyst_id: aid, nama_lama: a.name, nama_baru: nm, terkait_akun: a.user_id ? `ya (user_id ${a.user_id}; display_name akun TIDAK ikut berubah)` : 'tidak', baris_terkait: ref, mode: apply ? 'APPLY' : 'DRY-RUN' };
    if (!apply) { await c.query('ROLLBACK'); return out; }
    await c.query('UPDATE analyst SET name=$2 WHERE analyst_id=$1', [aid, nm]);
    const sys = (await c.query('SELECT analyst_id FROM app_user WHERE is_system LIMIT 1')).rows[0];
    const actor = sys ? Number(sys.analyst_id) : aid;
    const ev = await c.query("INSERT INTO audit_event(analyst_id,action,entity_type,entity_id,reason) VALUES ($1,'analyst_rename','analyst',$2,$3) RETURNING event_id", [actor, aid, why]);
    await c.query('INSERT INTO audit_change(event_id,field_name,old_value,new_value) VALUES ($1,$2,$3,$4)', [ev.rows[0].event_id, 'name', a.name, nm]);
    await c.query('COMMIT');
    return { ...out, audit_event_id: Number(ev.rows[0].event_id) };
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { await c.end(); }
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') o.apply = true;
    else if (['--id', '--name', '--reason', '--url'].includes(a)) o[a.slice(2)] = argv[++i];
    else throw new RenameError(`argumen tak dikenal: ${a}`);
  }
  return o;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const o = parseArgs(process.argv.slice(2));
    o.url ||= process.env.DATABASE_URL_UNPOOLED;
    if (!o.url) throw new RenameError('--url atau env DATABASE_URL_UNPOOLED (URL pemilik) wajib');
    const r = await renameAnalyst(o);
    console.log(JSON.stringify(r, null, 1));
    if (r.mode === 'DRY-RUN') console.log('DRY-RUN: tidak ada yang diubah. Tambahkan --apply untuk menerapkan.');
  } catch (e) { console.error('GALAT: ' + (e instanceof RenameError ? e.message : `${e.message}`.replace(/postgres(ql)?:\/\/\S+/g, '[url]'))); process.exit(1); }
}
