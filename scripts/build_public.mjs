// Membangun public/ (outputDirectory Vercel: HANYA berkas publik) dan server/gated/ (berkas aplikasi yang disajikan fungsi setelah masuk; ikut bundel lewat server/**).
// Jalankan: node scripts/build_public.mjs [folder-public] [folder-gated]
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_FILES, PUBLIC_DIRS, GATED_FILES, GATED_DIRS } from './public_manifest.mjs';

const copy = (out, files, dirs, root) => {
  rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
  for (const f of files) cpSync(join(root, f), join(out, f));
  for (const d of dirs) if (existsSync(join(root, d))) cpSync(join(root, d), join(out, d), { recursive: true });
  return out;
};
export const buildPublic = (out, root = join(dirname(fileURLToPath(import.meta.url)), '..')) => copy(out, PUBLIC_FILES, PUBLIC_DIRS, root);
export const buildGated = (out, root = join(dirname(fileURLToPath(import.meta.url)), '..')) => copy(out, GATED_FILES, GATED_DIRS, root);
if (process.argv[1]?.endsWith('build_public.mjs')) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  console.log('public siap:', buildPublic(process.argv[2] || join(root, 'public'), root));
  console.log('gated siap:', buildGated(process.argv[3] || join(root, 'server', 'gated'), root));
}
