// Membangun public/ (outputDirectory Vercel) hanya dari daftar publik. Jalankan: node scripts/build_public.mjs [folder-keluar]
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_FILES, PUBLIC_DIRS } from './public_manifest.mjs';

export function buildPublic(out, root = join(dirname(fileURLToPath(import.meta.url)), '..')) {
  rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
  for (const f of PUBLIC_FILES) cpSync(join(root, f), join(out, f));
  for (const d of PUBLIC_DIRS) if (existsSync(join(root, d))) cpSync(join(root, d), join(out, d), { recursive: true });
  return out;
}
if (process.argv[1]?.endsWith('build_public.mjs')) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  console.log('public siap:', buildPublic(process.argv[2] || join(root, 'public'), root));
}
