// IQ-14, IQ-15, IQ-16, IQ-18, IQ-26, IQ-37 (bagian database): skema, batasan, hak akses peran aplikasi. [LAPTOP: PostgreSQL 17 biasa]
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTestDb } from './helpers/db.js';
import { migrate, listMigrations } from '../db/migrate.mjs';

let t, A, O;
before(async () => { t = await createTestDb('db'); A = t.app; O = t.owner; });
after(async () => { await t.drop(); });

const rejects = async (p, code) => { try { await p; } catch (e) { if (code) assert.equal(e.code, code, e.message); return e; } assert.fail('seharusnya ditolak'); };

async function seed(prefix = 'a') {
  await A.query("INSERT INTO analyst(name) VALUES ('Penguji') ON CONFLICT (name) DO NOTHING");
  const an = (await A.query("SELECT analyst_id FROM analyst WHERE name='Penguji'")).rows[0].analyst_id;
  const c = (await A.query('INSERT INTO compile(product_name,strength,dosage_form,title,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING compile_id', [prefix + 'P', '10 mg', 'Tablet', 't', an])).rows[0].compile_id;
  const m = (await A.query("INSERT INTO medium(compile_id,code,full_name) VALUES ($1,'Release','R') RETURNING medium_id", [c])).rows[0].medium_id;
  const m2 = (await A.query("INSERT INTO medium(compile_id,code,full_name) VALUES ($1,'1,2','S') RETURNING medium_id", [c])).rows[0].medium_id;
  const b = (await A.query("INSERT INTO batch(compile_id,brand_name,batch_no,role) VALUES ($1,'X','B1','uji') RETURNING batch_id", [c])).rows[0].batch_id;
  const b2 = (await A.query("INSERT INTO batch(compile_id,brand_name,batch_no,role) VALUES ($1,'Ref','R1','reference') RETURNING batch_id", [c])).rows[0].batch_id;
  const imp = (await A.query("INSERT INTO import_run(source_name,analyst_id) VALUES ('x.xlsx',$1) RETURNING import_id", [an])).rows[0].import_id;
  const run = async (compile, batch, medium, hash, extra = {}) => (await A.query(
    `INSERT INTO run(compile_id,batch_id,medium_id,variant,content_hash,source,import_id,created_by,is_valid,invalid_reason) VALUES ($1,$2,$3,$4,$5,'sheet',$6,$7,$8,$9) RETURNING run_id`,
    [compile, batch, medium, extra.variant ?? '', hash, imp, an, extra.is_valid ?? true, extra.reason ?? null])).rows[0].run_id;
  return { an, c, m, m2, b, b2, imp, run };
}

