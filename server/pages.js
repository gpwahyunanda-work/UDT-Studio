// F10 (S-1 lanjutan): gerbang halaman. Berkas aplikasi (Studio, Compiler, studio-ext) HANYA tersaji untuk sesi yang sah; tanpa sesi: halaman masuk (HTML) atau 401 (berkas).
// Berkas gated dibaca dari server/gated/ (hasil scripts/build_public.mjs, ikut bundel fungsi Vercel lewat server/**) atau, di pengembangan, dari akar repo.
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, normalize, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GATED_PATTERNS } from '../scripts/public_manifest.mjs';
import { PAGE_HEADERS, STUDIO_FRAME_HEADERS } from './pageHeaders.js';
import { MIN_PW, MAX_PW } from './accounts.js';
import { homePage, studioPage, injectCompiler, recordPage, archPage, erdRelasiPage } from './shell.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
// Vercel (VERCEL=1) atau UDT_USE_GATED=1: pakai salinan server/gated; selain itu akar repo (tanpa salinan basi saat pengembangan).
const ROOT = (process.env.VERCEL || process.env.UDT_USE_GATED) && existsSync(join(HERE, 'gated', 'index.html')) ? join(HERE, 'gated') : join(HERE, '..');
export const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8' };
const NOSTORE = { 'cache-control': 'private, no-store' };

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function shell(title, heading, body, script) {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · UDT</title>
<link rel="stylesheet" href="/theme/pharos-theme.css"><link rel="icon" href="/icons/favicon.ico">
<style>body{margin:0;background:var(--pharos-gray-soft,#f4f5f7);color:var(--pharos-ink,#14181f);font-family:var(--pharos-font,system-ui,sans-serif)}.box{max-width:420px;margin:10vh auto 0;padding:0 24px}
.card{background:var(--pharos-white,#fff);border:1px solid var(--pharos-line,#d9dde3);border-radius:var(--pharos-radius,4px);padding:16px 18px 20px;display:flex;flex-direction:column;gap:14px}
label{font-size:12px;font-weight:600;color:var(--pharos-slate,#44505f)}input{height:44px;padding:0 12px;border:1px solid var(--pharos-control,#8a94a3);border-radius:var(--pharos-radius,4px);font-size:14px;width:100%;box-sizing:border-box;background:var(--pharos-white,#fff);color:inherit}
.f{display:flex;flex-direction:column;gap:6px}button{min-height:48px;padding:0 18px;border:0;border-radius:var(--pharos-radius,4px);background:var(--pharos-blue,#0b57d0);color:#fff;font-weight:600;font-size:14px;cursor:pointer}button.s{background:transparent;color:var(--pharos-blue,#0b57d0);border:1px solid var(--pharos-blue,#0b57d0)}
.err{font-size:13px;color:var(--pharos-red,#b3261e);min-height:1em}.err:not(:empty){border:1px solid var(--pharos-red,#b3261e);border-radius:var(--pharos-radius,4px);padding:8px 10px;font-weight:600}.err:focus{outline:2px solid var(--pharos-red,#b3261e);outline-offset:2px}.pw{display:flex;gap:8px}.pw input{flex:1}button.t{min-height:44px;padding:0 12px;background:transparent;color:var(--pharos-blue,#0b57d0);border:1px solid var(--pharos-control,#8a94a3);font-weight:600}button.t[aria-pressed=true]{background:var(--pharos-blue,#0b57d0);color:#fff}button:focus-visible,input:focus-visible{outline:2px solid var(--pharos-blue,#0b57d0);outline-offset:2px}.ok{font-size:13px;color:var(--pharos-ink,#14181f)}.note{font-size:12.5px;color:var(--pharos-muted,#5f6b7a)}h1{margin:4px 0 16px;font-weight:700;font-size:28px;line-height:1.2}.eb{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--pharos-muted,#5f6b7a);font-weight:600}</style></head>
<body><div class="box"><img src="/theme/pharos-logo.png" alt="Pharos" height="44"><div class="eb">UDT Studio dan Compiler</div><h1>${esc(heading)}</h1>${body}</div><script>${script}</script></body></html>`;
}

const FORM_JS = `function fail(m){var e=$('er');e.textContent=m;e.focus()}var TG=document.querySelectorAll('button.t');for(var i=0;i<TG.length;i++)TG[i].addEventListener('click',function(){var inp=$(this.getAttribute('data-for')),on=inp.type==='password';inp.type=on?'text':'password';this.setAttribute('aria-pressed',on?'true':'false')});`;
const pwField = (id, label, auto, extra = '') => `<div class="f"><label for="${id}">${label}</label><div class="pw"><input id="${id}" type="password" autocomplete="${auto}" required${extra}><button type="button" class="t" data-for="${id}" aria-pressed="false" aria-label="Tampilkan kata sandi: ${label.toLowerCase()}">Tampilkan</button></div></div>`;

const API_JS = `function api(m,p,b){return fetch(p,{method:m,credentials:'same-origin',headers:b?{'content-type':'application/json'}:{},body:b?JSON.stringify(b):undefined}).then(function(r){return r.json().catch(function(){return{}}).then(function(j){return{status:r.status,j:j}})}).catch(function(){return{status:0,j:{error:'Server tidak terjangkau.'}}})}var $=function(i){return document.getElementById(i)};`;

export const loginPage = () => shell('Masuk', 'Masuk', `<form id="f" class="card" novalidate>
<div class="f"><label for="em">Email atau username</label><input id="em" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>
${pwField('pw', 'Kata sandi', 'current-password')}
<div id="er" class="err" role="alert" tabindex="-1"></div><button type="submit">Masuk</button>
<div class="note">Lupa kata sandi: minta admin menyetelnya. Tidak ada pendaftaran sendiri.</div></form>`,
`${API_JS}${FORM_JS}$('f').addEventListener('submit',function(e){e.preventDefault();$('er').textContent='';
var id=$('em').value.trim(),pw=$('pw').value;
if(!id&&!pw){fail('Isi email atau username dan kata sandi.');$('em').focus();return}
if(!id){fail('Email atau username wajib diisi.');$('em').focus();return}
if(!pw){fail('Kata sandi wajib diisi.');$('pw').focus();return}
api('POST','/api/auth/login',{identity:id,password:pw}).then(function(r){$('pw').value='';
if(r.status===200){location.assign(r.j.must_change_password?'/ganti-sandi':(location.pathname==='/masuk'?'/':location.href))}else{fail(r.j.error||('Masuk gagal (kode '+r.status+'). Coba lagi.'))}})});$('em').focus();`);

export const passwordPage = (user) => shell('Ganti kata sandi', 'Ganti kata sandi', `<form id="f" class="card" novalidate>
${user.must_change_password ? '<div class="ok" role="status">Kata sandi Anda masih sementara. Buat kata sandi baru sebelum melanjutkan.</div>' : ''}
<div class="note">Masuk sebagai ${esc(user.display_name)} (${esc(user.role)})</div>
${pwField('cu', 'Kata sandi saat ini', 'current-password')}
${pwField('n1', 'Kata sandi baru', 'new-password')}
${pwField('n2', 'Ulangi kata sandi baru', 'new-password')}
<div class="note">Minimal ${MIN_PW} karakter; bukan email atau nama Anda; bukan kata sandi umum; berbeda dari yang lama.</div>
<div id="er" class="err" role="alert" tabindex="-1"></div><button type="submit">Simpan kata sandi</button>
${user.must_change_password ? '' : '<button type="button" class="s" id="bk">Kembali</button>'}<button type="button" class="s" id="lo">Keluar</button></form>`,
`${API_JS}${FORM_JS}$('f').addEventListener('submit',function(e){e.preventDefault();$('er').textContent='';
var cu=$('cu').value,n1=$('n1').value,n2=$('n2').value,len=Array.from(n1).length;
if(!cu){fail('Kata sandi saat ini wajib diisi.');$('cu').focus();return}
if(!n1){fail('Kata sandi baru wajib diisi.');$('n1').focus();return}
if(len<${MIN_PW}){fail('Kata sandi baru minimal ${MIN_PW} karakter (sekarang '+len+').');$('n1').focus();return}
if(len>${MAX_PW}){fail('Kata sandi baru maksimal ${MAX_PW} karakter.');$('n1').focus();return}
if(!n2){fail('Ulangi kata sandi baru.');$('n2').focus();return}
if(n1!==n2){fail('Kata sandi baru dan ulangannya tidak sama.');$('n2').focus();return}
api('POST','/api/auth/password',{current_password:cu,new_password:n1}).then(function(r){if(r.status===200){location.assign('/')}else{fail((r.j.error||('Gagal (kode '+r.status+')'))+(r.j.details&&r.j.details.length?': '+r.j.details.join('; '):''))}})});
$('lo').addEventListener('click',function(){api('POST','/api/auth/logout').then(function(){location.assign('/masuk')})});var bk=$('bk');if(bk)bk.addEventListener('click',function(){location.assign('/')});$('cu').focus();`);

// Peta jalur -> berkas gated (null bila bukan jalur gated). F14: '/' bukan lagi berkas (Beranda dirender server); isi Studio tersaji di /studio-app.
const ENTRY = { '/': 'home', '/studio': 'studio', '/studio-app': 'studio-app', '/index.html': 'legacy', '/compiler': 'compiler', '/compiler/': 'compiler', '/record': 'record', '/architecture': 'architecture', '/architecture/': 'architecture', '/architecture/erd-relasi': 'erd-relasi' };
export function gatedFile(pathname) {
  const p = pathname;
  if (p === '/studio-app') return 'index.html';
  if (p === '/compiler' || p === '/compiler/') return 'compiler/index.html';
  let rel; try { rel = decodeURIComponent(p).replace(/^\/+/, ''); } catch { return null; }
  if (rel.includes('\0') || rel.includes('\\') || rel.split('/').includes('..') || rel.split('/').includes('.')) return null;   // F15: garis miring terbalik = pemisah jalur di Windows (..\\server\\app.js lolos pemeriksaan '..' lalu keluar dari folder gated)
  if (rel === 'index.html') return null;   // F14: alamat lama tidak memuat Studio lagi (dialihkan ke /studio)
  return GATED_PATTERNS.some((re) => re.test(rel)) ? rel : null;
}
export const isPagePath = (p) => p === '/masuk' || p === '/ganti-sandi' || p in ENTRY || gatedFile(p) !== null;

const shellPage404 = (user) => `<!doctype html><meta charset="utf-8"><title>Architecture</title><p>Berkas arsitektur tidak tersedia pada deployment ini. Hubungi INDRA.</p>`;
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
  if (kind === 'record') return html(200, req.method === 'HEAD' ? null : recordPage(user));
  if (kind === 'architecture' || kind === 'erd-relasi') {   // F15: semua peran yang sudah masuk; berkas dibaca dari architecture/ (gated), teks Markdown di-escape
    let idx, md; try { idx = JSON.parse(await readFile(join(ROOT, 'architecture', 'index.json'), 'utf8')); if (kind === 'erd-relasi') md = await readFile(join(ROOT, 'architecture', 'ERD_relasi.md'), 'utf8'); } catch { return html(503, shellPage404(user)); }
    return html(200, req.method === 'HEAD' ? null : (kind === 'architecture' ? archPage(user, idx) : erdRelasiPage(user, md)));
  }
  if (kind === 'legacy') return new Response(null, { status: 302, headers: { location: '/studio', ...NOSTORE } });
  const full = normalize(join(ROOT, rel));
  if (!full.startsWith(ROOT + sep) || !GATED_PATTERNS.some((re) => re.test(full.slice(ROOT.length + 1).split(sep).join('/')))) return null;   // setelah normalisasi pun harus tetap berkas gated
  let body; try { body = await readFile(full); } catch { return null; }
  const ext = extname(full);
  if (kind === 'compiler') body = injectCompiler(body.toString('utf8'), user);
  return new Response(req.method === 'HEAD' ? null : body, { status: 200, headers: { 'content-type': MIME[ext] || 'application/octet-stream', 'x-content-type-options': 'nosniff', 'cross-origin-resource-policy': 'same-origin', ...NOSTORE, ...(ext === '.html' ? (kind === 'studio-app' || rel.startsWith('architecture/') ? STUDIO_FRAME_HEADERS : PAGE_HEADERS) : {}) } });
}
