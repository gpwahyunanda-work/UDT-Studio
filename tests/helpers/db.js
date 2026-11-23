// Basis data uji: PostgreSQL biasa (bukan Neon). Satu database baru per berkas uji; peran udt_app tanpa hak pemilik.
// UDT_TEST_PG = URL superuser/pemilik ke database "postgres" (wadah Docker lokal udt-f4-pg, port 54339; kata sandi dari env UDT_TEST_PG_PASSWORD). JANGAN arahkan ke Neon produksi.
import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { migrate } from '../../db/migrate.mjs';
import { setPool } from '../../server/db.js';
import { hashPassword } from '../../server/auth.js';

export const ADMIN = process.env.UDT_TEST_PG || `postgres://udt_owner:${encodeURIComponent(process.env.UDT_TEST_PG_PASSWORD || 'ganti-lewat-env-UDT_TEST_PG')}@127.0.0.1:54339/postgres`;   // F8: tanpa kata sandi tertanam; set UDT_TEST_PG (URL penuh) atau UDT_TEST_PG_PASSWORD
export const APP_PW = 'apppw-uji-' + randomBytes(4).toString('hex');
export const TEST_PASSWORD = 'kata-sandi-uji-tim', READER_PASSWORD = 'kata-sandi-uji-baca';

export async function createTestDb(name = 't') {
  if (/neon\.tech|vercel/i.test(ADMIN)) throw new Error('UDT_TEST_PG tidak boleh menunjuk ke Neon/Vercel');
  const db = `udt_${name}_${randomBytes(4).toString('hex')}`;
  const admin = new pg.Client({ connectionString: ADMIN }); await admin.connect();
  await admin.query(`CREATE DATABASE ${db}`);
  const has = (await admin.query("SELECT 1 FROM pg_roles WHERE rolname='udt_app'")).rowCount;
  if (!has) await admin.query(`CREATE ROLE udt_app LOGIN PASSWORD '${APP_PW}'`); else await admin.query(`ALTER ROLE udt_app PASSWORD '${APP_PW}'`);
  const u = new URL(ADMIN);
  const owner = `${u.protocol}//${u.username}:${u.password}@${u.host}/${db}`;
  const app = `${u.protocol}//udt_app:${APP_PW}@${u.host}/${db}`;
  await migrate(owner);
  const ownerPool = new pg.Pool({ connectionString: owner, max: 2 });
  const appPool = new pg.Pool({ connectionString: app, max: 5 });
  setPool(appPool);
  process.env.SESSION_SECRET = 'uji-rahasia-sesi-panjang-minimal-32-karakter!!';
  process.env.UDT_WRITER_PASSWORD_HASH = hashPassword(TEST_PASSWORD);
  process.env.UDT_READER_PASSWORD_HASH = hashPassword(READER_PASSWORD);
  process.env.APP_ENV = 'test';
  return {
    owner: ownerPool, app: appPool, ownerUrl: owner, name: db,
    async drop() {
      await appPool.end(); await ownerPool.end();
      // Ponytail: wait for pg to drain; FORCE races a late pooled query and turns cleanup into an uncaught test error.
      for (let attempt = 0; attempt < 20; attempt += 1) {
        try { await admin.query(`DROP DATABASE IF EXISTS ${db}`); break; }
        catch (err) {
          if (err?.code !== '55006' || attempt === 19) throw err;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      }
      await admin.end();
    },
  };
}
