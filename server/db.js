// Koneksi PostgreSQL standar (driver pg; tanpa fitur khas Neon/Vercel; REQ-066).
import pg from 'pg';
let pool = null;
export function setPool(p) { pool = p; }
export function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum diset');
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 10000 });
  }
  return pool;
}
export async function query(text, params) { return getPool().query(text, params); }
export async function tx(fn) {
  const c = await getPool().connect();
  try { await c.query('BEGIN'); const r = await fn(c); await c.query('COMMIT'); return r; }
  catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
  finally { c.release(); }
}
