// Cadangan harian PostgreSQL (pg_dump format custom). INDRA yang menjadwalkan (mis. cron/Task Scheduler 02:00); skrip ini hanya membuat, memverifikasi, dan memangkas.
// Pemakaian:
//   DATABASE_URL_UNPOOLED=postgres://... node scripts/backup_pg.mjs --out /jalur/cadangan [--keep 14]
//   node scripts/backup_pg.mjs --out ./cadangan --docker udt-f4-pg --user udt_owner --db udt_dev      (pg_dump di dalam wadah Docker; untuk laptop/uji)
// Keluaran: udt-YYYYMMDDTHHMMSSZ.dump + .sha256 + (stdout) satu baris JSON; kode keluar != 0 bila gagal atau verifikasi gagal (agar penjadwal tahu).
// Kata sandi tidak dicetak. Cadangan berisi data: simpan di luar repo dan batasi aksesnya.
import { spawn } from 'node:child_process';
import { createWriteStream, createReadStream, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const stamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const sha256File = async (p) => { const h = createHash('sha256'); await pipeline(createReadStream(p), h); return h.digest('hex'); };

function cmdFor(o) {
  if (o.docker) return { bin: 'docker', dump: ['exec', '-i', o.docker, 'pg_dump', '-U', o.user, '-d', o.db, '-Fc', '--no-owner'], list: ['exec', '-i', o.docker, 'pg_restore', '--list'], env: process.env };
  const url = o.url || process.env.DATABASE_URL_UNPOOLED;
  if (!url) throw new Error('DATABASE_URL_UNPOOLED (atau --docker) wajib');
  return { bin: process.env.PG_DUMP || 'pg_dump', dump: ['-Fc', '--no-owner', '-d', url], list: null, env: process.env, listBin: process.env.PG_RESTORE || 'pg_restore' };
}
const run = (bin, args, { stdin, out, env }) => new Promise((ok, fail) => {
  const p = spawn(bin, args, { stdio: [stdin ? 'pipe' : 'ignore', out ? 'pipe' : 'pipe', 'pipe'], env });
  let err = ''; let buf = '';
  p.stderr.on('data', (d) => { err += d; });
  if (out) pipeline(p.stdout, out).catch(fail); else p.stdout.on('data', (d) => { buf += d; });
  if (stdin) pipeline(createReadStream(stdin), p.stdin).catch(() => {});
  p.on('error', fail);
  p.on('close', (code) => (code === 0 ? ok(buf) : fail(new Error(`${bin} keluar ${code}: ${err.trim().split('\n').slice(-2).join(' | ').replace(/postgres(ql)?:\/\/[^\s]+/g, '[url]')}`))));
});

export async function runBackup(o) {
  const dir = o.out; if (!dir) throw new Error('--out wajib');
  mkdirSync(dir, { recursive: true });
  const c = cmdFor(o), name = `udt-${stamp()}.dump`, file = join(dir, name), tmp = file + '.part';
  await run(c.bin, c.dump, { out: createWriteStream(tmp), env: c.env });
  const size = statSync(tmp).size;
  if (size < 1024) { unlinkSync(tmp); throw new Error('cadangan terlalu kecil; dianggap gagal'); }
  // verifikasi: daftar isi harus memuat tabel inti
  const listing = c.list ? await run(c.bin, c.list, { stdin: tmp, env: c.env }) : await run(c.listBin, ['--list', tmp], { env: c.env });
  for (const t of ['TABLE DATA public run ', 'TABLE DATA public run_value', 'TABLE DATA public audit_event', 'TABLE DATA public compile ']) if (!listing.includes(t)) { unlinkSync(tmp); throw new Error(`verifikasi gagal: ${t.trim()} tidak ada di cadangan`); }
  const { renameSync } = await import('node:fs'); renameSync(tmp, file);
  const sha = await sha256File(file); writeFileSync(file + '.sha256', `${sha}  ${name}\n`);
  // pemangkasan: hapus yang lebih tua dari --keep hari (berdasarkan stempel pada nama berkas)
  const keep = Number(o.keep ?? 14), cutoff = Date.now() - keep * 86400000, removed = [];
  for (const f of readdirSync(dir)) {
    const m = /^udt-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.dump(\.sha256)?$/.exec(f); if (!m) continue;
    if (Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) < cutoff) { unlinkSync(join(dir, f)); removed.push(f); }
  }
  return { ok: true, file, bytes: size, sha256: sha, tables_verified: true, removed };
}

if (process.argv[1]?.endsWith('backup_pg.mjs')) {
  const a = process.argv.slice(2), g = (k) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : undefined; };
  runBackup({ out: g('out'), keep: g('keep'), docker: g('docker'), user: g('user') || 'postgres', db: g('db') || 'postgres', url: g('url') })
    .then((r) => console.log(JSON.stringify(r)), (e) => { console.error(JSON.stringify({ ok: false, error: e.message })); process.exit(1); });
}
