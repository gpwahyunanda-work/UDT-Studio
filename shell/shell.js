/* F14: perilaku kerangka bersama: ciut/bentang sidebar, menu layar sempit, tombol Tampilan (terang/gelap, kunci sama dengan Studio), Keluar.
   Tidak menyentuh isi Studio. Dimuat oleh semua halaman (Beranda, Studio-pembungkus, Compiler, Record, Architecture). */
(function () {
  'use strict';
  var KEYS = ['udt_theme', 'udt-theme'];   // Studio memakai udt_theme; Compiler (F8) udt-theme. Keduanya ditulis agar sama.
  function stored() { try { for (var i = 0; i < KEYS.length; i++) { var t = localStorage.getItem(KEYS[i]); if (t === 'dark' || t === 'light') return t; } } catch (e) { /* abaikan */ } return null; }
  function isDark() { var c = document.documentElement.getAttribute('data-theme'); if (c === 'dark') return true; if (c === 'light') return false; return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); }
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { KEYS.forEach(function (k) { localStorage.setItem(k, t); }); } catch (e) { /* abaikan */ }
    var fr = document.getElementById('studioFrame');   // pembungkus Studio: bingkai sama-asal ikut berganti tema
    try { if (fr && fr.contentDocument) fr.contentDocument.documentElement.setAttribute('data-theme', t); } catch (e) { /* lintas asal: tidak terjadi */ }
  }
  window.UDTTheme = { toggle: function () { var n = isDark() ? 'light' : 'dark'; applyTheme(n); return n; }, apply: applyTheme, isDark: isDark };
  var s0 = stored(); if (s0 && document.documentElement.getAttribute('data-theme') !== s0) document.documentElement.setAttribute('data-theme', s0);
  window.addEventListener('storage', function (e) { if (KEYS.indexOf(e.key) >= 0 && (e.newValue === 'dark' || e.newValue === 'light')) document.documentElement.setAttribute('data-theme', e.newValue); });   // Studio (dalam bingkai) mengganti tema -> pembungkus ikut

  function $(id) { return document.getElementById(id); }
  var side = $('udtSide'), tg = $('sideToggle'), menuBtn = $('sideMenu');
  function setCollapsed(c) {
    if (!side) return; side.setAttribute('data-collapsed', c ? 'true' : 'false');
    if (tg) { tg.setAttribute('aria-expanded', c ? 'false' : 'true'); tg.setAttribute('aria-label', c ? 'Bentangkan sidebar' : 'Ciutkan sidebar'); }
    try { localStorage.setItem('udt_side', c ? '1' : '0'); } catch (e) { /* abaikan */ }
  }
  if (side) {
    var saved = null; try { saved = localStorage.getItem('udt_side'); } catch (e) { saved = null; }
    setCollapsed(saved === '1');
    if (tg) tg.addEventListener('click', function () { setCollapsed(side.getAttribute('data-collapsed') !== 'true'); });
  }
  function menu(open) { document.body.classList.toggle('menu-open', open); if (menuBtn) { menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); menuBtn.setAttribute('aria-label', open ? 'Tutup menu' : 'Buka menu'); } if (open) { var f = side && side.querySelector('nav a'); if (f) f.focus(); } else if (menuBtn && document.activeElement && side && side.contains(document.activeElement)) menuBtn.focus(); }
  if (menuBtn) menuBtn.addEventListener('click', function () { menu(!document.body.classList.contains('menu-open')); });
  var scrim = $('sideScrim'); if (scrim) scrim.addEventListener('click', function () { menu(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.body.classList.contains('menu-open')) menu(false); });
  Array.prototype.forEach.call(document.querySelectorAll('.udt-side nav a'), function (a) { a.addEventListener('click', function () { menu(false); }); });

  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[data-theme-toggle]')) { window.UDTTheme.toggle(); return; }
    var lo = e.target.closest && e.target.closest('#sideLogout');
    if (lo) { fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).then(function () { location.assign('/masuk'); }, function () { location.assign('/masuk'); }); }
  });

  // Studio dalam bingkai: tanda akun kecil milik studio-ext/akun.js digandakan oleh sidebar; disembunyikan dari sisi pembungkus (berkas Studio tidak diubah). Tema awal ikut pembungkus.
  var fr = $('studioFrame');
  if (fr) fr.addEventListener('load', function () {
    try {
      var d = fr.contentDocument, t = document.documentElement.getAttribute('data-theme'); if (!d) return;
      if (t) d.documentElement.setAttribute('data-theme', t);
      var st = d.createElement('style'); st.textContent = '#udtAkun{display:none!important}'; d.head.appendChild(st);
    } catch (e) { /* abaikan */ }
  });
})();
