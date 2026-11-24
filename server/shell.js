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
  { id: 'compiler', href: '/compiler', label: 'Compiler', desc: 'Kompilasi profil disolusi per produk: matriks f2, grafik 2×2, ekspor, cetak, kelola data uji.' },
  { id: 'record', href: '/record', label: 'Record', desc: 'Telusuri tabel basis data ternormalisasi: cari, urut, filter, unduh CSV. Penulis dapat mengoreksi data master dengan jejak audit.' },
  { id: 'architecture', href: '/architecture', label: 'Architecture', desc: 'Peta arsitektur sistem, alur data, urutan proses, siklus status, dan ERD (versi analis dan teknis).' },
];
export const ICONS = ICON;

export function sidebarHtml(user, active) {
  const li = (n) => `<li><a href="${n.href}"${n.id === active ? ' aria-current="page"' : ''}>${ICON[n.id]}<span class="lb">${esc(n.label)}</span></a></li>`;
  const admin = user && user.role === 'admin' ? `<li><a href="/compiler#users"${active === 'users' ? ' aria-current="page"' : ''}>${ICON.users}<span class="lb">Pengguna</span></a></li>` : '';
  return `<div class="side-mobilebar"><button type="button" id="sideMenu" aria-label="Buka menu" aria-expanded="false" aria-controls="udtSide">${ICON.menu}<span>Menu</span></button></div><div class="side-scrim" id="sideScrim"></div>
<aside id="udtSide" class="udt-side" aria-label="Navigasi utama" data-collapsed="false"><div class="side-head"><button type="button" class="side-btn side-collapse" id="sideToggle" aria-label="Ciutkan sidebar" aria-expanded="true" aria-controls="udtSideNav">${ICON.chev}</button><span class="side-logo"><img src="/theme/pharos-logo.png" alt="Pharos" height="28"></span><span class="side-brand">UDT</span></div>
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

export const homePage = (user) => shellPage({ title: 'Beranda', active: 'home', user, main: `<div class="udt-page"><img class="home-logo" src="/theme/pharos-logo.png" alt="Pharos Indonesia" height="56"><div class="udt-eyebrow">UDT Studio dan Compiler</div><p class="lead one"><b>UDT</b> = Uji Disolusi Terbanding (membandingkan profil pelepasan produk uji dengan pembanding, f2).</p><p class="lead">Halo, ${esc(user.display_name)}. Pilih alat kerja. Studio mengolah data mentah dari instrumen; Compiler menyatukan hasilnya per produk.</p>
<div class="udt-cards">${NAV.filter((n) => n.id !== 'home').map((n) => `<a class="udt-card" href="${n.href}"><span class="ic">${ICON[n.id]}</span><h3>${esc(n.label)}</h3><p>${esc(n.desc)}</p><span class="go">Buka ${esc(n.label)} →</span></a>`).join('')}</div></div>` });

// Studio: pembungkus sama-asal. Isi Studio (index.html, tidak diubah) tersaji di /studio-app dan dibingkai di sini.
export const studioPage = (user) => shellPage({ title: 'Studio', active: 'studio', user, topbar: false, main: `<iframe id="studioFrame" class="udt-frame" src="/studio-app" title="UDT Studio"></iframe>` });

// Compiler: berkas statis memuat penanda; server mengganti dengan sidebar.
export const injectCompiler = (htmlText, user) => htmlText.replace('<!--UDT_SIDEBAR-->', () => sidebarHtml(user, 'compiler'));

// ---------- F15: Record dan Architecture ----------
export const recordPage = (user) => shellPage({ title: 'Record', active: 'record', user, extraHead: '<link rel="stylesheet" href="/shell/record.css">', main: `<div class="rec" id="rec" data-role="${esc(user.role)}">
<aside class="rec-side" aria-label="Daftar tabel"><div class="rec-side-h"><label for="recTblFilter">Tabel</label><input id="recTblFilter" type="search" placeholder="Cari tabel" autocomplete="off"></div><nav id="recTables" aria-label="Tabel basis data"></nav></aside>
<section class="rec-main" aria-live="polite" id="recMain"><div class="rec-empty" id="recWelcome"><p>Pilih tabel di kiri. Semua peran dapat membaca tabel domain. Kolom rahasia (kata sandi, hash, token, IP) tidak pernah ditampilkan.</p></div></section></div>
<dialog id="recDlg" class="rec-dlg" aria-labelledby="recDlgT"><form method="dialog" id="recForm" novalidate><h2 id="recDlgT"></h2><div id="recFields"></div>
<div class="rec-f"><label for="recAna">Nama analis (wajib, tercatat di jejak)</label><input id="recAna" type="text" maxlength="80" autocomplete="name" required></div>
<div class="rec-f"><label for="recWhy">Alasan perubahan (wajib)</label><textarea id="recWhy" rows="2" maxlength="4000" required></textarea></div>
<div id="recErr" class="rec-err" role="alert"></div><div class="rec-btns"><button type="submit" class="rec-primary" id="recSave">Simpan</button><button type="button" id="recCancel">Batal</button></div></form></dialog>
<script src="/shell/record.js"></script>` });

export const archPage = (user, idx) => {
  const d = (idx.diagram || []).filter((x) => /^[a-z0-9-]+$/.test(x.id) && /^[A-Za-z0-9_-]+\.html$/.test(x.berkas));
  const card = (x) => `<li class="arc-card" data-level="${esc(x.tingkat)}"><span class="arc-lv lv-${esc(x.tingkat)}">${x.tingkat === 'analis' ? 'Analis' : 'Teknis'}</span><h3>${esc(x.judul)}</h3><p>${esc(x.ringkasan)}</p><div class="arc-act"><button type="button" class="arc-open" data-id="${esc(x.id)}" data-src="/architecture/${esc(x.berkas)}" data-title="${esc(x.judul)}">Buka diagram</button>${x.id === 'erd' ? '<a class="arc-link" href="/architecture/erd-relasi">Tabel relasi (teks)</a>' : ''}</div></li>`;
  return shellPage({ title: 'Architecture', active: 'architecture', user, extraHead: '<link rel="stylesheet" href="/shell/architecture.css">', main: `<div class="arc" id="arc"><p class="lead">Sumber: ${esc(idx.dibuat_oleh || '')}, versi ${esc(idx.versi || '')}, tanggal ${esc(idx.dibuat || '')}. Diagram diperiksa terhadap kode pada commit ${esc(String(idx.sumber?.commit || '').slice(0, 7))}.</p>
<div class="arc-filter" role="group" aria-label="Filter tingkat"><button type="button" data-f="semua" aria-pressed="true">Semua (${d.length})</button><button type="button" data-f="analis" aria-pressed="false">Analis (${d.filter((x) => x.tingkat === 'analis').length})</button><button type="button" data-f="teknis" aria-pressed="false">Teknis (${d.filter((x) => x.tingkat === 'teknis').length})</button></div>
<ul class="arc-cards" id="arcCards">${d.map(card).join('')}</ul>
<section class="arc-view" id="arcView" hidden aria-labelledby="arcViewT"><div class="arc-view-h"><h2 id="arcViewT"></h2><div><a id="arcNew" class="arc-link" href="#" target="_blank" rel="noopener">Buka sendiri di tab baru</a><button type="button" id="arcClose">Tutup</button></div></div><iframe id="arcFrame" title="Diagram" referrerpolicy="no-referrer"></iframe></section></div><script src="/shell/architecture.js"></script>` });
};

// Penampil Markdown mini untuk docs/ERD_relasi.md: judul, paragraf, daftar, tabel, kode, tebal. Semua teks di-escape dulu; tidak ada HTML mentah dari berkas.
export function mdToHtml(md) {
  const inline = (t) => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  const lines = String(md).replace(/\r\n/g, '\n').split('\n'), out = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^#{1,4} /.test(l)) { const n = Math.min(4, l.match(/^#+/)[0].length + 1); out.push(`<h${n}>${inline(l.replace(/^#+ /, ''))}</h${n}>`); }
    else if (/^\|/.test(l) && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      const cells = (r) => r.replace(/^\||\|\s*$/g, '').split('|').map((c) => c.trim());
      const head = cells(l); i += 2; const body = [];
      while (i < lines.length && /^\|/.test(lines[i])) body.push(cells(lines[i++])); i--;
      out.push(`<div class="md-tw"><table><thead><tr>${head.map((c) => `<th scope="col">${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    } else if (/^- /.test(l)) { const it = []; while (i < lines.length && /^- /.test(lines[i])) it.push(lines[i++].slice(2)); i--; out.push(`<ul>${it.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`); }
    else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
  }
  return out.join('\n');
}
export const erdRelasiPage = (user, md) => shellPage({ title: 'ERD: tabel relasi', active: 'architecture', user, extraHead: '<link rel="stylesheet" href="/shell/architecture.css">', main: `<div class="arc"><p><a class="arc-link" href="/architecture">← Kembali ke daftar diagram</a> · <a class="arc-link" href="/architecture/ERD_relasi.csv">Unduh CSV</a> · <a class="arc-link" href="/architecture/erd.html">Buka gambar ERD</a></p><article class="md">${mdToHtml(md)}</article></div>` });
