/* Tab 6 "Compile Data UDT" (AI Assisted): kerangka Sprint 0/1. Tanpa CDN, tanpa rumus f2 (rumus Langkah 4 dipakai lewat udtBridge pada Sprint 2).
   Semua gaya dibatasi pada #udt-compile; tidak menyentuh Langkah 1-5. Teks dari server dirender sebagai teks (textContent). */
(function () {
  'use strict';
  var root = document.getElementById('udt-compile');
  if (!root) return;

  var css = document.createElement('style');
  css.textContent = [
    '#udt-compile{font:14px/1.5 system-ui,Arial,sans-serif;color:#202729;max-width:960px;margin:0 auto;padding:8px 0}',
    '#udt-compile .uc-badge{display:inline-block;background:#0064A2;color:#fff;border-radius:4px;padding:1px 8px;font-size:12px;margin-left:8px;vertical-align:middle}',
    '#udt-compile .uc-card{border:1px solid #D9D9D9;border-radius:8px;padding:12px 16px;margin:12px 0}',
    '#udt-compile label{display:block;margin:6px 0}',
    '#udt-compile input{padding:6px 8px;border:1px solid #D9D9D9;border-radius:4px;min-width:240px}',
    '#udt-compile button{padding:6px 14px;border:0;border-radius:4px;background:#009042;color:#fff;cursor:pointer}',
    '#udt-compile button:focus-visible,#udt-compile input:focus-visible{outline:3px solid #0064A2;outline-offset:2px}',
    '#udt-compile table{border-collapse:collapse;width:100%}',
    '#udt-compile th,#udt-compile td{border-bottom:1px solid #D9D9D9;padding:6px 8px;text-align:left}',
    '#udt-compile td.n{text-align:right}',
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
  root.appendChild(el('h2', {}, ['Compile Data UDT', el('span', { 'class': 'uc-badge' }, ['AI Assisted'])]));
  root.appendChild(view);

  function showLogin(msg) {
    var pw = el('input', { type: 'password', id: 'uc-pw', autocomplete: 'current-password' });
    var err = el('p', { 'class': 'uc-err', role: 'alert' }, [msg || '']);
    view.replaceChildren(el('form', { 'class': 'uc-card', onsubmit: function (ev) {
      ev.preventDefault();
      api('POST', '/api/auth/login', { password: pw.value }).then(function (r) { r.status === 200 ? boot() : showLogin(r.body.error || 'Masuk gagal'); });
    } }, [el('label', { 'for': 'uc-pw' }, ['Kata sandi tim']), pw, el('p'), el('button', { type: 'submit' }, ['Masuk']), err]));
  }
  function showAnalyst() {
    var nm = el('input', { type: 'text', id: 'uc-name', maxlength: '80', autocomplete: 'name' });
    var err = el('p', { 'class': 'uc-err', role: 'alert' });
    view.replaceChildren(el('form', { 'class': 'uc-card', onsubmit: function (ev) {
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
          rows.length ? el('table', {}, [el('thead', {}, [el('tr', {}, [el('th', {}, ['Compile']), el('th', {}, ['Medium']), el('th', {}, ['Run'])])]), el('tbody', {}, rows)]) : el('p', {}, ['Belum ada compile. Data masuk lewat impor sheet atau "Tambahkan ke Compile" (sprint berikutnya).'])
        ]));
    });
  }
  function boot() {
    api('GET', '/api/me').then(function (r) {
      if (r.status !== 200) return showLogin();
      if (!r.body.analyst) return showAnalyst();
      showCompiles(r.body);
    });
  }
  var started = false;
  function start() { if (!started) { started = true; boot(); } }
  // Muat data hanya saat tab 6 dibuka (tidak ada permintaan jaringan selama pemakaian Langkah 1-5)
  var panel = document.getElementById('p6');
  if (panel.classList.contains('active')) start();
  new MutationObserver(function () { if (panel.classList.contains('active')) start(); }).observe(panel, { attributes: true, attributeFilter: ['class'] });
})();
