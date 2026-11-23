/* UDT Compiler (halaman sendiri /compiler; bukan bagian wizard Studio). Tanpa CDN, tanpa rumus f2 (rumus Langkah 4 dipakai lewat udtBridge pada Sprint 2).
   Semua gaya dibatasi pada #udt-compile. Teks dari server dirender sebagai teks (textContent). */
(function () {
  'use strict';
  var root = document.getElementById('udt-compile');
  if (!root) return;

  var css = document.createElement('style');
  css.textContent = [
    '#udt-compile{font:14px/1.5 system-ui,Arial,sans-serif;color:#202729;max-width:960px;margin:0 auto;padding:8px 0}',
    '#udt-compile .uc-badge{display:inline-block;background:#0064A2;color:#fff;border-radius:4px;padding:1px 8px;font-size:12px;margin-left:8px;vertical-align:middle}',
    '#udt-compile .uc-card{border:1px solid #D9D9D9;border-radius:8px;padding:12px 16px;margin:12px 0}',
    '#udt-compile .uc-card label{display:block;margin:6px 0}',
    '#udt-compile .uc-card input{padding:6px 8px;border:1px solid #D9D9D9;border-radius:4px;min-width:240px}',
    '#udt-compile .uc-card button{padding:6px 14px;border:0;border-radius:4px;background:#009042;color:#fff;cursor:pointer}',
    '#udt-compile .uc-card button:focus-visible,#udt-compile .uc-card input:focus-visible{outline:3px solid #0064A2;outline-offset:2px}',
    '#udt-compile .uc-card table{border-collapse:collapse;width:100%}',
    '#udt-compile .uc-card th,#udt-compile .uc-card td{border-bottom:1px solid #D9D9D9;padding:6px 8px;text-align:left}',
    '#udt-compile .uc-card td.n{text-align:right}',
    '#udt-compile .uc-err{color:#b00020}'
  ].join('\n');
  document.head.appendChild(css);

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'onclick' || k === 'onsubmit') e[k] = attrs[k]; else e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function api(method, path, body) {
    return fetch(path, { method: method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; }); });
  }

  var view = el('div');
  root.appendChild(view);

  function showLogin(msg) {
    var pw = el('input', { type: 'password', id: 'uc-pw', autocomplete: 'current-password' });
    var err = el('p', { 'class': 'uc-err', role: 'alert' }, [msg || '']);
    view.replaceChildren(el('h2', {}, ['UDT Compiler', el('span', { 'class': 'uc-badge' }, ['AI Assisted'])]), el('form', { 'class': 'uc-card', onsubmit: function (ev) {
      ev.preventDefault();
      api('POST', '/api/auth/login', { password: pw.value }).then(function (r) { r.status === 200 ? boot() : showLogin(r.body.error || 'Masuk gagal'); });
    } }, [el('label', { 'for': 'uc-pw' }, ['Kata sandi tim']), pw, el('p'), el('button', { type: 'submit' }, ['Masuk']), err]));
  }
  function showAnalyst() {
    var nm = el('input', { type: 'text', id: 'uc-name', maxlength: '80', autocomplete: 'name' });
    var err = el('p', { 'class': 'uc-err', role: 'alert' });
    view.replaceChildren(el('h2', {}, ['UDT Compiler']), el('form', { 'class': 'uc-card', onsubmit: function (ev) {
      ev.preventDefault();
      api('PUT', '/api/me/analyst', { name: nm.value }).then(function (r) { r.status === 200 ? boot() : (err.textContent = r.body.error || 'Gagal'); });
    } }, [el('label', { 'for': 'uc-name' }, ['Nama Anda (tercatat sebagai "ditambahkan oleh")']), nm, el('p'), el('button', { type: 'submit' }, ['Lanjut']), err]));
  }
  function showCompiles(me) {
    api('GET', '/api/compiles').then(function (r) {
      var rows = (r.body.compiles || []).map(function (c) {
        return el('tr', {}, [el('td', {}, [c.title]), el('td', { 'class': 'n' }, [String(c.medium_count)]), el('td', { 'class': 'n' }, [String(c.run_count)])]);
      });
      view.replaceChildren(
        el('p', {}, ['Masuk sebagai ', el('strong', {}, [me.analyst])]),
        el('div', { 'class': 'uc-card' }, [
          el('h3', {}, ['Compile tersimpan']),
          rows.length ? el('table', {}, [el('thead', {}, [el('tr', {}, [el('th', {}, ['Compile']), el('th', {}, ['Medium']), el('th', {}, ['Run'])])]), el('tbody', {}, rows)]) : el('p', {}, ['Belum ada compile. Data masuk lewat impor sheet atau tombol "Kirim ke Compiler" di Langkah 5 UDT Studio.'])
        ]));
    });
  }
  // Sprint 2: dashboard (pulau React) dimuat setelah masuk; bila gagal dimuat, daftar sederhana Sprint 1 tetap tampil.
  var islandLoad = null;
  function loadIsland() {
    if (islandLoad) return islandLoad;
    islandLoad = new Promise(function (ok, fail) {
      var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/compiler/island.css'; document.head.appendChild(l);
      var s = document.createElement('script'); s.src = '/compiler/island.js'; s.onload = function () { window.UDTCompile ? ok() : fail(new Error('pulau')); }; s.onerror = fail; document.head.appendChild(s);
    });
    return islandLoad;
  }
  function showDashboard(me) {
    var holder = el('div', { id: 'udt-compile-island' });
    view.replaceChildren(holder);
    return loadIsland().then(function () { window.UDTCompile.mount(holder, { api: api, me: me }); }, function () { showCompiles(me); });
  }
  function boot() {
    api('GET', '/api/me').then(function (r) {
      if (r.status !== 200) return showLogin();
      if (r.body.role === 'penulis' && !r.body.analyst) return showAnalyst();
      showDashboard(r.body);
    });
  }
  boot();
})();
