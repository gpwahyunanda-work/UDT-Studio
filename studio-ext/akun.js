/* UDT Studio: penanda akun kecil (F10). Studio hanya tersaji setelah masuk; ini menampilkan nama + peran, tautan Ganti kata sandi dan Keluar.
   Tidak menyentuh isi p1..p5 (hash modules.lock tetap). Teks dari server dirender sebagai teks. */
(function () {
  'use strict';
  function el(tag, attrs, text) { var e = document.createElement(tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); if (text) e.textContent = text; return e; }
  fetch('/api/me', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (me) {
    if (!me) return;
    var bar = el('div', { id: 'udtAkun', role: 'navigation', 'aria-label': 'Akun', style: 'position:fixed;top:8px;right:8px;z-index:50;background:#fff;border:1px solid #d9dde3;border-radius:4px;padding:4px 10px;font:13px/1.4 system-ui,sans-serif;color:#14181f;display:flex;gap:10px;align-items:center' });
    bar.appendChild(el('span', {}, me.display_name + ' (' + me.role + ')'));
    var pw = el('a', { href: '/ganti-sandi', style: 'color:#0b57d0' }, 'Ganti kata sandi');
    var out = el('a', { href: '#', style: 'color:#0b57d0' }, 'Keluar');
    out.addEventListener('click', function (e) { e.preventDefault(); fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).then(function () { location.assign('/masuk'); }); });
    bar.appendChild(pw); bar.appendChild(out); document.body.appendChild(bar);
  }).catch(function () { /* tanpa penanda */ });
})();