test('IQ-26 migrasi: 21 tabel, urut, dapat diulang, sha256 migrasi terpasang tidak boleh berubah', async () => {
  const n = (await O.query("SELECT count(*) AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).rows[0].n;
  assert.equal(Number(n), 22);   // 21 + compile_alias (migrasi 0003)
  const again = await migrate(t.ownerUrl);
  assert.deepEqual(again.applied, []); assert.equal(again.skipped.length, listMigrations().length);
  const sm = (await O.query('SELECT version, sha256 FROM schema_migration ORDER BY version')).rows;
  assert.equal(sm.at(-1).version, 3); assert.equal(sm[0].sha256, listMigrations()[0].sha256);
  const dir = mkdtempSync(join(tmpdir(), 'mig-'));
  const src = new URL('../db/migrations/', import.meta.url);
  for (const f of readdirSync(src)) copyFileSync(new URL(f, src), join(dir, f));
  writeFileSync(join(dir, '0001_compile.sql'), readFileSync(join(dir, '0001_compile.sql'), 'utf8') + '\n-- diubah');
  await assert.rejects(migrate(t.ownerUrl, dir), /sudah terpasang tetapi isinya berubah/);
});

test('Delta B3: Batch unik per compile; peran dan penahanan tetap berada di SumberBlok', async () => {
  const s = await seed('v3');
  await rejects(A.query("INSERT INTO batch(compile_id,brand_name,batch_no,role) VALUES ($1,'Nama lain','B1','reference')", [s.c]), '23505');
  const r = await s.run(s.c, s.b, s.m, 'v3-hash'), ref = await s.run(s.c, s.b2, s.m, 'v3-ref');
  const cmp = (await A.query("INSERT INTO comparison(medium_id,test_run_id,ref_run_id,n_points,f2_source,conclusion_is_printed) VALUES ($1,$2,$3,3,'sheet',false) RETURNING comparison_id", [s.m, r, ref])).rows[0].comparison_id;
  await A.query("INSERT INTO run_source_block(run_id,import_id,tab_name,avg_row,product_printed,role_raw,comparison_id,import_outcome) VALUES ($1,$2,'pH 6,8',60,'Produk 10 mg (B1)','',$3,'diimpor'),($1,$2,'pH 6,8',83,'Produk 25 mg (B1)','',$3,'ditahan')", [r, s.imp, cmp]);
  const rows = (await A.query('SELECT product_printed, import_outcome FROM run_source_block WHERE run_id=$1 ORDER BY avg_row', [r])).rows;
  assert.deepEqual(rows.map(x => [x.product_printed, x.import_outcome]), [['Produk 10 mg (B1)', 'diimpor'], ['Produk 25 mg (B1)', 'ditahan']]);
});

test('IQ-16 kunci tamu gabungan: run lintas compile dan perbandingan lintas medium ditolak', async () => {
  const s1 = await seed('p'), s2 = await seed('q');
  await rejects(s1.run(s1.c, s2.b, s1.m, 'h1'), '23503');
  await rejects(s1.run(s1.c, s1.b, s2.m, 'h2'), '23503');
  const r1 = await s1.run(s1.c, s1.b, s1.m, 'h3'), r2 = await s1.run(s1.c, s1.b2, s1.m, 'h4'), r3 = await s1.run(s1.c, s1.b2, s1.m2, 'h5');
  await rejects(A.query("INSERT INTO comparison(medium_id,test_run_id,ref_run_id,n_points,f2_source) VALUES ($1,$2,$3,3,'sheet')", [s1.m, r1, r3]), '23503');
  await A.query("INSERT INTO comparison(medium_id,test_run_id,ref_run_id,n_points,f2_source) VALUES ($1,$2,$3,3,'sheet')", [s1.m, r1, r2]);
});

test('IQ-37/IQ-14 batasan data: Tidak valid wajib alasan; run sama ditolak; data Studio butuh kesimpulan', async () => {
  const s = await seed('c');
  await rejects(s.run(s.c, s.b, s.m, 'x1', { is_valid: false }), '23514');
  await s.run(s.c, s.b, s.m, 'x2', { is_valid: false, reason: 'Salah Wavelength' });
  await s.run(s.c, s.b, s.m, 'x3');
  await rejects(s.run(s.c, s.b, s.m, 'x3'), '23505');
  const r1 = await s.run(s.c, s.b, s.m, 'x4'), r2 = await s.run(s.c, s.b2, s.m, 'x5');
  await rejects(A.query("INSERT INTO comparison(medium_id,test_run_id,ref_run_id,n_points,f2_source) VALUES ($1,$2,$3,3,'studio')", [s.m, r1, r2]), '23514');
  await rejects(A.query("INSERT INTO run_value(run_id,vessel_no,seq,pct) VALUES ($1,1,1,'NaN'::numeric)", [r1]), '23514');
  await rejects(A.query("INSERT INTO run_value(run_id,vessel_no,seq,pct) VALUES ($1,1,1,'5')", [r1]), '23503');
  await rejects(A.query("INSERT INTO run_timepoint(run_id,seq,minute) VALUES ($1,1,0)", [r1]), '23514');
});

test('IQ-15 peran aplikasi: jejak, nilai, hash, run, skema tidak bisa diubah; catatan bisa', async () => {
  const s = await seed('d');
  const r = await s.run(s.c, s.b, s.m, 'y1');
  await A.query("INSERT INTO run_timepoint(run_id,seq,minute) VALUES ($1,1,5)", [r]);
  await A.query("INSERT INTO run_value(run_id,vessel_no,seq,pct) VALUES ($1,1,1,'12.5')", [r]);
  const ev = (await A.query("INSERT INTO audit_event(analyst_id,action,entity_type) VALUES ($1,'x','run') RETURNING event_id", [s.an])).rows[0].event_id;
  await A.query("INSERT INTO run_removal(run_id,seq,kind,analyst_id,reason) VALUES ($1,1,'hapus',$2,'uji')", [r, s.an]);
  for (const [sql, p] of [
    ['UPDATE audit_event SET action=$1 WHERE event_id=$2', ['z', ev]], ['DELETE FROM audit_event WHERE event_id=$1', [ev]],
    ['DELETE FROM run_removal WHERE run_id=$1', [r]], ['UPDATE run_removal SET reason=$1 WHERE run_id=$2', ['z', r]],
    ["UPDATE run_value SET pct='1' WHERE run_id=$1", [r]], ['DELETE FROM run_value WHERE run_id=$1', [r]],
    ["UPDATE run SET content_hash='z' WHERE run_id=$1", [r]], ['DELETE FROM run WHERE run_id=$1', [r]],
    ['DELETE FROM import_run WHERE import_id=$1', [s.imp]], ["UPDATE run SET test_date='2020-01-01' WHERE run_id=$1", [r]],
    ['CREATE TABLE bocor(x int)', []], ['ALTER TABLE run ADD COLUMN z int', []], ['DROP TABLE run CASCADE', []], ["INSERT INTO medium_code(code,label,sort_no) VALUES ('X','X',99)", []],
  ]) await rejects(A.query(sql, p), '42501');
  await A.query("UPDATE run SET note='catatan baru' WHERE run_id=$1", [r]);
  assert.equal((await A.query('SELECT count(*) n FROM run_visible WHERE run_id=$1', [r])).rows[0].n, '0');
  await A.query("INSERT INTO run_removal(run_id,seq,kind,analyst_id,reason) VALUES ($1,2,'pulihkan',$2,'salah hapus')", [r, s.an]);
  assert.equal((await A.query('SELECT count(*) n FROM run_visible WHERE run_id=$1', [r])).rows[0].n, '1');
  assert.equal((await A.query('SELECT pct FROM run_value WHERE run_id=$1', [r])).rows[0].pct, '12.5');
});
