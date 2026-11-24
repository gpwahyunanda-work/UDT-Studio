// F10 (S-1 lanjutan): gerbang halaman. Berkas aplikasi (Studio, Compiler, studio-ext) HANYA tersaji untuk sesi yang sah; tanpa sesi: halaman masuk (HTML) atau 401 (berkas).
// Berkas gated dibaca dari server/gated/ (hasil scripts/build_public.mjs, ikut bundel fungsi Vercel lewat server/**) atau, di pengembangan, dari akar repo.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, normalize, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GATED_PATTERNS } from '../scripts/public_manifest.mjs';
import { PAGE_HEADERS, STUDIO_FRAME_HEADERS } from './pageHeaders.js';
import { homePage, soonPage, studioPage, injectCompiler } from './shell.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
// Vercel (VERCEL=1) atau UDT_USE_GATED=1: pakai salinan server/gated; selain itu akar repo (tanpa salinan basi saat pengembangan).
const ROOT = (process.env.VERCEL || process.env.UDT_USE_GATED) && existsSync(join(HERE, 'gated', 'index.html')) ? join(HERE, 'gated') : join(HERE, '..');
export const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
const NOSTORE = { 'cache-control': 'private, no-store' };

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function shell(title, heading, body, script) {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · UDT</title>
<link rel="stylesheet" href="/theme/pharos-theme.css"><link rel="icon" href="/icons/favicon.ico">
<style>body{margin:0;background:var(--pharos-gray-soft,#f4f5f7);color:var(--pharos-ink,#14181f);font-family:var(--pharos-font,system-ui,sans-serif)}.box{max-width:420px;margin:10vh auto 0;padding:0 24px}
.card{background:var(--pharos-white,#fff);border:1px solid var(--pharos-line,#d9dde3);border-radius:var(--pharos-radius,4px);padding:16px 18px 20px;display:flex;flex-direction:column;gap:14px}
label{font-size:12px;font-weight:600;color:var(--pharos-slate,#44505f)}input{height:44px;padding:0 12px;border:1px solid var(--pharos-control,#8a94a3);border-radius:var(--pharos-radius,4px);font-size:14px;width:100%;box-sizing:border-box;background:var(--pharos-white,#fff);color:inherit}
.f{display:flex;flex-direction:column;gap:6px}button{min-height:48px;padding:0 18px;border:0;border-radius:var(--pharos-radius,4px);background:var(--pharos-blue,#0b57d0);color:#fff;font-weight:600;font-size:14px;cursor:pointer}button.s{background:transparent;color:var(--pharos-blue,#0b57d0);border:1px solid var(--pharos-blue,#0b57d0)}
.err{font-size:13px;color:var(--pharos-red,#b3261e);min-height:1em}.ok{font-size:13px;color:var(--pharos-ink,#14181f)}.note{font-size:12.5px;color:var(--pharos-muted,#5f6b7a)}h1{margin:4px 0 16px;font-weight:700;font-size:28px;line-height:1.2}.eb{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--pharos-muted,#5f6b7a);font-weight:600}</style></head>
<body><div class="box"><img src="/theme/pharos-logo.png" alt="Pharos" height="44"><div class="eb">UDT Studio dan Compiler</div><h1>${esc(heading)}</h1>${body}</div><script>${script}</script></body></html>`;
}

const API_JS = `function api(m,p,b){return fetch(p,{method:m,credentials:'same-origin',headers:b?{'content-type':'application/json'}:{},body:b?JSON.stringify(b):undefined}).then(function(r){return r.json().catch(function(){return{}}).then(function(j){return{status:r.status,j:j}})}).catch(function(){return{status:0,j:{error:'Server tidak terjangkau.'}}})}var $=function(i){return document.getElementById(i)};`;

export const loginPage = () => shell('Masuk', 'Masuk', `<form id="f" class="card" novalidate>
<div class="f"><label for="em">Email atau username</label><input id="em" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>
<div class="f"><label for="pw">Kata sandi</label><input id="pw" type="password" autocomplete="current-password" required></div>
<div id="er" class="err" role="alert"></div><button type="submit">Masuk</button>
<div class="note">Lupa kata sandi: minta admin menyetelnya. Tidak ada pendaftaran sendiri.</div></form>`,
`${API_JS}$('f').addEventListener('submit',function(e){e.preventDefault();$('er').textContent='';api('POST','/api/auth/login',{identity:$('em').value,password:$('pw').value}).then(function(r){$('pw').value='';
if(r.status===200){location.assign(r.j.must_change_password?'/ganti-sandi':(location.pathname==='/masuk'?'/':location.href))}else{$('er').textContent=r.j.error||'Masuk gagal'}})});$('em').focus();`);

export const passwordPage = (user) => shell('Ganti kata sandi', 'Ganti kata sandi', `<form id="f" class="card" novalidate>
${user.must_change_password ? '<div class="ok" role="status">Kata sandi Anda masih sementara. Buat kata sandi baru sebelum melanjutkan.</div>' : ''}
<div class="note">Masuk sebagai ${esc(user.display_name)} (${esc(user.role)})</div>
<div class="f"><label for="cu">Kata sandi saat ini</label><input id="cu" type="password" autocomplete="current-password" required></div>
<div class="f"><label for="n1">Kata sandi baru</label><input id="n1" type="password" autocomplete="new-password" required></div>
<div class="f"><label for="n2">Ulangi kata sandi baru</label><input id="n2" type="password" autocomplete="new-password" required></div>
<div class="note">Minimal 12 karakter; bukan email atau nama Anda; bukan kata sandi umum; berbeda dari yang lama.</div>
<div id="er" class="err" role="alert"></div><button type="submit">Simpan kata sandi</button>
${user.must_change_password ? '' : '<button type="button" class="s" id="bk">Kembali</button>'}<button type="button" class="s" id="lo">Keluar</button></form>`,
`${API_JS}$('f').addEventListener('submit',function(e){e.preventDefault();$('er').textContent='';if($('n1').value!==$('n2').value){$('er').textContent='Kata sandi baru dan ulangannya tidak sama.';return}
api('POST','/api/auth/password',{current_password:$('cu').value,new_password:$('n1').value}).then(function(r){if(r.status===200){location.assign('/')}else{$('er').textContent=(r.j.error||'Gagal')+(r.j.details&&r.j.details.length?': '+r.j.details.join('; '):'')}})});
$('lo').addEventListener('click',function(){api('POST','/api/auth/logout').then(function(){location.assign('/masuk')})});var bk=$('bk');if(bk)bk.addEventListener('click',function(){location.assign('/')});$('cu').focus();`);

// Peta jalur -> berkas gated (null bila bukan jalur gated). F14: '/' bukan lagi berkas (Beranda dirender server); isi Studio tersaji di /studio-app.
const ENTRY = { '/': 'home', '/studio': 'studio', '/studio-app': 'studio-app', '/index.html': 'legacy', '/compiler': 'compiler', '/compiler/': 'compiler', '/record': 'record', '/architecture': 'architecture' };
export function gatedFile(pathname) {
  const p = pathname;
  if (p === '/studio-app') return 'index.html';
  if (p === '/compiler' || p === '/compiler/') return 'compiler/index.html';
  let rel; try { rel = decodeURIComponent(p).replace(/^\/+/, ''); } catch { return null; }
  if (rel.includes('\0') || rel.split('/').includes('..')) return null;
  if (rel === 'index.html') return null;   // F14: alamat lama tidak memuat Studio lagi (dialihkan ke /studio)
  return GATED_PATTERNS.some((re) => re.test(rel)) ? rel : null;
}
export const isPagePath = (p) => p === '/masuk' || p === '/ganti-sandi' || p in ENTRY || gatedFile(p) !== null;

const html = (status, body, extra = {}) => new Response(body, { status, headers: { 'content-type': MIME['.html'], ...PAGE_HEADERS, ...NOSTORE, ...extra } });
const text = (status, msg) => new Response(msg, { status, headers: { 'content-type': MIME['.txt'], 'x-content-type-options': 'nosniff', ...NOSTORE } });

// user: baris akun yang sudah diverifikasi (aktif, token_version cocok) atau null.
export async function servePage(req, url, user) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return text(405, 'Metode tidak diizinkan');
  const path = url.pathname;
  if (path === '/masuk') return user ? new Response(null, { status: 302, headers: { location: user.must_change_password ? '/ganti-sandi' : '/', ...NOSTORE } }) : html(200, loginPage());
  if (path === '/ganti-sandi') return user ? html(200, passwordPage(user)) : html(200, loginPage());
  const rel = gatedFile(path);
  const kind = ENTRY[path] || (rel === 'compiler/index.html' ? 'compiler' : undefined);   // /compiler/index.html = halaman Compiler yang sama
  if (!kind && !rel) return null;
  const isEntry = !!kind;
  if (!user) return isEntry ? html(200, loginPage()) : text(401, 'Belum masuk');
  if (user.must_change_password) return isEntry ? new Response(null, { status: 302, headers: { location: '/ganti-sandi', ...NOSTORE } }) : text(403, 'Ganti kata sandi sementara dulu');
  if (kind === 'home') return html(200, req.method === 'HEAD' ? null : homePage(user));
  if (kind === 'studio') return html(200, req.method === 'HEAD' ? null : studioPage(user));
  if (kind === 'record' || kind === 'architecture') return html(200, req.method === 'HEAD' ? null : soonPage(user, kind));
  if (kind === 'legacy') return new Response(null, { status: 302, headers: { location: '/studio', ...NOSTORE } });
  const full = normalize(join(ROOT, rel));
  if (!full.startsWith(ROOT + sep)) return null;
  let body; try { body = await readFile(full); } catch { return null; }
  const ext = extname(full);
  if (kind === 'compiler') body = injectCompiler(body.toString('utf8'), user);
  return new Response(req.method === 'HEAD' ? null : body, { status: 200, headers: { 'content-type': MIME[ext] || 'application/octet-stream', 'x-content-type-options': 'nosniff', 'cross-origin-resource-policy': 'same-origin', ...NOSTORE, ...(ext === '.html' ? (kind === 'studio-app' ? STUDIO_FRAME_HEADERS : PAGE_HEADERS) : {}) } });
}
