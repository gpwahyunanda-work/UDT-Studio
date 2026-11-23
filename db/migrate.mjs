// Pelari migrasi: berkas SQL berversi, sha256 dicatat; migrasi terpasang tidak boleh berubah (DS-13).
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export function listMigrations(dir = DIR) {
  return readdirSync(dir).filter(f => /^\d{4}_.+\.sql$/.test(f)).sort().map(f => {
    const sql = readFileSync(join(dir, f), 'utf8');
    return { version: parseInt(f.slice(0, 4), 10), name: f, sql, sha256: createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex')   // CRLF/LF tidak boleh mengubah sidik jari };
  });
}

export async function migrate(connectionString, dir = DIR) {
  const c = new pg.Client({ connectionString });
  await c.connect();
  const applied = [], skipped = [];
  try {
    await c.query("SET lock_timeout = '5s'");
    const has = (await c.query("SELECT to_regclass('public.schema_migration') AS t")).rows[0].t;
    const done = new Map();
    if (has) for (const r of (await c.query('SELECT version, sha256 FROM schema_migration')).rows) done.set(r.version, r.sha256);
    for (const m of listMigrations(dir)) {
      if (done.has(m.version)) {
        if (done.get(m.version) !== m.sha256) throw new Error(`Migrasi ${m.name} sudah terpasang tetapi isinya berubah (sha256 beda). Buat migrasi baru.`);
        skipped.push(m.name); continue;
      }
      await c.query('BEGIN');
      try {
        await c.query(m.sql);
        await c.query('INSERT INTO schema_migration(version,name,sha256) VALUES ($1,$2,$3)', [m.version, m.name, m.sha256]);
        await c.query('COMMIT');
      } catch (e) { await c.query('ROLLBACK'); throw e; }
      applied.push(m.name);
    }
  } finally { await c.end(); }
  return { applied, skipped };
}

if (process.argv[1]?.endsWith('migrate.mjs')) {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL_UNPOOLED atau DATABASE_URL belum diset'); process.exit(2); }
  migrate(url).then(r => console.log(JSON.stringify(r)), e => { console.error(e.message); process.exit(1); });
}
