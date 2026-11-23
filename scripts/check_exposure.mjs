// F8 S-1 + F10: pemeriksa paparan. Memakai daftar berkas terlacak git; berkas non-publik DAN berkas gated (aplikasi) TIDAK boleh tersaji tanpa sesi.
// Pemakaian: node scripts/check_exposure.mjs --dir public            (isi folder keluaran Vercel)
//            node scripts/check_exposure.mjs --url http://host:port   (server hidup: Node, atau staging Vercel)
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_PATTERNS } from './public_manifest.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const isPublic = (p) => PUBLIC_PATTERNS.some((re) => re.test(p));
const tracked = execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const walk = (d) => readdirSync(d).flatMap((n) => { const f = join(d, n); return statSync(f).isDirectory() ? walk(f) : [f]; });

export async function check({ dir, url }) {
  const nonPublic = tracked.filter((f) => !isPublic(f)), served = [];
  if (dir) {
    const have = new Set(walk(dir).map((f) => relative(dir, f).split(sep).join('/')));
    for (const f of have) if (!isPublic(f)) served.push(f);
    return { mode: 'dir', tracked: tracked.length, nonPublicTracked: nonPublic.length, publicFiles: have.size, servedNonPublic: served };
  }
  let publicOk = 0;
  for (const f of tracked) {
    const r = await fetch(url + '/' + f.split('/').map(encodeURIComponent).join('/'), { redirect: 'manual' });
    const body = Buffer.from(await r.arrayBuffer());
    // F10: 200 dengan isi lain (mis. halaman masuk milik server) BUKAN paparan; hanya isi berkas aslinya yang dihitung tersaji.
    if (r.status === 200 && body.equals(readFileSync(join(root, f)))) { if (isPublic(f)) publicOk++; else served.push(f); }
  }
  return { mode: 'url', tracked: tracked.length, nonPublicTracked: nonPublic.length, publicServed: publicOk, servedNonPublic: served };
}
if (process.argv[1]?.endsWith('check_exposure.mjs')) {
  const a = process.argv.slice(2), i = (k) => a.indexOf(k);
  const r = await check({ dir: i('--dir') >= 0 ? a[i('--dir') + 1] : null, url: i('--url') >= 0 ? a[i('--url') + 1] : null });
  console.log(JSON.stringify(r, null, 1));
  console.log(r.servedNonPublic.length === 0 ? 'HASIL: 0 berkas non-publik tersaji' : `HASIL: GAGAL, ${r.servedNonPublic.length} berkas non-publik tersaji`);
  process.exit(r.servedNonPublic.length ? 1 : 0);
}
