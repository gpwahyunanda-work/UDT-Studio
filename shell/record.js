/* F15: /record: penelusur tabel (baca, semua peran) + penyunting terkontrol (penulis/admin). Semua data masuk ke DOM lewat textContent (tidak ada innerHTML dari data).
   Keadaan tampilan disimpan di hash URL: #t=tabel&p=2&q=cari&s=kolom&d=asc&f.kolom=teks&fx.kolom=persis (tautan lompat FK memakai fx). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var role = $('rec').getAttribute('data-role'), main = $('recMain'), listEl = $('recTables');
  var ANA_KEY = 'udt_analyst';
  var S = { tables: [], cur: null, data: null, timer: null };
  var idn = function (n) { return Number(n).toLocaleString('id-ID'); };   // F17: pemisah ribuan format Indonesia (1.234)

  function h(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k]; if (v === null || v === undefined || v === false) return;
      if (k === 'text') e.textContent = v; else if (k === 'class') e.className = v; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c === null || c === undefined) continue; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
    return e;
  }
  function api(method, path, body) {
    return fetch(path, { method: method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, j: j }; }); })
      .catch(function () { return { status: 0, j: { error: 'Server tidak terjangkau.' } }; });
  }
  function say(msg, bad) { var s = $('recStatus'); if (!s) return; s.textContent = msg; s.className = 'rec-status' + (bad ? ' bad' : ''); }

  // ---- hash <-> tampilan ----
  function parseHash() {
    var sp = new URLSearchParams(location.hash.replace(/^#/, '')), v = { t: sp.get('t') || '', p: Number(sp.get('p')) || 1, q: sp.get('q') || '', s: sp.get('s') || '', d: sp.get('d') || '', f: {}, fx: {} };
    sp.forEach(function (val, k) { var m = /^(f|fx)\.([a-z_]+)$/.exec(k); if (m) v[m[1]][m[2]] = val; });
    return v;
  }
  function hashOf(v) {
    var sp = new URLSearchParams(); sp.set('t', v.t); if (v.p > 1) sp.set('p', v.p); if (v.q) sp.set('q', v.q); if (v.s) sp.set('s', v.s); if (v.d) sp.set('d', v.d);
    Object.keys(v.f).forEach(function (k) { if (v.f[k]) sp.set('f.' + k, v.f[k]); }); Object.keys(v.fx).forEach(function (k) { if (v.fx[k] !== '') sp.set('fx.' + k, v.fx[k]); });
    return '#' + sp.toString();
  }
  function queryOf(v, withPage) {
    var sp = new URLSearchParams(); if (withPage && v.p > 1) sp.set('page', v.p); if (v.q) sp.set('q', v.q); if (v.s) sp.set('sort', v.s); if (v.d) sp.set('dir', v.d);
    Object.keys(v.f).forEach(function (k) { if (v.f[k]) sp.set('f.' + k, v.f[k]); }); Object.keys(v.fx).forEach(function (k) { if (v.fx[k] !== '') sp.set('fx.' + k, v.fx[k]); });
    var s = sp.toString(); return s ? '?' + s : '';
  }
  function go(v) { var nh = hashOf(v); if (location.hash === nh) load(); else location.hash = nh; }

  // ---- daftar tabel ----
  function renderList(filter) {
    listEl.textContent = ''; var f = (filter || '').toLowerCase(), groups = {}, order = [];
    S.tables.forEach(function (t) { if (f && (t.name + ' ' + t.label).toLowerCase().indexOf(f) < 0) return; if (!groups[t.group]) { groups[t.group] = []; order.push(t.group); } groups[t.group].push(t); });
    order.forEach(function (g) {
      var ul = h('ul', { class: 'rec-ul' });
      groups[g].forEach(function (t) {
        var b = h('a', { href: '#t=' + t.name, class: 'rec-tb', 'data-t': t.name }, h('span', { class: 'n', text: t.name }), h('span', { class: 'c', text: idn(t.rows) + ' baris', title: idn(t.rows) + ' baris' }),
          t.admin_only ? h('span', { class: 'tg', text: 'admin', title: 'Hanya admin yang dapat membaca dan mengubah tabel ini' }) : (t.writable ? h('span', { class: 'tg w', text: 'tulis', title: 'Penulis dan admin dapat menambah dan mengubah baris tabel ini (dengan nama analis dan alasan)' }) : null));
        if (S.cur === t.name) b.setAttribute('aria-current', 'page');
        ul.appendChild(h('li', null, b));
      });
      listEl.appendChild(h('div', { class: 'rec-grp' }, h('div', { class: 'rec-gh', text: g }), ul));
    });
  }

  // ---- tabel ----
  function cellNode(col, val, row) {
    if (val === null || val === undefined) return h('span', { class: 'nul', text: '—', 'aria-label': 'kosong' });
    if (col.type === 'bool') return document.createTextNode(val ? 'Ya' : 'Tidak');
    var txt = String(val);
    if (col.fk) return h('a', { href: '#t=' + col.fk.table + '&fx.' + col.fk.col + '=' + encodeURIComponent(txt), class: 'fk', title: 'Lompat ke baris induk di ' + col.fk.table + ' (' + col.fk.col + ' = ' + txt + ')' }, txt);
    if (col.name === 'status') return h('span', { class: 'st st-' + txt.toLowerCase(), text: txt });
    return h('span', { class: col.type === 'int' || col.type === 'num' ? 'num' : 'tx', title: txt.length > 60 ? txt : null, text: txt });
  }
  function render(d, v) {
    var t = d.table; main.textContent = '';
    var write = t.write, ro = t.readonly;
    var head = h('div', { class: 'rec-head' }, h('div', null, h('h2', { text: t.name }), h('div', { class: 'sub', text: t.label + ' · ' + idn(d.total) + ' baris' + (t.admin_only ? ' · hanya admin' : '') })),
      h('div', { class: 'rec-actions' },
        write && write.insert ? h('button', { type: 'button', class: 'rec-primary', onclick: function () { openEdit('insert'); }, text: 'Tambah baris' }) : null,
        h('a', { class: 'rec-btn', href: '/api/record/tables/' + t.name + '/csv' + queryOf(v, false), download: 'record_' + t.name + '.csv', text: 'Unduh CSV' })));
    main.appendChild(head);
    var notes = h('div', { class: 'rec-note', role: 'note' });
    if (ro) { notes.appendChild(h('p', { text: ro.note })); if (ro.action) notes.appendChild(h('a', { class: 'rec-btn rec-fix', href: ro.action.href, text: ro.action.label })); }
    if (t.measured_note) { notes.appendChild(h('p', { text: t.measured_note })); notes.appendChild(h('a', { class: 'rec-btn rec-fix', href: '/studio', text: 'Perbaiki lewat Studio/Timpa' })); }
    if (write) notes.appendChild(h('p', { class: 'ok', text: 'Dapat diubah: ' + write.update.join(', ') + '. Setiap perubahan wajib nama analis dan alasan, dicatat di jejak audit. ' + (write.soft_delete ? 'Hapus bersifat lunak (dapat dipulihkan). ' : 'Tidak ada hapus untuk tabel ini. ') + 'Hapus keras tidak ada.' }));
    if (!write && role === 'pembaca') notes.appendChild(h('p', { text: 'Peran Anda hanya membaca.' }));
    if (notes.childNodes.length) main.appendChild(notes);

    var form = h('form', { class: 'rec-tools', role: 'search', onsubmit: function (e) { e.preventDefault(); v.q = $('recQ').value.trim(); v.p = 1; go(v); } },
      h('label', { for: 'recQ', text: 'Cari di semua kolom' }), h('input', { id: 'recQ', type: 'search', value: v.q, maxlength: '200', autocomplete: 'off' }),
      h('button', { type: 'submit', text: 'Cari' }), h('button', { type: 'button', onclick: function () { go({ t: v.t, p: 1, q: '', s: '', d: '', f: {}, fx: {} }); }, text: 'Atur ulang' }));
    main.appendChild(form);
    var chips = h('div', { class: 'rec-chips' });
    Object.keys(v.fx).forEach(function (k) { chips.appendChild(h('button', { type: 'button', class: 'chip', title: 'Lepas filter', onclick: function () { delete v.fx[k]; v.p = 1; go(v); }, text: k + ' = ' + v.fx[k] + '  ×' })); });
    if (chips.childNodes.length) main.appendChild(chips);

    var thead = h('tr'), filt = h('tr', { class: 'flt' });
    t.columns.forEach(function (c) {
      var sorted = d.sort === c.name ? (d.dir === 'asc' ? 'ascending' : 'descending') : 'none';
      var th = h('th', { scope: 'col', 'aria-sort': sorted },
        h('button', { type: 'button', class: 'sortb', onclick: function () { v.p = 1; if (v.s === c.name) v.d = v.d === 'asc' ? 'desc' : 'asc'; else { v.s = c.name; v.d = 'asc'; } go(v); } }, c.name, h('span', { class: 'si', 'aria-hidden': 'true', text: sorted === 'ascending' ? ' ▲' : sorted === 'descending' ? ' ▼' : '' })),
        h('div', { class: 'ty' }, c.type, c.pk ? h('b', { class: 'bd', text: 'PK' }) : null, c.fk ? h('b', { class: 'bd fkb', text: 'FK→' + c.fk.table }) : null));
      thead.appendChild(th);
      var inp = h('input', { type: 'search', 'aria-label': 'Filter ' + c.name, value: v.f[c.name] || '', maxlength: '200', autocomplete: 'off', placeholder: 'filter' });
      inp.addEventListener('input', function () { clearTimeout(S.timer); S.timer = setTimeout(function () { v.f[c.name] = inp.value.trim(); v.p = 1; go(v); }, 450); });
      filt.appendChild(h('th', { scope: 'col' }, inp));
    });
    if (write) { thead.insertBefore(h('th', { scope: 'col', class: 'acth', text: 'Aksi' }), thead.firstChild); filt.insertBefore(h('th', { class: 'acth' }), filt.firstChild); }
    var tbody = h('tbody');
    if (!d.rows.length) tbody.appendChild(h('tr', null, h('td', { colspan: String(t.columns.length + (write ? 1 : 0)), class: 'none', text: 'Tidak ada baris yang cocok.' })));
    d.rows.forEach(function (r) {
      var tr = h('tr');
      if (write) {
        var td = h('td', { class: 'act' });
        td.appendChild(h('button', { type: 'button', onclick: function () { openEdit('update', r); }, text: 'Ubah' }));
        if (write.soft_delete) {
          if (r.c.status === 'Terlihat') td.appendChild(h('button', { type: 'button', class: 'dng', onclick: function () { openEdit('delete', r); }, text: 'Hapus' }));
          else if (r.c.status === 'Dihapus') td.appendChild(h('button', { type: 'button', onclick: function () { openEdit('restore', r); }, text: 'Pulihkan' }));
        }
        tr.appendChild(td);
      }
      t.columns.forEach(function (c) { tr.appendChild(h('td', { class: c.type === 'int' || c.type === 'num' ? 'r' : null }, cellNode(c, r.c[c.name], r))); });
      tbody.appendChild(tr);
    });
    main.appendChild(h('div', { class: 'rec-tw', tabindex: '0', role: 'region', 'aria-label': 'Isi tabel ' + t.name }, h('table', { class: 'rec-t' }, h('caption', { class: 'sr', text: t.label }), h('thead', null, thead, filt), tbody)));
    main.appendChild(h('div', { class: 'rec-pager' },
      h('button', { type: 'button', disabled: d.page <= 1, onclick: function () { v.p = d.page - 1; go(v); }, text: '‹ Sebelumnya' }),
      h('span', { text: 'Halaman ' + d.page + ' dari ' + d.pages + ' · ' + idn(d.total) + ' baris · ' + d.page_size + ' per halaman' }),
      h('button', { type: 'button', disabled: d.page >= d.pages, onclick: function () { v.p = d.page + 1; go(v); }, text: 'Berikutnya ›' })));
    main.appendChild(h('div', { id: 'recStatus', class: 'rec-status', role: 'status' }));
  }

  function load() {
    var v = parseHash(); if (!v.t) { S.cur = null; main.textContent = ''; main.appendChild($('recWelcome')); renderList($('recTblFilter').value); return Promise.resolve(); }
    S.cur = v.t; renderList($('recTblFilter').value);
    return api('GET', '/api/record/tables/' + encodeURIComponent(v.t) + queryOf(v, true)).then(function (r) {
      if (r.status !== 200) { main.textContent = ''; main.appendChild(h('div', { class: 'rec-note bad', role: 'alert', text: (r.j && r.j.error ? r.j.error : 'Gagal memuat') + (r.j && r.j.details ? ': ' + r.j.details.join('; ') : '') })); return; }
      S.data = r.j; v.p = r.j.page; render(r.j, v); document.title = 'Record: ' + v.t + ' · UDT';
    });
  }

  // ---- dialog tulis ----
  var dlg = $('recDlg'), E = { mode: null, row: null, fields: {} };
  function fieldNode(name, spec, val, opts) {
    var id = 'rf-' + name, lab = h('label', { for: id, text: name + (spec.req ? ' (wajib)' : '') }), inp;
    if (spec.t === 'bool') { inp = h('select', { id: id }, h('option', { value: 'true', text: 'Ya' }), h('option', { value: 'false', text: 'Tidak' })); inp.value = val === false ? 'false' : 'true'; }
    else if (spec.t === 'code' && opts && opts.code) { inp = h('select', { id: id }); opts.code.forEach(function (o) { inp.appendChild(h('option', { value: o.code, text: o.code + ' · ' + o.label })); }); if (val) inp.value = val; }
    else if (spec.t === 'text' && (spec.max || 0) > 300) { inp = h('textarea', { id: id, rows: '3', maxlength: String(spec.max) }); inp.value = val == null ? '' : String(val); }
    else { inp = h('input', { id: id, type: spec.t === 'int' ? 'number' : 'text', maxlength: spec.t === 'text' ? String(spec.max || 500) : null, min: spec.t === 'int' ? '1' : null }); inp.value = val == null ? '' : String(val); }
    E.fields[name] = { el: inp, spec: spec, orig: val };
    return h('div', { class: 'rec-f' }, lab, inp);
  }
  function openEdit(mode, row) {
    var d = S.data, t = d.table, w = t.write; E = { mode: mode, row: row || null, fields: {} };
    var box = $('recFields'); box.textContent = ''; $('recErr').textContent = ''; $('recWhy').value = '';
    $('recAna').value = (function () { try { return sessionStorage.getItem(ANA_KEY) || ''; } catch (e) { return ''; } })();
    var title = { insert: 'Tambah baris di ' + t.name, update: 'Ubah baris di ' + t.name, delete: 'Hapus (lunak) baris di ' + t.name, restore: 'Pulihkan baris di ' + t.name }[mode];
    $('recDlgT').textContent = title;
    if (mode === 'insert') {
      var keys = w.insert; keys.forEach(function (k) { box.appendChild(fieldNode(k, w.fields[k], null, d.table.options || (d.options))); });
    } else if (mode === 'update') {
      box.appendChild(h('p', { class: 'hint', text: 'Hanya kolom yang Anda ubah yang dikirim. Bila baris berubah oleh orang lain sejak dibuka, perubahan ditolak (409).' }));
      w.update.forEach(function (k) { box.appendChild(fieldNode(k, w.fields[k], row.c[k])); });
      if (t.name === 'compile') box.appendChild(h('p', { class: 'hint', text: 'Mengubah API tanpa mengubah api_uncertain menandai zat aktif sudah pasti (api_uncertain menjadi Tidak). Pilih Ya bila zat aktif masih belum pasti.' }));
    } else {
      box.appendChild(h('p', { text: (mode === 'delete' ? 'Run ' : 'Run ') + (row.pk[t.pk[0]]) + ' ' + (mode === 'delete' ? 'akan ditandai Dihapus (tidak terlihat di Compiler) dan dapat dipulihkan.' : 'akan ditandai Terlihat lagi di Compiler.') }));
    }
    $('recSave').textContent = { insert: 'Tambah', update: 'Simpan', delete: 'Hapus (lunak)', restore: 'Pulihkan' }[mode];
    dlg.showModal(); var first = box.querySelector('input,select,textarea'); (first || $('recAna')).focus();
  }
  function collect() {
    var out = {}, bad = [];
    Object.keys(E.fields).forEach(function (k) {
      var f = E.fields[k], raw = f.el.value, val;
      if (f.spec.t === 'bool') val = raw === 'true'; else if (f.spec.t === 'int') val = raw === '' ? null : Number(raw); else val = raw;
      if (E.mode === 'update') { var o = f.orig; var same = f.spec.t === 'bool' ? val === !!o : String(val == null ? '' : val) === String(o == null ? '' : o); if (same) return; if (f.spec.t === 'text' && String(val).trim() === '' && !f.spec.req) val = null; }
      out[k] = val;
    });
    return { values: out, bad: bad };
  }
  $('recCancel').addEventListener('click', function () { dlg.close(); });
  $('recForm').addEventListener('submit', function (e) {
    e.preventDefault(); var err = $('recErr'); err.textContent = '';
    var ana = $('recAna').value.trim(), why = $('recWhy').value.trim();
    if (ana.length < 2) { err.textContent = 'Nama analis wajib diisi (2 sampai 80 karakter).'; $('recAna').focus(); return; }
    if (!why) { err.textContent = 'Alasan perubahan wajib diisi.'; $('recWhy').focus(); return; }
    try { sessionStorage.setItem(ANA_KEY, ana); } catch (x) { /* tanpa penyimpanan sesi */ }
    var t = S.data.table, base = '/api/record/tables/' + t.name + '/rows', c = collect(), req;
    if (E.mode === 'insert') req = api('POST', base, { analyst_name: ana, reason: why, values: c.values });
    else if (E.mode === 'update') { if (!Object.keys(c.values).length) { err.textContent = 'Tidak ada kolom yang diubah.'; return; } req = api('PATCH', base + '/' + E.row.pk[t.pk[0]], { analyst_name: ana, reason: why, row_token: E.row.token, changes: c.values }); }
    else req = api('POST', base + '/' + E.row.pk[t.pk[0]] + '/' + E.mode, { analyst_name: ana, reason: why, row_token: E.row.token });
    $('recSave').disabled = true;
    req.then(function (r) {
      $('recSave').disabled = false;
      if (r.status >= 200 && r.status < 300) { dlg.close(); load().then(function () { say('Tersimpan. Perubahan tercatat di jejak audit (nama analis: ' + ana + ').'); }); return; }
      if (r.status === 409 && r.j && r.j.current) { E.row = r.j.current; err.textContent = 'Baris berubah sejak dibuka (oleh pengguna lain). Nilai terbaru sudah dimuat ke isian; periksa, ulangi perubahan Anda, lalu simpan lagi.'; Object.keys(E.fields).forEach(function (k) { var f = E.fields[k]; f.orig = E.row.c[k]; if (f.spec.t === 'bool') f.el.value = f.orig ? 'true' : 'false'; else f.el.value = f.orig == null ? '' : String(f.orig); }); return; }
      err.textContent = (r.j && r.j.error ? r.j.error : 'Gagal menyimpan') + (r.j && r.j.details ? ': ' + r.j.details.join('; ') : '');
    });
  });

  $('recTblFilter').addEventListener('input', function () { renderList(this.value); });
  window.addEventListener('hashchange', load);
  api('GET', '/api/record/tables').then(function (r) {
    if (r.status !== 200) { main.textContent = ''; main.appendChild(h('div', { class: 'rec-note bad', role: 'alert', text: r.j && r.j.error ? r.j.error : 'Gagal memuat daftar tabel' })); return; }
    S.tables = r.j.tables; renderList(''); load();
  });
})();
