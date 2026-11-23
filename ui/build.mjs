// Bangun pulau React tab 6 -> compiler/island.js + compiler/island.css (tanpa CDN; hasil berulang identik).
// Pakai: npm run build:ui   (cek ukuran: node ui/build.mjs --size)
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
await build({
  entryPoints: [join(root, 'ui/src/main.jsx')], outfile: join(root, 'compiler/island.js'), bundle: true, minify: true, format: 'iife',
  target: ['chrome110', 'firefox110', 'safari16'], jsx: 'automatic', legalComments: 'none', charset: 'utf8',
  define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning',
});
execFileSync(process.execPath, [join(root, 'node_modules/@tailwindcss/cli/dist/index.mjs'), '-i', join(root, 'ui/src/styles.css'), '-o', join(root, 'compiler/island.css'), '--minify'], { cwd: root, stdio: 'pipe' });
const sz = (f) => { const b = readFileSync(join(root, f)); return { raw: b.length, gzip: gzipSync(b, { level: 9 }).length }; };
const r = { js: sz('compiler/island.js'), css: sz('compiler/island.css') };
r.total_gzip_kb = +((r.js.gzip + r.css.gzip) / 1024).toFixed(1);
console.log(JSON.stringify(r));
if (r.js.gzip + r.css.gzip > 400 * 1024) { console.error('Bundel > 400 KB terkompres: mundur ke Opsi A (F1 Bagian C)'); process.exit(2); }
