// F14: kerangka halaman (sidebar + bilah atas) yang dirender server. Satu sumber untuk Beranda, pembungkus Studio, Record, Architecture, dan sidebar yang disuntikkan ke Compiler.
// Teks pengguna selalu di-escape. Perilaku (ciut, menu, tema, keluar) ada di /shell/shell.js.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const I = (d) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  home: I('<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>'),
  studio: I('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>'),
  compiler: I('<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>'),
  record: I('<path d="M4 4h12l4 4v12H4z"/><path d="M8 12h8M8 16h8M8 8h4"/>'),
  architecture: I('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="8" y="14" width="8" height="7"/><path d="M6.5 10v2h11v-2M12 12v2"/>'),
  users: I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 3-6 6.5-6s6.5 2.4 6.5 6"/><path d="M17 5a3 3 0 0 1 0 6M21.5 20c0-2.6-1.7-4.6-4-5.5"/>'),
  key: I('<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L20 3M16 7l3 3"/>'),
  out: I('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>'),
  menu: I('<path d="M3 6h18M3 12h18M3 18h18"/>'),
  chev: I('<path d="M15 6l-6 6 6 6"/>'),
};
export const NAV = [
  { id: 'home', href: '/', label: 'Beranda', desc: '' },
  { id: 'studio', href: '/studio', label: 'Studio', desc: 'Olah data uji disolusi dari file instrumen: unggah, periksa, parameter, hasil, kirim ke Compiler.' },
  { id: 'compiler', href: '/compiler', label: 'Compiler', desc: 'Kompilasi profil disolusi per produk: matriks f2, grafik 2×2, ekspor, cetak, kelola run.' },
  { id: 'record', href: '/record', label: 'Record', desc: 'Catatan dan rekam jejak pengujian.', soon: 'F15' },
  { id: 'architecture', href: '/architecture', label: 'Architecture', desc: 'Peta arsitektur sistem dan alur data.', soon: 'F15' },
];
export const ICONS = ICON;

export function sidebarHtml(user, active) {
  const li = (n) => `<li><a href="${n.href}"${n.id === active ? ' aria-current="page"' : ''}>${ICON[n.id]}<span class="lb">${esc(n.label)}</span></a></li>`;
  const admin = user && user.role === 'admin' ? `<li><a href="/compiler#users"${active === 'users' ? ' aria-current="page"' : ''}>${ICON.users}<span class="lb">Pengguna</span></a></li>` : '';
  return `<div class="side-mobilebar"><button type="button" id="sideMenu" aria-label="Buka menu" aria-expanded="false" aria-controls="udtSide">${ICON.menu}<span>Menu</span></button></div><div class="side-scrim" id="sideScrim"></div>
<aside id="udtSide" class="udt-side" aria-label="Navigasi utama" data-collapsed="false"><div class="side-head"><button type="button" class="side-btn side-collapse" id="sideToggle" aria-label="Ciutkan sidebar" aria-expanded="true" aria-controls="udtSideNav">${ICON.chev}</button><span class="side-brand">UDT</span></div>
<nav id="udtSideNav" aria-label="Halaman"><ul>${NAV.map(li).join('')}${admin ? `</ul><div class="side-sep"></div><ul>${admin}` : ''}</ul></nav>
<div class="side-foot"><div class="acct"><b>${esc(user ? user.display_name : '')}</b><span>${esc(user ? user.role : '')}</span></div><a href="/ganti-sandi">${ICON.key}<span class="lb">Ganti kata sandi</span></a><button type="button" class="lnk" id="sideLogout">${ICON.out}<span class="lb">Keluar</span></button></div></aside>`;
}

const THEME_INIT = `<script>try{var t=localStorage.getItem("udt_theme")||localStorage.getItem("udt-theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}</script>`;
export const topbarHtml = (title, sub = 'Analytical Development · Pharos Indonesia') => `<header class="udt-topbar"><div class="topbar-brand"><img src="/theme/pharos-logo.png" alt="Pharos" height="40"><h1>${esc(title)}</h1><span class="sub">${esc(sub)}</span></div><div class="topbar-actions"><button class="udt-theme-btn" id="themeBtn" type="button" data-theme-toggle aria-label="Ganti tampilan terang atau gelap"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/></svg><span>Tampilan</span></button></div></header>`;

// Halaman penuh. main = HTML siap pakai (sudah di-escape oleh pemanggil).
export function shellPage({ title, active, user, main, topbar = true, extraHead = '' }) {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · UDT</title>
<link rel="stylesheet" href="/theme/pharos-theme.css"><link rel="stylesheet" href="/shell/shell.css"><link rel="icon" type="image/png" href="/theme/pharos-logo.png">${THEME_INIT}${extraHead}</head>
<body style="margin:0;background:var(--pharos-white,#fff)"><a class="udt-skip" href="#udtMain">Lewati ke isi</a><div class="udt-app">${sidebarHtml(user, active)}<div class="udt-main" id="udtMain">${topbar ? topbarHtml(title) : ''}${main}</div></div><script src="/shell/shell.js"></script></body></html>`;
}

export const homePage = (user) => shellPage({ title: 'Beranda', active: 'home', user, main: `<div class="udt-page"><div class="udt-eyebrow">UDT Studio dan Compiler</div><h2 class="t">Beranda</h2><p class="lead">Halo, ${esc(user.display_name)}. Pilih alat kerja. Studio mengolah data mentah dari instrumen; Compiler menyatukan hasilnya per produk.</p>
<div class="udt-cards">${NAV.filter((n) => n.id !== 'home').map((n) => `<a class="udt-card" href="${n.href}"><span class="ic">${ICON[n.id]}</span><h3>${esc(n.label)}</h3><p>${esc(n.desc)}</p>${n.soon ? '<span class="udt-badge">Segera hadir</span>' : ''}<span class="go">${n.soon ? 'Lihat halaman' : 'Buka ' + esc(n.label)} →</span></a>`).join('')}</div></div>` });

export const soonPage = (user, id) => { const n = NAV.find((x) => x.id === id); return shellPage({ title: n.label, active: id, user, main: `<div class="udt-page"><div class="udt-soon" role="status"><div class="udt-eyebrow">Segera hadir</div><h2>${esc(n.label)}</h2><p>${esc(n.desc)} Halaman ini sedang disiapkan (${esc(n.soon)}); kerangka dan navigasi sudah berlaku.</p><a class="udt-btn" href="/">Kembali ke Beranda</a></div></div>` }); };

// Studio: pembungkus sama-asal. Isi Studio (index.html, tidak diubah) tersaji di /studio-app dan dibingkai di sini.
export const studioPage = (user) => shellPage({ title: 'Studio', active: 'studio', user, topbar: false, main: `<iframe id="studioFrame" class="udt-frame" src="/studio-app" title="UDT Studio"></iframe>` });

// Compiler: berkas statis memuat penanda; server mengganti dengan sidebar.
export const injectCompiler = (htmlText, user) => htmlText.replace('<!--UDT_SIDEBAR-->', () => sidebarHtml(user, 'compiler'));
