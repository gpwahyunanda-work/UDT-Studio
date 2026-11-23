/* UDT Studio: tombol "Kirim ke Compiler" setelah Langkah 5 (F4c, arahan INDRA 23 Nov: Studio menulis, Compiler membaca).
   - Kait tunggal: skrip ini; kartu disisipkan lewat DOM ke #p5, tidak mengubah isi p1..p5 (hash modules.lock tetap).
   - Membaca hasil Langkah 3/4 dengan fungsi ASLI di halaman (calcBatchWithStdMapping, evalSimilarityF2, classifyF2Outcome); tidak ada rumus f2 di sini.
   - Tombol TIDAK bergantung pada keberhasilan atau koneksi ekspor Google (keputusan Wahyu).
   - push_id idempoten disimpan per isi paket (sessionStorage); klik ganda aman. Teks dari server dirender sebagai teks. */
(function () {
  'use strict';
  var p5 = document.getElementById('p5');
  if (!p5) return;
  var VALID_CODES = ['Release', '1,2', '4,5', '6,8', 'Air', '1,0', '7,2', '7,5'];
  var busy = false;

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k.slice(0, 2) === 'on') e[k] = attrs[k]; else if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function api(method, path, body) {
    return fetch(path, { method: method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; }); });
  }
  var num = function (x) { return typeof x === 'number' && isFinite(x) ? x : null; };
  var isoOk = function (s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; };

  // ---------- baca hasil Langkah 3/4 -> paket ----------
  function parseProduct(name) {
    var m = /(\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|g|iu|%)(?:\s*\/\s*\d*\s*(?:ml|mg|g))?)/i.exec(name || '');
    if (!m) return { product_name: (name || '').trim(), strength: '', dosage_form: '' };
    return { product_name: name.slice(0, m.index).trim(), strength: m[1].replace(/\s+/g, ' ').trim(), dosage_form: name.slice(m.index + m[0].length).trim() };
  }
  function readStudio() {
    var skipped = [], mediums = [], runs = [], comparisons = [];
    if (typeof S === 'undefined' || !S.model) return { error: 'Belum ada data. Selesaikan Langkah 1 sampai 4 dulu.' };
    var ids = sortedMediaIds(S.model);
    ids.forEach(function (mId) {
      var M = S.model.media[mId], cfg = getMedConfig(mId), label = formatMedLabel(mId, cfg);
      if (VALID_CODES.indexOf(cfg.code) < 0) { skipped.push(label + ': kode medium tidak dikenal, tidak dikirim'); return; }
      if (readiness(mId).length) { skipped.push(label + ': ' + readiness(mId).join('; ')); return; }
      var refNames = Object.keys(M.refBatches), testNames = Object.keys(M.testBatches);
      var minutesIdx = [], minutes = [];
      M.times.forEach(function (t, i) { if (t > 0) { minutesIdx.push(i); minutes.push(t); } });
      mediums.push({ code: cfg.code, full_name: formatMedDesc(mId, cfg), volume_text: S.testParams.volMedia ? S.testParams.volMedia + ' ml' : null, apparatus: S.condParams.apparatus || null, rpm_text: S.condParams.rpm || null, method: S.condParams.instrument || null, method_ref: S.condParams.methodRef || null });
      var calcs = {};
      function addRun(batch, role) {
        var P = role === 'reference' ? S.refParams : S.testParams;
        var calc = calcBatchWithStdMapping(mId, M, batch, role === 'reference' ? 'ref' : 'test', P);
        if (!calc || calc.error || !calc.res) { skipped.push(label + ' ' + batch + ': ' + (calc && calc.error ? calc.error : 'tidak dapat dihitung')); return null; }
        var values = [];
        calc.res.forEach(function (row, v) { if (!row) return; var arr = minutesIdx.map(function (i) { return num(row[i]); }); if (arr.some(function (x) { return x !== null; })) values.push({ no: v + 1, values: arr }); });
        if (!values.length) { skipped.push(label + ' ' + batch + ': tidak ada nilai vessel'); return null; }
        var key = cfg.code + '|' + role + '|' + batch;
        runs.push({ key: key, medium_code: cfg.code, brand_name: (P.product || (role === 'reference' ? 'Produk Pembanding' : 'Produk Uji')).trim(), batch_no: batch, role: role, variant: '', test_date: isoOk(P.runDate || (typeof todayISO === 'function' ? todayISO() : '')), manufacturer_site: P.manufacturer || null, note: null, is_valid: true, invalid_reason: null, timepoints: minutes, values: values });
        calcs[key] = calc; return key;
      }
      var refKeys = refNames.map(function (b) { return addRun(b, 'reference'); });
      var refKey = refKeys[0] || null;
      testNames.forEach(function (b) {
        var tk = addRun(b, 'uji'); if (!tk || !refKey) return;
        var rC = calcs[refKey], tC = calcs[tk];
        var f = evalSimilarityF2(M.times, rC.stats.map(function (x) { return x.avg; }), tC.stats.map(function (x) { return x.avg; }), rC.stats, tC.stats);
        var out = classifyF2Outcome(f);
        if (!isFinite(f.f2) || out.code === 'na') return;
        var pts = [], total = 0;
        for (var i = 0; i < f.n; i++) { var d = f.usedRef[i] - f.usedTest[i]; pts.push({ seq: i + 1, sq_diff: d * d }); total += d * d; }   // (Rt-Tt)^2 untuk audit; f2 tetap dari Langkah 4
        comparisons.push({ testKey: tk, refKey: refKey, total_sq: total, n_points: f.n, f2: f.f2, conclusion_code: out.code, conclusion_printed: out.statusText, points: pts });
      });
    });
    var prod = (S.testParams.product || '').trim();
    return { pkg: { mediums: mediums, runs: runs, comparisons: comparisons }, skipped: skipped, product: parseProduct(prod), api: (S.condParams.api || '').trim() };
  }

  // ---------- push_id idempoten ----------
  function digest(text) {
    if (!(window.crypto && crypto.subtle && crypto.subtle.digest)) return Promise.resolve(null);
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); });
  }
  function newUuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function pushIdFor(payloadText) {
    return digest(payloadText).then(function (h) {
      if (!h) return newUuid();
      var k = 'udt_push_' + h, v = null;
      try { v = sessionStorage.getItem(k); if (!v) { v = newUuid(); sessionStorage.setItem(k, v); } } catch (e) { v = v || newUuid(); }
      return v;
    });
  }

  // ---------- dialog ----------
  var CSS = '.udtx-back{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10050;display:flex;align-items:center;justify-content:center;padding:12px}' +
    '.udtx-dlg{background:#fff;color:#202729;border-radius:10px;max-width:980px;width:100%;max-height:92vh;overflow:auto;padding:18px 20px;font:14px/1.5 system-ui,Arial,sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.3)}' +
    '.udtx-dlg h2{margin:0 0 8px;font-size:18px}.udtx-dlg table{border-collapse:collapse;width:100%;margin:8px 0}.udtx-dlg th,.udtx-dlg td{border-bottom:1px solid #D9D9D9;padding:5px 8px;text-align:left}' +
    '.udtx-dlg td.n{text-align:right;font-variant-numeric:tabular-nums}.udtx-dlg label{display:block;margin:6px 0 2px;font-weight:600}.udtx-dlg input,.udtx-dlg select{padding:6px 8px;border:1px solid #8A949B;border-radius:4px;max-width:100%}' +
    '.udtx-dlg button{padding:7px 16px;border-radius:5px;border:1px solid #0064A2;background:#fff;color:#0064A2;cursor:pointer;font-weight:600}.udtx-dlg button.p{background:#0064A2;color:#fff}.udtx-dlg button:disabled{opacity:.5;cursor:not-allowed}' +
    '.udtx-dlg :focus-visible{outline:3px solid #0064A2;outline-offset:2px}.udtx-err{color:#b00020}.udtx-ok{color:#00693A}.udtx-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}.udtx-small{font-size:12px;color:#4F5D66}';
  document.head.appendChild(el('style', { text: CSS }));

  function open() {
    if (busy) return;
    var st = readStudio();
    var back = el('div', { 'class': 'udtx-back' }), dlg = el('div', { 'class': 'udtx-dlg', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'udtx-h' });
    back.appendChild(dlg); document.body.appendChild(back);
    var esc = function (e) { if (e.key === 'Escape') close(); };
    var close = function () { if (busy) return; back.remove(); document.removeEventListener('keydown', esc); btn.focus(); };
    document.addEventListener('keydown', esc);
    dlg.appendChild(el('h2', { id: 'udtx-h', text: 'Kirim ke UDT Compiler' }));
    var body = el('div'); dlg.appendChild(body);
    if (st.error || !st.pkg.runs.length) {
      body.appendChild(el('p', { 'class': 'udtx-err', role: 'alert', text: st.error || 'Tidak ada run yang dapat dikirim.' }));
      (st.skipped || []).forEach(function (s) { body.appendChild(el('p', { 'class': 'udtx-small', text: s })); });
      body.appendChild(el('div', { 'class': 'udtx-row' }, [el('button', { type: 'button', text: 'Tutup', onclick: close })]));
      return;
    }
    ensureSession(body).then(function (ok) { if (ok) form(st, body, close); });
  }

  function ensureSession(body) {
    return api('GET', '/api/me').then(function (r) {
      if (r.status === 200 && r.body.role === 'penulis' && r.body.analyst) return true;
      if (r.status === 200 && r.body.role === 'pembaca') { body.appendChild(el('p', { 'class': 'udtx-err', role: 'alert', text: 'Akun ini berperan pembaca (Compiler). Masuk sebagai penulis untuk mengirim.' })); return false; }
      return new Promise(function (resolve) {
        var loggedIn = r.status === 200;
        var pw = el('input', { type: 'password', id: 'udtx-pw', autocomplete: 'current-password' }), nm = el('input', { type: 'text', id: 'udtx-nm', maxlength: '80', autocomplete: 'name' }), err = el('p', { 'class': 'udtx-err', role: 'alert' });
        var wrap = el('div', {}, [el('p', { text: 'Masuk dulu untuk mengirim data (kata sandi penulis).' }),
          loggedIn ? null : el('label', { 'for': 'udtx-pw', text: 'Kata sandi penulis' }), loggedIn ? null : pw,
          el('label', { 'for': 'udtx-nm', text: 'Nama Anda (tercatat sebagai pengirim)' }), nm, err,
          el('div', { 'class': 'udtx-row' }, [el('button', { 'class': 'p', type: 'button', text: 'Masuk', onclick: function () {
            var step = loggedIn ? Promise.resolve({ status: 200, body: { role: 'penulis' } }) : api('POST', '/api/auth/login', { password: pw.value });
            step.then(function (l) { if (l.status !== 200) { err.textContent = l.body.error || 'Masuk gagal'; return null; } if (l.body.role === 'pembaca') { err.textContent = 'Kata sandi ini berperan pembaca; gunakan kata sandi penulis.'; return null; } return api('PUT', '/api/me/analyst', { name: nm.value }); })
              .then(function (a) { if (!a) return; if (a.status !== 200) { err.textContent = a.body.error || 'Nama tidak diterima'; return; } wrap.remove(); resolve(true); });
          } })])]);
        body.appendChild(wrap);
      });
    }).catch(function () { body.appendChild(el('p', { 'class': 'udtx-err', role: 'alert', text: 'Server Compiler tidak terjangkau. Ekspor Google tetap bisa dipakai; coba kirim lagi nanti.' })); return false; });
  }

  function form(st, body, close) {
    var pkg = st.pkg, prod = st.product, decisions = {}, classes = {};
    var sel = el('select', { id: 'udtx-prod' }), sku = el('input', { type: 'text', id: 'udtx-sku', maxlength: '60' });
    var f1 = el('input', { type: 'text', id: 'udtx-n', value: prod.product_name }), f2 = el('input', { type: 'text', id: 'udtx-s', value: prod.strength }), f3 = el('input', { type: 'text', id: 'udtx-f', value: prod.dosage_form });
    var newBox = el('div', {}, [el('p', { 'class': 'udtx-small', text: 'Produk baru dibuat dari ringkasan (nama, kekuatan, bentuk sediaan dari Langkah 3). Periksa isinya.' }), el('label', { 'for': 'udtx-n', text: 'Nama produk' }), f1, el('label', { 'for': 'udtx-s', text: 'Kekuatan' }), f2, el('label', { 'for': 'udtx-f', text: 'Bentuk sediaan' }), f3]);
    var info = el('div', { 'aria-live': 'polite' }), status = el('p', { role: 'status', 'aria-live': 'polite' }), go = el('button', { 'class': 'p', type: 'button', text: 'Kirim ke Compiler' }), cancel = el('button', { type: 'button', text: 'Batal', onclick: close });
    var rows = pkg.runs.map(function (r) {
      var cmp = pkg.comparisons.filter(function (c) { return c.testKey === r.key; })[0], vin = el('input', { type: 'text', maxlength: '120', 'aria-label': 'Varian ' + r.batch_no, size: '10' });
      vin.oninput = function () { r.variant = vin.value.trim(); refresh(); };
      var stCell = el('td');
      return { r: r, stCell: stCell, tr: el('tr', {}, [el('td', { text: r.role === 'reference' ? 'Pembanding' : 'Uji' }), el('td', { text: r.brand_name }), el('td', { text: r.batch_no }), el('td', {}, [vin]), el('td', { text: r.medium_code === 'Release' ? 'Release' : 'pH ' + r.medium_code }), el('td', { text: r.test_date || 'kosong' }), el('td', { 'class': 'n', text: String(r.values.length) }), el('td', { 'class': 'n', text: cmp ? cmp.f2.toFixed(1).replace('.', ',') : '–' }), el('td', { text: cmp ? cmp.conclusion_printed : '–' }), stCell]) };
    });
    body.appendChild(el('table', {}, [el('caption', { 'class': 'udtx-small', text: 'Ringkasan data yang akan dikirim (hasil Langkah 4, tidak dihitung ulang di sini)' }), el('thead', {}, [el('tr', {}, ['Peran', 'Produk', 'Batch', 'Varian', 'Medium', 'Tanggal', 'Vessel', 'f2', 'Kesimpulan', 'Status'].map(function (h) { return el('th', { scope: 'col', text: h }); }))]), el('tbody', {}, rows.map(function (x) { return x.tr; }))]));
    if (st.skipped.length) body.appendChild(el('div', { 'class': 'udtx-small' }, [el('strong', { text: 'Tidak ikut dikirim:' })].concat(st.skipped.map(function (s) { return el('div', { text: '• ' + s }); }))));
    body.appendChild(el('label', { 'for': 'udtx-prod', text: 'Produk (Compile)' })); body.appendChild(sel);
    body.appendChild(el('label', { 'for': 'udtx-sku', text: 'Kode project / SKU (opsional; dipakai untuk mencocokkan produk)' })); body.appendChild(sku);
    body.appendChild(newBox); body.appendChild(info);
    body.appendChild(el('div', { 'class': 'udtx-row' }, [go, cancel])); body.appendChild(status);

    function setStatusCells(map) { rows.forEach(function (x) { var s = map ? map[x.r.key] : null; x.stCell.textContent = s ? ({ baru: 'Baru', sama_persis: 'Sudah ada (dilewati)', terhapus: 'Pernah dihapus (dilewati)', bentrok: 'Bentrok' })[s] || s : ''; }); }
    function conflictUI(keys) {
      info.replaceChildren();
      if (!keys.length) return;
      info.appendChild(el('p', { 'class': 'udtx-err', role: 'alert', text: 'Run ini sudah ada dengan data berbeda. Pilih tindakan untuk tiap run:' }));
      keys.forEach(function (k) {
        var r = pkg.runs.filter(function (x) { return x.key === k; })[0], g = 'dec-' + k.replace(/\W/g, '_');
        var opts = [['timpa', 'Timpa (yang lama disembunyikan, tetap tercatat)'], ['ulang', 'Simpan sebagai run ulang (keduanya dipakai)'], ['batal', 'Batal (jangan kirim run ini)']].map(function (o) {
          var i = el('input', { type: 'radio', name: g, value: o[0] }); i.onchange = function () { decisions[k] = o[0]; refresh(); }; if (decisions[k] === o[0]) i.checked = true;
          return el('label', { style: 'display:inline-block;margin-right:12px;font-weight:400' }, [i, ' ' + o[1]]);
        });
        info.appendChild(el('fieldset', {}, [el('legend', { text: r.brand_name + ' ' + r.batch_no + (r.variant ? ' ' + r.variant : '') + ' (' + (r.medium_code === 'Release' ? 'Release' : 'pH ' + r.medium_code) + ')' })].concat(opts)));
      });
    }
    function newMode() { return sel.value === '__new__'; }
    function refresh() {
      newBox.style.display = newMode() ? '' : 'none';
      var unresolved = Object.keys(classes).filter(function (k) { return classes[k] === 'bentrok' && !decisions[k]; });
      go.disabled = busy || unresolved.length > 0 || (newMode() && !(f1.value.trim() && f2.value.trim() && f3.value.trim()));
    }
    function loadPreview() {
      classes = {}; setStatusCells(null); info.replaceChildren();
      if (newMode()) { refresh(); return Promise.resolve(); }
      return api('POST', '/api/ingest/preview', Object.assign({ compile_id: Number(sel.value) }, pkg)).then(function (r) {
        if (r.status !== 200) { status.className = 'udtx-err'; status.textContent = r.body.error ? r.body.error + (r.body.details ? ': ' + r.body.details.join('; ') : '') : 'Pratinjau gagal'; return; }
        status.className = ''; status.textContent = '';
        var map = {}; r.body.runs.forEach(function (x) { map[x.key] = x.status; classes[x.key] = x.status; });
        setStatusCells(map); conflictUI(Object.keys(classes).filter(function (k) { return classes[k] === 'bentrok'; })); refresh();
      });
    }
    sel.onchange = function () { decisions = {}; loadPreview(); }; [f1, f2, f3].forEach(function (i) { i.oninput = refresh; });
    var q = function (code, a, b, c) { return '/api/compiles/match?' + new URLSearchParams({ code: code, product: a, strength: b, form: c }); };

    Promise.all([api('GET', '/api/compiles'), api('GET', q('', prod.product_name, prod.strength, prod.dosage_form))]).then(function (rs) {
      (rs[0].body.compiles || []).forEach(function (c) { sel.appendChild(el('option', { value: String(c.compile_id), text: c.title + (c.project_code ? ' [' + c.project_code + ']' : '') })); });
      sel.appendChild(el('option', { value: '__new__', text: '+ Produk baru dari ringkasan' }));
      var cand = (rs[1].body.candidates || [])[0]; sel.value = cand ? String(cand.compile_id) : '__new__';
      if (cand) info.appendChild(el('p', { 'class': 'udtx-ok', text: 'Produk cocok dipilih otomatis (' + cand.matched_by + '). Anda tetap dapat mengganti.' }));
      return loadPreview();
    }).catch(function () { status.className = 'udtx-err'; status.textContent = 'Daftar produk tidak dapat dimuat.'; });
    sku.onchange = function () {   // kode project/SKU: cari kandidat dengan kunci produk
      api('GET', q(sku.value.trim(), prod.product_name, prod.strength, prod.dosage_form)).then(function (r) {
        var c = (r.body.candidates || [])[0]; if (c) { sel.value = String(c.compile_id); loadPreview(); }
      });
    };

    go.onclick = function () {
      if (busy) return; busy = true; go.disabled = true; cancel.disabled = true; status.className = ''; status.textContent = 'Mengirim…';
      var fail = function (m) { busy = false; cancel.disabled = false; status.className = 'udtx-err'; status.textContent = m; refresh(); };
      var ensureCompile = newMode()
        ? api('POST', '/api/compiles', { product_name: f1.value.trim(), strength: f2.value.trim(), dosage_form: f3.value.trim(), api: st.api || undefined, project_code: sku.value.trim() || undefined }).then(function (r) {
            if (r.status === 201) return r.body.compile_id;
            if (r.status === 409) return api('GET', q(sku.value.trim(), f1.value.trim(), f2.value.trim(), f3.value.trim())).then(function (m) { var c = (m.body.candidates || [])[0]; if (c) return c.compile_id; throw new Error(r.body.error || 'Produk bentrok'); });
            throw new Error(r.body.error || 'Produk baru gagal dibuat');
          })
        : Promise.resolve(Number(sel.value));
      ensureCompile.then(function (cid) {
        var payload = Object.assign({ compile_id: cid }, pkg), text = JSON.stringify(payload) + JSON.stringify(decisions);
        return pushIdFor(text).then(function (pid) { return api('POST', '/api/ingest/commit', { push_id: pid, decisions: decisions, package: payload }); });
      }).then(function (r) {
        if (r.status !== 200 && r.status !== 201) return fail((r.body.error || 'Gagal mengirim') + (r.body.details ? ': ' + r.body.details.join('; ') : '') + (r.body.conflicts ? ' (pilih tindakan untuk run bentrok)' : ''));
        busy = false; var c = r.body.counts || {};
        status.className = 'udtx-ok'; status.textContent = (r.body.replay ? 'Sudah pernah terkirim (kirim ulang aman, tidak digandakan). ' : 'Terkirim. ') + Object.keys(c).map(function (k) { return k + ': ' + c[k]; }).join(', ');
        var w = r.body.warnings || []; if (w.length) body.appendChild(el('p', { 'class': 'udtx-small', text: w.length + ' peringatan mutu data akan tampil di Compiler.' }));
        body.appendChild(el('div', { 'class': 'udtx-row' }, [el('a', { href: '/compiler', target: '_blank', rel: 'noopener', text: 'Buka Compiler' }), el('button', { type: 'button', text: 'Tutup', onclick: function () { cancel.disabled = false; close(); } })]));
      }).catch(function (e) { fail(e && e.message ? e.message : 'Server Compiler tidak terjangkau. Coba lagi; kirim ulang aman.'); });
    };
    refresh();
  }

  // ---------- kartu di Langkah 5 ----------
  var btn = el('button', { 'class': 'btn primary', id: 'udtSendBtn', type: 'button', text: 'Kirim ke Compiler', onclick: open });
  var card = el('div', { 'class': 'card', id: 'udtSendCard' }, [
    el('h2', { text: 'Kirim ke UDT Compiler' }),
    el('p', { 'class': 'muted small', text: 'Kirim hasil Langkah 4 ke basis data Compiler. Tidak bergantung pada ekspor Google di atas; boleh dikirim walau ekspor belum atau gagal.' }),
    el('div', { 'class': 'row', style: 'gap:10px;flex-wrap:wrap;align-items:center' }, [btn, el('a', { href: '/compiler', target: '_blank', rel: 'noopener', 'class': 'link', text: 'Buka Compiler' })])
  ]);
  var nav = p5.querySelector('.nav');
  if (nav) p5.insertBefore(card, nav); else p5.appendChild(card);
})();
