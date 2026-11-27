/* UDT Compiler: UI dari HTML tim (Mockup_Langkah6_Compile_UDT_Vastrol_v3.html), tampilan/kelas/teks dipertahankan.
   Beda dari mockup: data berasal dari API (bukan var D tertanam); TIDAK ada rumus f2/statistik di sini (server yang menghitung:
   f2_sheet aturan tim dan f2_langkah4 modul asli); tombol dan isian tersambung ke server (docs/KONTRAK_API_COMPILER.md). Teks dari server dirender lewat esc(). */
(function () {
'use strict';
var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
// F14: penanda grafik STABIL per batch. Indeks = urutan masuk (tertua = 0; data baru tidak menggeser yang lama): warna = indeks mod 8, bentuk = (indeks + indeks div 8) mod 4 -> 32 kombinasi unik. Tidak bergantung urutan klik/centang.
var SLOT = ['#0064A2', '#B85C00', '#2E7D32', '#8E24AA', '#C62828', '#00838F', '#6E7387', '#9A7B00'];
var FIRST3 = ['1,2', '4,5', '6,8'];
var IC = {
  sim: '<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  rap: '<svg width="13" height="13" viewBox="0 0 16 16" role="img" aria-label="Sangat cepat (f2 hanya informasi)"><path d="M3 4l4.2 4L3 12M8.5 4l4.2 4-4.2 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  not: '<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  inv: '<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 8h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
};
var KT = { sim: 'Similar', rap: 'Similar (sangat cepat, f2 hanya informasi)', not: 'Not Similar' };
var WARN = '<svg width="15" height="15" viewBox="0 0 16 16" role="img" aria-label="Ada peringatan"><path d="M8 1.8L15 14H1z" fill="#FFF7C2" stroke="#5C4A00" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 6.2v3.6" stroke="#5C4A00" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.9" r=".9" fill="#5C4A00"/></svg>';
var okIcon = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style="flex:none;margin-top:2px"><circle cx="8" cy="8" r="7" fill="#E6F0F6"/><path d="M4.5 8.4l2.4 2.4 4.6-4.8" fill="none" stroke="#004B7A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var warnIcon = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style="flex:none;margin-top:2px"><path d="M8 1.8L15 14H1z" fill="#FFF7C2" stroke="#5C4A00" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 6.2v3.6" stroke="#5C4A00" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.9" r=".9" fill="#5C4A00"/></svg>';
var infoIcon = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style="flex:none;margin-top:2px"><circle cx="8" cy="8" r="7" fill="#EFEFEF"/><path d="M8 7.2v4" stroke="#353744" stroke-width="1.7" stroke-linecap="round"/><circle cx="8" cy="4.9" r=".95" fill="#353744"/></svg>';
var TONE = { warn: 'background:var(--pharos-yellow-tint);color:var(--pharos-warn-ink)', bad: 'background:var(--pharos-red-tint);color:var(--pharos-red)', info: 'background:var(--pharos-gray);color:var(--pharos-slate)' };
var INP_ON = 'width:100%;height:36px;padding:0 8px;border:1px solid var(--pharos-control);border-radius:var(--pharos-radius);background:var(--pharos-white);font-size:13px;text-align:right;font-variant-numeric:tabular-nums;color:var(--pharos-ink)';
var INP_OFF = 'width:100%;height:36px;padding:0 8px;border:1px solid var(--pharos-line);border-radius:var(--pharos-radius);background:var(--pharos-gray-soft);font-size:13px;text-align:right';
var INP_ZERO = INP_ON + ';background:var(--pharos-gray-soft);color:var(--pharos-muted)';
var TD_STAT = 'padding:6px 8px;text-align:right;font-variant-numeric:tabular-nums;font-size:13px;';
var TH_COL = 'padding:6px 3px;font-weight:600;font-size:12px;color:var(--pharos-slate);text-align:center';

function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function fdate(s) { var p = s.split('-'); return Number(p[2]) + ' ' + MON[parseInt(p[1], 10) - 1] + ' ' + p[0]; }
function fmt(x, d) { return (typeof x === 'number' && isFinite(x)) ? x.toFixed(d == null ? 1 : d).replace('.', ',') : '–'; }
// F12: nama analis/pemeriksa DIKETIK pengguna; diingat per sesi peramban (sessionStorage), tetap bisa diubah. Dikirim pada tiap simpan/impor/ubah/hapus/pulihkan (server menolak kosong: 400).
var ANA_KEY = 'udt_analyst', WRITE_ANA = /^\/api\/(products|products\/\d+\/runs|compiles\/\d+\/aliases|runs\/\d+|runs\/\d+\/(delete|restore)|imports\/xlsx|ingest\/commit)(\?.*)?$/;
function anaStored() { try { return sessionStorage.getItem(ANA_KEY) || ''; } catch (e) { return ''; } }
function anaStore(v) { try { sessionStorage.setItem(ANA_KEY, String(v == null ? '' : v)); } catch (e) { /* tanpa penyimpanan sesi */ } }
function anaValid(v) { v = String(v == null ? '' : v).trim().replace(/ {2,}/g, ' '); var n = Array.from(v).length; return n >= 2 && n <= 80 && !/[\u0000-\u001f\u007f-\u009f]/.test(v) ? v : ''; }
function api(method, path, body, raw) {
  var h = {}, b;
  if (method !== 'GET' && WRITE_ANA.test(path) && anaValid(anaStored())) { if (raw) raw.headers['x-analyst-name'] = encodeURIComponent(anaValid(anaStored())); else if (body) body.analyst_name = anaValid(anaStored()); }
  if (raw) { h = raw.headers; b = raw.body; } else if (body) { h['content-type'] = 'application/json'; b = JSON.stringify(body); }
  return fetch(path, { method: method, credentials: 'same-origin', headers: h, body: b }).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (j) { if (r.status === 401) { showLogin(); } if (r.status === 403 && j.must_change_password) { location.assign('/ganti-sandi'); } return { status: r.status, j: j }; });
  });
}
function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  var b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}

var ME = null, PRODUCTS = [], PID = null, D = null, INFO = null;
var st = { comp: null, sel: [], q: '', inc: 'valid', from: '', to: '', fresh: null, msg: '', med4: null, idx: {} };
function rankIdx() { var rows = D ? D.runs.filter(function (r) { return !r.comp; }) : [], o = {}; rows.forEach(function (r, i) { o[r.key] = rows.length - 1 - i; }); st.idx = o; return o; }
function sty(key) { var n = st.idx[key] || 0; return { color: SLOT[n % 8], shape: (n + Math.floor(n / 8)) % 4 }; }
function selOrdered() { var ord = D ? D.runs.map(function (r) { return r.key; }) : []; return st.sel.filter(function (k) { return ord.indexOf(k) >= 0; }).sort(function (a, b) { return ord.indexOf(a) - ord.indexOf(b); }); }

// ---------- dialog ----------
function dialog(title, bodyHtml, buttons, read) {
  return new Promise(function (resolve) {
    var root = $('dlgRoot'), back = document.createElement('div');
    back.style.cssText = 'position:fixed;inset:0;background:rgba(20,24,31,.5);z-index:100;display:flex;align-items:center;justify-content:center;padding:12px;font-family:var(--pharos-font)';
    var box = document.createElement('div'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', title);
    box.style.cssText = 'background:var(--pharos-white);border-radius:var(--pharos-radius);max-width:560px;width:100%;max-height:90vh;overflow:auto;padding:18px 20px;color:var(--pharos-ink);font-size:14px;line-height:1.45;box-shadow:0 0 0 1px var(--pharos-control)';
    box.innerHTML = '<h2 style="margin:0 0 10px;font-family:var(--pharos-font);font-size:18px;font-weight:600">' + esc(title) + '</h2><div id="dlgBody">' + bodyHtml + '</div><div id="dlgBtns" style="display:flex;flex-wrap:wrap;gap:10px;margin-top:16px;justify-content:flex-end"></div>';
    back.appendChild(box); root.appendChild(back);
    var opener = document.activeElement;   // F11 K-5: fokus kembali ke pemicu saat dialog ditutup
    function done(v) { document.removeEventListener('keydown', onKey); if (read) dialog.last = read(box); back.remove(); if (opener && opener.isConnected && opener.focus) opener.focus(); resolve(v); }
    function onKey(e) {
      if (!box.isConnected) return;
      if (e.key === 'Escape') { done(null); return; }
      if (e.key !== 'Tab') return;   // F11 K-5: focus trap; Tab dan Shift+Tab berputar di dalam dialog
      var f = Array.prototype.filter.call(box.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'), function (x) { return x.offsetParent !== null || x === document.activeElement; });
      if (!f.length) { e.preventDefault(); return; }
      var i = f.indexOf(document.activeElement);
      if (!box.contains(document.activeElement)) { e.preventDefault(); f[0].focus(); }
      else if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
    document.addEventListener('keydown', onKey);
    var first = null;
    buttons.forEach(function (b) {
      var el = document.createElement('button'); el.type = 'button'; el.textContent = b.text;
      el.style.cssText = 'min-height:44px;padding:0 18px;border-radius:var(--pharos-radius);font-weight:600;font-size:14px;cursor:pointer;' + (b.primary ? 'border:0;background:var(--pharos-blue);color:var(--pharos-white)' : 'border:1px solid var(--pharos-blue);background:var(--pharos-white);color:var(--pharos-blue)');
      el.addEventListener('click', function () { done(b.value); });
      $('dlgBtns').appendChild(el); if (!first || b.primary) first = el;
    });
    if (first) first.focus();
  });
}

// ---------- sesi (F10: masuk lewat halaman masuk server; di sini hanya membaca akun) ----------
function showView(name) {
  ['form', 'dashboard', 'users'].forEach(function (v) { $(v).style.display = v === name ? 'block' : 'none'; });
  $('topnav').style.display = 'block';
}
function showLogin() { ME = null; location.reload(); }   // sesi habis/dicabut: muat ulang = halaman masuk dari server
function okAna() {   // nama analis wajib diketik (2 sampai 80 karakter); disimpan di sesi peramban lalu dikirim api()
  var el = $('mg-ana') || $('f-ana'), v = anaValid(el ? el.value : anaStored());
  if (!v) return Promise.resolve({ status: 400, j: { error: 'Isi nama analis (2 sampai 80 karakter) dulu.' } });
  anaStore(v); return Promise.resolve({ status: 200, j: {} });
}

function isWriter() { return ME && (ME.role === 'penulis' || ME.role === 'admin'); }
function isAdmin() { return ME && ME.role === 'admin'; }
function boot() {
  api('GET', '/api/me').then(function (r) {
    if (r.status !== 200) { showLogin(); return; }
    ME = r.j;
    document.body.setAttribute('data-role', ME.role);
    $('navF').style.display = isWriter() ? '' : 'none';
    $('addRunLink').style.display = isWriter() ? 'inline-flex' : 'none';   // F15: '' menghapus inline-flex (teks naik ke atas tombol)
    $('rmBtn').style.display = isWriter() ? '' : 'none';
    return api('GET', '/api/products').then(function (p) {
      PRODUCTS = p.j.products || [];
      var q = new URLSearchParams(location.search).get('p'), saved = null;
      try { saved = sessionStorage.getItem('udt_prod'); } catch (x) { saved = null; }
      var pick = PRODUCTS.filter(function (x) { return String(x.id) === (q || saved); })[0] || PRODUCTS.filter(function (x) { return x.run_count > 0; })[0] || PRODUCTS[0];
      fillPicker(pick ? pick.id : null);
      if (pick) return selectProduct(pick.id); D = null; route();
    });
  }).catch(function (err) { try { console.error('boot', err); } catch (x) { /* abaikan */ } toast('Server tidak terjangkau.'); });
}
function fillPicker(id) {
  $('prodPick').innerHTML = PRODUCTS.map(function (p) { return '<option value="' + p.id + '"' + (p.id === id ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('');
}
$('prodPick').addEventListener('change', function () { selectProduct(Number($('prodPick').value)); });

function selectProduct(id) {
  PID = id; try { sessionStorage.setItem('udt_prod', String(id)); } catch (x) { /* abaikan */ }
  st.sel = []; st.q = ''; st.month = ''; st.fresh = null; $('q').value = '';
  return Promise.all([api('GET', '/api/products/' + id + '/dashboard'), isWriter() ? api('GET', '/api/products/' + id) : Promise.resolve({ status: 200, j: null })]).then(function (rs) {
    if (rs[0].status !== 200) { D = null; $('dashTitle').textContent = 'Compile profil disolusi'; $('dashApi').textContent = rs[0].j.error || 'Data tidak dapat dimuat.'; route(); return; }
    D = rs[0].j; INFO = rs[1].j;
    st.comp = D.comp_order[0] || null;
    rankIdx(); var rows = visibleRows(true); st.sel = rows.filter(function (r) { return anyValid(r); }).slice(0, 3).map(function (r) { return r.key; }); st.msg = ''; st.med4 = null;
    $('prodPick').value = String(id);
    fillMonths(); fillForm();
    route();
  });
}
function reloadDash() { return api('GET', '/api/products/' + PID + '/dashboard').then(function (r) { if (r.status === 200) { D = r.j; rankIdx(); if (!D.comps[st.comp]) st.comp = D.comp_order[0] || null; fillMonths(); } }); }

// ---------- dashboard ----------
function runBy(k) { for (var i = 0; i < D.runs.length; i++) { if (D.runs[i].key === k) return D.runs[i]; } return null; }
function anyValid(r) { return Object.keys(r.prof).some(function (m) { return r.prof[m].valid; }); }
function visibleRows(skipQ) {
  return D.runs.filter(function (r) { return !r.comp; }).filter(function (r) {
    if (st.inc === 'valid' && !anyValid(r)) return false;
    if ((st.from || st.to) && !(r.dates || [r.date]).some(function (d) { return d && (!st.from || d >= st.from) && (!st.to || d <= st.to); })) return false;
    if (!skipQ && st.q && r.key.toLowerCase().indexOf(st.q.toLowerCase()) < 0) return false;
    return true;
  });
}
function fillMonths() {   // F23: batas rentang = tanggal uji terawal dan terbaru di SELURUH data (semua medium); bawaan kosong = mencakup semua
  var p = D.product, f = $('dt-from'), t = $('dt-to');
  [f, t].forEach(function (x) { x.min = p.date_min || ''; x.max = p.date_max || ''; });
  f.value = st.from; t.value = st.to;
  f.title = t.title = p.date_min ? 'Data uji: ' + fdate(p.date_min) + ' – ' + fdate(p.date_max) : 'Belum ada tanggal uji';
}
function shapePath(sh, x, y, r) {
  var f = function (n) { return n.toFixed(1); };
  if (sh === 0) return 'M' + f(x - r) + ' ' + f(y) + 'a' + r + ' ' + r + ' 0 1 0 ' + f(2 * r) + ' 0a' + r + ' ' + r + ' 0 1 0 ' + f(-2 * r) + ' 0z';
  if (sh === 1) return 'M' + f(x - r) + ' ' + f(y - r) + 'h' + f(2 * r) + 'v' + f(2 * r) + 'h' + f(-2 * r) + 'z';
  if (sh === 2) return 'M' + f(x) + ' ' + f(y - r * 1.2) + 'L' + f(x + r * 1.1) + ' ' + f(y + r * 0.9) + 'L' + f(x - r * 1.1) + ' ' + f(y + r * 0.9) + 'z';
  return 'M' + f(x) + ' ' + f(y - r * 1.25) + 'L' + f(x + r * 1.25) + ' ' + f(y) + 'L' + f(x) + ' ' + f(y + r * 1.25) + 'L' + f(x - r * 1.25) + ' ' + f(y) + 'z';
}
var HOLD = '<svg width="14" height="14" viewBox="0 0 16 16" role="img" aria-label="Ditahan saat impor"><path d="M5 3v10M11 3v10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
function cellHtml(c) { return '<div role="cell"><div class="cell ' + c.cls + '" title="' + esc(c.tip) + '">' + (c.kind === 'hold' ? HOLD : (c.kind ? IC[c.kind] : '')) + '<span>' + c.txt + '</span></div></div>'; }
function noticeHtml() {
  if (!st.fresh) return '';
  var f = st.fresh;
  return '<div role="status" style="border-radius:var(--pharos-radius);padding:12px 16px;font-size:13.5px;background:var(--pharos-blue-tint);border:1px solid var(--pharos-blue-line);color:var(--pharos-blue-dark)"><b>Run ' + esc(f.batch) + ' ' + esc(f.medName) + ' masuk database</b> dan sekarang tampil di dashboard' + (f.f2 !== null ? ' (f2 ' + fmt(f.f2) + ' · ' + esc(KT[f.kind] || '') + ')' : '') + '. Disimpan oleh ' + esc(f.ana) + '.</div>';
}
function render() {
  if (!D) { return; }
  rankIdx(); st.sel = selOrdered();
  var p = D.product;
  $('dashTitle').textContent = 'Compile profil disolusi — ' + p.name;
  $('dashApi').textContent = p.api ? (p.api_uncertain ? 'API belum pasti (sheet menulis ' + p.api + ')' : 'API ' + p.api) : '';
  var comp = D.comps[st.comp], other = null;
  D.comp_order.forEach(function (k) { if (!other && k !== st.comp) other = D.comps[k]; });
  var cRun = comp ? runBy(comp.key) : null, oRun = other ? runBy(other.key) : null, nNot = 0;
  var TM = D.times, maxT = TM[TM.length - 1] || 60;
  function detail(c) {   // F17: rincian sel = angka RESMI Langkah 4 (f2, status, n, Total); sheet lama dan hitung ulang tim hanya catatan pembanding
    var d = function (x) { return x == null ? '\u2013' : fmt(x); };
    var t = 'f2 ' + fmt(c.f2) + ' \u2014 ' + KT[c.k] + '\nLangkah 4 (resmi): n = ' + (c.n == null ? '\u2013' : c.n) + ', Total = ' + d(c.total);
    if (c.sheet) t += '\nCatatan: sheet lama mencetak f2 ' + fmt(c.sheet.f2) + ' (' + (KT[c.sheet.k] || '\u2013') + ', n = ' + (c.sheet.n == null ? '\u2013' : c.sheet.n) + ', Total = ' + d(c.sheet.total) + ')';
    t += '\nCatatan: hitung ulang tim (n = 3) f2 ' + fmt(c.f2s) + ' (' + (KT[c.ks] || '\u2013') + ')';
    if (c.cause) t += '\nPenyebab selisih: ' + c.cause;
    return t;
  }
  function cellOf(run, mid) { var m = (D.cells[st.comp] || {})[run.key]; return m ? m[mid] : null; }
  function cellsFor(run, count) {
    var out = [];
    D.media.forEach(function (m) {
      var pf = run.prof[m.id], cp = cRun && cRun.prof[m.id], c = (comp && cp && pf) ? cellOf(run, m.id) : null;
      if (pf && (pf.held || (cp && cp.held)) && run.key !== (comp && comp.key)) { out.push({ kind: 'hold', cls: 'k-pend', txt: '', tip: 'Ditahan saat impor: ' + (pf.held || cp.held) }); return; }
      if (!m.has || !pf || !cp || !c || run.key === (comp && comp.key)) { out.push({ kind: '', cls: 'k-none', txt: '\u2014', tip: m.has ? 'Tidak ada data' : 'Belum ada data ' + m.name }); return; }
      if (!pf.valid) {
        if (st.inc === 'valid') { out.push({ kind: '', cls: 'k-none', txt: '\u2014', tip: 'Run tidak valid (disembunyikan)' }); return; }
        out.push({ kind: 'inv', cls: 'k-inv', txt: fmt(c.f2), tip: 'Run tidak valid: ' + (run.invalid[m.id] || '') }); return;
      }
      if (count && c.k === 'not') nNot++;
      var fresh = st.fresh && st.fresh.key === run.key && st.fresh.mid === m.id;
      out.push({ kind: c.k, cls: 'k-' + c.k + (fresh ? ' newc' : ''), txt: fmt(c.f2), tip: detail(c) });
    });
    return out;
  }
  var all = visibleRows(true), rows = visibleRows(false), cellsByKey = {};
  all.forEach(function (r) { cellsByKey[r.key] = cellsFor(r, true); });
  $('compBtns').innerHTML = D.comp_order.map(function (id) { var c = D.comps[id], on = st.comp === id; return '<button type="button" class="seg' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-comp="' + esc(id) + '"><b>' + esc(c.name) + '</b><span>' + esc(c.lot) + '</span></button>'; }).join('');
  var big = "font-family:var(--pharos-font);font-weight:700;font-size:30px;line-height:1.1";
  var withData = D.media.filter(function (m) { return m.has; }).length, empty = D.media.filter(function (m) { return !m.has; }).map(function (m) { return m.name; });
  var fl = D.findings.filter(function (f) { return !f.comp || f.comp === st.comp; });
  $('stats').innerHTML = '<div><div style="' + big + '">' + all.length + '</div><div style="color:var(--pharos-muted);font-size:13px">batch ' + esc(p.name) + ' terkompilasi</div></div>' +
    '<div><div style="' + big + '">' + withData + ' <span style="font-size:18px;color:var(--pharos-muted)">dari ' + D.media.length + '</span></div><div style="color:var(--pharos-muted);font-size:13px">medium berisi data' + (empty.length ? ' (' + esc(empty.join(', ')) + ' kosong)' : '') + '</div></div>' +
    '<div><div style="' + big + ';color:var(--pharos-red)">' + nNot + '</div><div style="color:var(--pharos-muted);font-size:13px">hasil Not Similar terhadap ' + esc(comp ? comp.name : '–') + '</div></div>' +
    '<div><div style="' + big + ';color:var(--pharos-warn-ink)">' + fl.length + '</div><div style="color:var(--pharos-muted);font-size:13px">temuan perlu dicek (di bawah)</div></div>';
  $('notice').innerHTML = noticeHtml();
  $('mxTitle').textContent = 'Matriks f2 terhadap ' + (comp ? comp.name : '–');
  var heads = D.media.map(function (m, j) { var n = 0; all.forEach(function (r) { if (cellsByKey[r.key][j].kind === 'not') n++; }); return '<div role="columnheader"><div>' + esc(m.name) + '</div><div class="' + (n > 0 ? 'sum-not' : 'sum-ok') + '" style="font-weight:400;font-size:12px">' + (m.has ? n + ' Not Similar' : 'Tanpa data') + '</div></div>'; }).join('');
  var h = '<div role="row" class="rw hd"><div role="columnheader"><span style="position:absolute;left:-9999px">Tampilkan di grafik</span></div><div role="columnheader">Batch</div>' + heads + '<div role="columnheader"><span class="sr">Peringatan</span></div><div role="columnheader">Aksi</div></div>';
  if (comp) h += '<div role="row" class="rw pin"><div></div><div role="cell" style="padding:6px 8px 6px 21px"><div style="font-weight:600">' + esc(comp.name) + ' <span style="font-size:12px;background:var(--pharos-ink);color:var(--pharos-white);border-radius:var(--pharos-radius);padding:1px 6px;margin-left:4px">Aktif</span></div><div style="font-size:12px;color:var(--pharos-muted)">' + esc(comp.lot) + (comp.maker ? ' \u00b7 ' + esc(comp.maker) : '') + '</div></div>' + cellsFor(cRun, false).map(cellHtml).join('') + '<div></div><div></div></div>';
  if (other) h += '<div role="row" class="rw pin"><div></div><div role="cell" style="padding:6px 8px 6px 21px"><div style="font-weight:600">' + esc(other.name) + '</div><div style="font-size:12px;color:var(--pharos-muted)">Pembanding lain \u00b7 ' + esc(other.lot) + ' \u00b7 f2 terhadap yang aktif</div></div>' + cellsFor(oRun, false).map(cellHtml).join('') + '<div></div><div></div></div>';
  rows.forEach(function (r) {
    var on = st.sel.indexOf(r.key) >= 0, sy = sty(r.key), w = D.warn[r.key];
    h += '<div role="row" class="rw"><div role="cell"><label style="display:flex;align-items:center;justify-content:center;width:44px;height:48px;cursor:pointer"><input type="checkbox" data-key="' + esc(r.key) + '"' + (on ? ' checked' : '') + ' aria-label="Tampilkan ' + esc(r.key) + ' pada grafik" style="width:18px;height:18px;margin:0;cursor:pointer"></label></div>' +
      '<div role="cell" class="bcell"><div class="bname"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="' + (on ? shapePath(sy.shape, 7, 7, 4.2) : '') + '" fill="' + (on ? sy.color : 'transparent') + '"/></svg><span class="bcode">' + esc(r.code) + '</span></div>' + (r.variant ? '<div class="bvar"><span class="vchip">' + esc(r.variant) + '</span></div>' : '') + '<div class="bdate">' + (r.date ? fdate(r.date) : 'tanggal kosong') + '</div></div>' + cellsByKey[r.key].map(cellHtml).join('') +
      '<div role="cell" class="flagc">' + (w ? '<span title="' + esc(w) + '" style="display:inline-flex">' + WARN + '</span>' : '') + '</div>' +
      '<div role="cell" class="actc">' + (isWriter() ? '<button type="button" class="btn-s mg-btn" data-manage="' + esc(r.key) + '" aria-label="Kelola data uji ' + esc(r.key) + ' (ubah, hapus, jejak)">Kelola</button>' : '') + '</div></div>';
  });
  if (!rows.length) h += '<div style="padding:18px 16px;color:var(--pharos-muted)">' + (D.runs.length ? 'Tidak ada batch yang cocok dengan pencarian.' : 'Belum ada data. Tambahkan run lewat Tambah data run.') + '</div>';
  $('matrix').innerHTML = h; $('matrix').style.setProperty('--mc', String(D.media.length)); $('matrix').style.setProperty('--axw', isWriter() ? '72px' : '0px');
  var spl = document.querySelector('.split'); if (spl) spl.classList.toggle('wide', D.media.length > 4);   // F17: >4 medium = matriks lebar penuh di atas, grafik 2x2 di bawahnya
  $('mxNote').textContent = st.msg || ''; $('mxNote').setAttribute('data-warn', st.msg ? '1' : '0');
  var lg = '<span style="font-weight:600;font-family:var(--pharos-font);font-size:16px;margin-right:4px">Profil rerata, ' + withData + ' medium</span>' + (empty.length ? '<span style="color:var(--pharos-muted);font-size:13px">' + esc(empty.join(', ')) + ': belum ada data</span>' : '');
  if (comp) lg += '<span style="display:inline-flex;align-items:center;gap:6px"><svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true"><line x1="1" y1="5" x2="25" y2="5" stroke="#202729" stroke-width="3" stroke-linecap="round"/></svg>' + esc(comp.name) + ' (aktif)</span>';
  if (other) lg += '<span style="display:inline-flex;align-items:center;gap:6px"><svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true"><line x1="1" y1="5" x2="25" y2="5" stroke="#666666" stroke-width="2" stroke-dasharray="6 4" stroke-linecap="round"/></svg>' + esc(other.name) + '</span>';
  st.sel.forEach(function (k) { var r = runBy(k); if (!r) return; var sy = sty(k); lg += '<span style="display:inline-flex;align-items:center;gap:6px"><svg width="26" height="14" viewBox="0 0 26 14" aria-hidden="true"><line x1="1" y1="7" x2="25" y2="7" stroke="' + sy.color + '" stroke-width="2" stroke-linecap="round"/><path d="' + shapePath(sy.shape, 7, 7, 4.2) + '" transform="translate(6 0)" fill="' + sy.color + '" stroke="#FFFFFF" stroke-width="1"/></svg>' + esc(r.code) + (r.variant ? ' ' + esc(r.variant) : '') + '</span>'; });
  lg += '<span style="display:inline-flex;align-items:center;gap:6px;color:var(--pharos-muted)"><svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true"><line x1="1" y1="5" x2="25" y2="5" stroke="#8E9496" stroke-width="1" stroke-dasharray="2 3"/></svg>85%</span>';
  $('legend').innerHTML = lg;
  var W = 400, H = 250, ml = 44, mr = 16, mt = 12, mb = 46, pw = W - ml - mr, ph = H - mt - mb;
  function px(t) { return ml + t / maxT * pw; } function py(v) { return mt + (1 - v / 110) * ph; }
  function pts(a) { var o = []; TM.forEach(function (t, i) { if (a[i] !== null && a[i] !== undefined) o.push(px(t).toFixed(1) + ',' + py(a[i]).toFixed(1)); }); return o.join(' '); }
  var ticks = TM.filter(function (t) { return t === 0 || t % 10 === 0 || t === 45; });
  // F14: tepat 4 kartu 2x2. Tiga pertama = pH 1,2 / 4,5 / 6,8. Kartu keempat: Air bila ada data Air, selain itu Release bila ada data; bila keduanya ada = tab (bukan kartu kelima); bila tidak ada = kartu kosong berukuran sama.
  var firstThree = FIRST3.map(function (id) { return D.media.filter(function (m) { return m.id === id; })[0]; }).filter(Boolean);
  var rest = D.media.filter(function (m) { return FIRST3.indexOf(m.id) < 0; }), cand = rest.filter(function (m) { return m.has; });
  var m4 = cand.length ? (cand.filter(function (m) { return m.id === st.med4; })[0] || cand[0]) : (rest[0] || null);
  st.panelFn = panelHtml;
  function panelHtml(m, tabs) {
    var head = '<div class="ph"><div style="min-width:0"><h3>' + esc(m.name) + '</h3><div class="d">' + esc(m.desc) + '</div></div>' + (tabs || '') + '</div>';
    var art = '<article data-med="' + esc(m.id) + '">' + head;
    if (!m.has) return art + '<div class="plot empty"><div class="t">Belum ada data ' + esc(m.name) + ' untuk ' + esc(p.name) + '</div><div class="s">Kuadran ini terisi setelah satu run medium ' + esc(m.name) + ' ditambahkan.</div>' + (isWriter() ? '<a href="#form" data-addmed="' + esc(m.id) + '" style="display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border:1px solid var(--pharos-blue);border-radius:var(--pharos-radius);font-weight:600;font-size:13px;text-decoration:none">Tambah data ' + esc(m.name) + '</a>' : '') + '</div><div class="chips"></div></article>';
    var s = '<svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Profil disolusi rerata pada ' + esc(m.name) + '">';
    [0, 25, 50, 75, 100].forEach(function (v) { s += '<line class="gl" x1="' + ml + '" y1="' + py(v).toFixed(1) + '" x2="' + (W - mr) + '" y2="' + py(v).toFixed(1) + '"/><text class="tk te" x="' + (ml - 6) + '" y="' + (py(v) + 3.5).toFixed(1) + '">' + v + '</text>'; });
    ticks.forEach(function (t) { s += '<text class="tk tm" x="' + px(t).toFixed(1) + '" y="' + (mt + ph + 18) + '">' + t + '</text>'; });
    s += '<line class="thr" x1="' + ml + '" y1="' + py(85).toFixed(1) + '" x2="' + (W - mr) + '" y2="' + py(85).toFixed(1) + '"/>';
    s += '<text class="tk thr-t" x="' + (ml + 4) + '" y="' + (py(85) - 5).toFixed(1) + '" style="text-anchor:start">85%</text>';   // F15: label garis 85% (>= 12 px)
    var oP = oRun && oRun.prof[m.id], cP = cRun && cRun.prof[m.id], dots = '', chips = '';
    if (oP) s += '<polyline class="ln w2 d1" points="' + pts(oP.avg) + '" stroke="#666666"/>';
    if (cP) s += '<polyline class="ln w3" points="' + pts(cP.avg) + '" stroke="#202729"/>';
    st.sel.forEach(function (k) {
      var r = runBy(k), pf = r && r.prof[m.id], sy = sty(k); if (!pf || !cP || (!pf.valid && st.inc === 'valid')) return;
      s += '<polyline class="ln w2" points="' + pts(pf.avg) + '" stroke="' + sy.color + '"/>';
      TM.forEach(function (t, q) { if (q > 0 && pf.avg[q] !== null) dots += '<path class="dot" d="' + shapePath(sy.shape, px(t), py(pf.avg[q]), 3.6) + '" fill="' + sy.color + '"/>'; });
      var c = cellOf(r, m.id); if (!c) return;
      if (c.held) { chips += '<span class="chip k-pend" data-chip="' + esc(k) + '|' + esc(m.id) + '" title="Ditahan saat impor: ' + esc(c.held) + '"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="' + shapePath(sy.shape, 7, 7, 4.2) + '" fill="' + sy.color + '" stroke="#FFFFFF" stroke-width="1"/></svg>' + esc(r.code) + (r.variant ? ' ' + esc(r.variant) : '') + ' · ditahan</span>'; return; }   // F17 (F16-02): blok ditahan tanpa angka
      // F14: chip = nilai RESMI yang sama dengan matriks, ekspor, dan cetak (c.f2 = Langkah 4, F17).
      chips += '<span class="chip k-' + c.k + '" data-chip="' + esc(k) + '|' + esc(m.id) + '"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="' + shapePath(sy.shape, 7, 7, 4.2) + '" fill="' + sy.color + '" stroke="#FFFFFF" stroke-width="1"/></svg>' + esc(r.code) + (r.variant ? ' ' + esc(r.variant) : '') + ' \u00b7 ' + fmt(c.f2) + '</span>';
    });
    s += dots + '<text class="tk tm" x="' + (ml + pw / 2) + '" y="' + (H - 6) + '">Waktu (menit)</text></svg>';
    return art + '<div class="plot">' + s + '</div><div class="chips">' + chips + '</div></article>';
  }
  var tabs4 = cand.length > 1 ? '<div class="tabs" role="tablist" aria-label="Medium kuadran keempat">' + cand.map(function (m) { return '<button type="button" role="tab" data-med4="' + esc(m.id) + '" aria-selected="' + (m.id === m4.id) + '">' + esc(m.name) + '</button>'; }).join('') + '</div>' : '';
  $('panels').innerHTML = firstThree.map(function (m) { return panelHtml(m, ''); }).join('') + (m4 ? panelHtml(m4, tabs4) : '');
  $('chartNote').textContent = 'Angka pada label batch adalah f2 terhadap ' + (comp ? comp.name : '–') + '. Sumbu y: % terlarut rerata; sumbu x: menit.';
  $('flagBody').innerHTML = fl.length ? fl.map(function (f) {
    return '<tr class="flagrow"><td style="padding-left:16px;font-weight:600">' + esc(f.batch) + '</td><td>' + esc(f.medium) + '</td><td><span class="chip" style="' + (TONE[f.tone] || TONE.info) + '">' + esc(f.type) + '</span></td><td style="padding-right:16px">' + esc(f.text) + '</td></tr>';
  }).join('') : '<tr class="flagrow"><td colspan="4" style="padding-left:16px;color:var(--pharos-muted)">Tidak ada temuan.</td></tr>';
  var ex = ''; var lk = 'display:flex;align-items:center;min-height:40px;padding:0 12px;border-radius:var(--pharos-radius);color:var(--pharos-ink);text-decoration:none;font-size:13.5px';
  [['xlsx', 'Excel (.xlsx) \u2014 format sheet lama'], ['csv', 'CSV (.csv)'], ['tsv', 'TSV (.tsv)']].forEach(function (x) { ex += '<a role="menuitem" href="/api/products/' + PID + '/export?format=' + x[0] + '" style="' + lk + '">' + x[1] + '</a>'; });
  $('expMenu').innerHTML = ex;
}
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-comp]'); if (b) { st.comp = b.getAttribute('data-comp'); st.fresh = null; render(); return; }
  var t = e.target.closest('#expBtn');
  if (t) { var mn = $('expMenu'), open = mn.style.display !== 'flex'; mn.style.display = open ? 'flex' : 'none'; t.setAttribute('aria-expanded', open ? 'true' : 'false'); return; }
  if (!e.target.closest('#expMenu')) $('expMenu').style.display = 'none';
  var tb = e.target.closest('[data-med4]'); if (tb) { var id4 = tb.getAttribute('data-med4'); st.med4 = id4; render(); var nb = [].slice.call(document.querySelectorAll('[data-med4]')).filter(function (x) { return x.getAttribute('data-med4') === id4; })[0]; if (nb) nb.focus(); return; }
  var am = e.target.closest('[data-addmed]'); if (am) { st.wantMed = am.getAttribute('data-addmed'); }
});
document.addEventListener('change', function (e) {
  var k = e.target.getAttribute && e.target.getAttribute('data-key'); if (!k) return;
  var s = st.sel.slice(), i = s.indexOf(k), msg = '';
  if (i >= 0) s.splice(i, 1);
  else {
    if (s.length >= 4) {   // F14: batas 4; yang digeser = yang TERTUA menurut waktu masuk (bukan urutan klik)
      var ord = D.runs.map(function (r) { return r.key; }), old = s.slice().sort(function (a, b) { return ord.indexOf(b) - ord.indexOf(a); })[0];
      s.splice(s.indexOf(old), 1); msg = 'Grafik memuat paling banyak 4 batch. ' + old + ' (paling lama masuk) dilepas agar ' + k + ' tampil.';
    }
    s.push(k);
  }
  st.sel = s; st.msg = msg; st.fresh = null; render();
  var again = [].slice.call(document.querySelectorAll('input[data-key]')).filter(function (x) { return x.getAttribute('data-key') === k; })[0]; if (again) again.focus();
});
$('st').addEventListener('change', function (e) { st.inc = e.target.value; st.fresh = null; render(); });
$('q').addEventListener('input', function (e) { st.q = e.target.value; render(); });
['dt-from', 'dt-to'].forEach(function (id) { $(id).addEventListener('change', function (e) { st[id === 'dt-from' ? 'from' : 'to'] = e.target.value; st.fresh = null; render(); }); });

// ---------- F8: tampilan (terang/gelap), PNG, cetak, kelola run ----------
// F14: tombol Tampilan (terang/gelap) ada di bilah atas yang sama dengan Studio; perilakunya di /shell/shell.js.

// PNG grafik: semua panel medium + legenda digambar ulang di kanvas putih >= 1600 px (tema terang apa pun tampilan layar).
var PNG_CSS = '.gl{stroke:#D9DCDD;stroke-width:1}.thr{stroke:#8E9496;stroke-width:1;stroke-dasharray:2 3}.tk{font:14px Arial,sans-serif;fill:#4A4F55}.te{text-anchor:end}.tm{text-anchor:middle}.ln{fill:none;stroke-linejoin:round;stroke-linecap:round}.w3{stroke-width:3}.w2{stroke-width:2}.d1{stroke-dasharray:6 4}.dot{stroke:#fff;stroke-width:1}';
function svgText(x, y, size, weight, fill, txt, anchor) { return '<text x="' + x + '" y="' + y + '" font-family="Arial,sans-serif" font-size="' + size + '" font-weight="' + weight + '" fill="' + fill + '"' + (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + esc(txt) + '</text>'; }
function buildPngSvg() {
  var tmp = document.createElement('div'); tmp.innerHTML = D.media.filter(function (m) { return m.has; }).map(function (m) { return st.panelFn(m, ''); }).join('');   // F14: semua medium berdata (termasuk yang tersembunyi di tab)
  var arts = [].slice.call(tmp.querySelectorAll('article')).filter(function (a) { return a.querySelector('svg'); });
  if (!arts.length) return null;
  var comp = D.comps[st.comp], other = null; D.comp_order.forEach(function (k) { if (!other && k !== st.comp) other = D.comps[k]; });
  var W = 1800, M = 40, CW = (W - 3 * M) / 2, PH = CW * 250 / 400, CELL = PH + 96;
  var rows = Math.ceil(arts.length / 2), H = 150 + rows * (CELL + 24) + 40;
  var o = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '"><style>' + PNG_CSS + '</style><rect width="' + W + '" height="' + H + '" fill="#fff"/>';
  o += svgText(M, 52, 30, 700, '#202729', 'Compile profil disolusi: ' + D.product.name);
  o += svgText(M, 82, 16, 400, '#4A4F55', 'Pembanding aktif: ' + (comp ? comp.name + ' (' + comp.lot + ')' : '-') + '. Sumbu y: % terlarut rerata; sumbu x: menit. Garis putus-putus pada 85%. Dibuat ' + new Date().toISOString().slice(0, 10) + '.');
  var lx = M, ly = 116;
  if (comp) { o += '<line x1="' + lx + '" y1="' + ly + '" x2="' + (lx + 34) + '" y2="' + ly + '" stroke="#202729" stroke-width="4"/>' + svgText(lx + 42, ly + 5, 15, 400, '#202729', comp.name + ' (pembanding aktif)'); lx += 62 + 9 * (comp.name.length + 20); }
  if (other) { o += '<line x1="' + lx + '" y1="' + ly + '" x2="' + (lx + 34) + '" y2="' + ly + '" stroke="#666666" stroke-width="3" stroke-dasharray="6 4"/>' + svgText(lx + 42, ly + 5, 15, 400, '#202729', other.name + ' (pembanding lain)'); lx += 62 + 9 * (other.name.length + 18); }
  st.sel.forEach(function (k) {
    var r = runBy(k); if (!r) return; var sy = sty(k);
    o += '<path d="' + shapePath(sy.shape, 0, 0, 6) + '" transform="translate(' + (lx + 8) + ' ' + ly + ')" fill="' + sy.color + '" stroke="#fff"/><line x1="' + (lx + 18) + '" y1="' + ly + '" x2="' + (lx + 40) + '" y2="' + ly + '" stroke="' + sy.color + '" stroke-width="2"/>' + svgText(lx + 46, ly + 5, 15, 400, '#202729', r.code + (r.variant ? ' ' + r.variant : ''));
    lx += 66 + 9 * (r.code.length + (r.variant ? r.variant.length + 1 : 0));
  });
  arts.forEach(function (a, i) {
    var x = M + (i % 2) * (CW + M), y = 150 + Math.floor(i / 2) * (CELL + 24);
    o += svgText(x, y + 16, 20, 700, '#202729', a.querySelector('h3').textContent) + svgText(x, y + 38, 14, 400, '#4A4F55', (a.querySelector('h3').nextSibling || {}).textContent || '');
    o += '<rect x="' + x + '" y="' + (y + 48) + '" width="' + CW + '" height="' + PH + '" fill="#fff" stroke="#D9DCDD"/><svg x="' + x + '" y="' + (y + 48) + '" width="' + CW + '" height="' + PH + '" viewBox="0 0 400 250">' + a.querySelector('svg').innerHTML + '</svg>';
    var chips = [].map.call(a.querySelectorAll('.chip'), function (c) { return c.textContent.trim(); }).join('   ');
    o += svgText(x, y + 48 + PH + 24, 15, 600, '#202729', chips);
  });
  return { svg: o + '</svg>', w: W, h: H };
}
function downloadPng() {
  var b = D && buildPngSvg();
  if (!b) { toast('Belum ada grafik untuk diunduh: pilih produk yang sudah punya data.'); return; }
  var img = new Image();
  img.onload = function () {
    var cv = document.createElement('canvas'); cv.width = b.w; cv.height = b.h;
    var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, b.w, b.h); cx.drawImage(img, 0, 0, b.w, b.h);
    cv.toBlob(function (blob) {
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (D.product.name || 'grafik').replace(/[^\w .,()-]+/g, '_') + ' grafik.png';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      window.__lastPng = { w: b.w, h: b.h, bytes: blob.size };
    }, 'image/png');
  };
  img.onerror = function () { toast('Gambar PNG gagal dibuat di peramban ini.'); };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(b.svg);
}
$('pngBtn').addEventListener('click', downloadPng);

// Cetak: satu halaman A4 lanskap. CSS @media print menyembunyikan formulir/filter/temuan; skala (zoom) disetel dari jumlah baris dan jumlah panel.
function printScale() {
  // F14: dikalibrasi ulang (scripts/f14_printmeasure.mjs, media print, wadah 1360): kepala+ringkasan+jarak 161; panel kiri = 165 + 35 per baris tabel; panel kanan (4 kartu 2x2) = 821. Cetak = dua panel sebaris (46% / sisa).
  var rowsDom = D ? $('matrix').querySelectorAll('.rw').length : 3;
  var total = 161 + Math.max(165 + 35 * rowsDom, 821);
  return Math.max(0.4, Math.min(1, 695 / total));
}
window.addEventListener('beforeprint', function () { if (D && $('dashboard').style.display !== 'none') document.body.style.zoom = String(printScale()); });
window.addEventListener('afterprint', function () { document.body.style.zoom = ''; });
$('printBtn').addEventListener('click', function () { window.print(); });

// Ubah, hapus, pulihkan run (penulis saja; pembaca tidak melihat tombolnya). Semua lewat API; jejak tercatat server.
function mgHead(it) { return '<div class="mg-run"><div class="hd"><b>' + esc(it.name) + '</b> <span class="chip" style="' + (it.p.valid ? 'background:var(--pharos-green-tint);color:var(--pharos-green-text)' : TONE.warn) + '">' + (it.p.valid ? 'Valid' : 'Tidak valid') + (it.p.held ? ', ditahan' : '') + '</span></div>'; }
function mgBody(key, mode, msg) {
  var row = runBy(key); if (!row) return '<p>Run ini sudah tidak tampil.</p>';
  var items = []; D.media.forEach(function (m) { if (row.prof[m.id]) items.push({ code: m.id, name: m.name, p: row.prof[m.id] }); });
  var h = (msg ? '<div role="status" style="margin:0 0 10px;padding:8px 10px;border-radius:var(--pharos-radius);background:var(--pharos-blue-tint);color:var(--pharos-blue-dark);font-size:13px">' + esc(msg) + '</div>' : '');
  h += '<div class="mg-note" style="margin:0 0 10px">Batch ' + esc(row.code) + (row.variant ? ' (varian ' + esc(row.variant) + ')' : '') + '. Run yang dihapus tidak hilang: bisa dipulihkan dan tercatat di jejak.</div>';
  h += '<label class="mg-field">Nama analis (wajib diketik, tercatat di jejak)<input id="mg-ana" maxlength="80" autocomplete="name" value="' + esc(anaStored()) + '"></label>';
  items.forEach(function (it) {
    var id = it.p.run_id, md = mode && mode.id === id ? mode.kind : null;
    h += mgHead(it);
    h += '<div class="mg-note">' + (it.p.date ? fdate(it.p.date) : 'tanggal kosong') + ' · ' + it.p.vessels + ' vessel' + (row.invalid[it.code] ? ' · alasan tidak valid: ' + esc(row.invalid[it.code]) : '') + (it.p.note ? ' · catatan: ' + esc(it.p.note) : '') + '</div>';
    if (md === 'edit') {
      h += '<div style="margin-top:10px"><label class="mg-field">Status<select id="mg-st"><option value="1"' + (it.p.valid ? ' selected' : '') + '>Valid</option><option value="0"' + (it.p.valid ? '' : ' selected') + '>Tidak valid</option></select></label>' +
        '<label class="mg-field">Alasan (wajib bila Tidak valid)<input id="mg-rs" maxlength="400" value="' + esc(row.invalid[it.code] || '') + '"></label>' +
        '<label class="mg-field">Catatan<textarea id="mg-nt" rows="2" maxlength="4000">' + esc(it.p.note || '') + '</textarea></label>' +
        '<label class="mg-field">Varian<input id="mg-vr" maxlength="100" value="' + esc(row.variant || '') + '"></label>' +
        '<div style="display:flex;gap:8px"><button type="button" class="btn1" data-mg="save" data-id="' + id + '">Simpan perubahan</button><button type="button" class="btn2" data-mg="cancel">Batal</button></div></div>';
    } else if (md === 'del') {
      h += '<div style="margin-top:10px"><label class="mg-field">Alasan hapus (wajib)<input id="mg-rs" maxlength="400"></label><label style="display:flex;gap:8px;align-items:center;font-size:13px;margin:0 0 10px"><input type="checkbox" id="mg-ok"> Ya, hapus run ini dari tampilan (bisa dipulihkan)</label>' +
        '<div style="display:flex;gap:8px"><button type="button" class="btn1" data-mg="delgo" data-id="' + id + '">Hapus run</button><button type="button" class="btn2" data-mg="cancel">Batal</button></div></div>';
    } else if (md === 'audit') {
      h += '<div id="mg-audit" style="margin-top:8px;font-size:13px">Memuat jejak…</div><div style="margin-top:8px"><button type="button" class="btn-s" data-mg="cancel">Tutup jejak</button></div>';
    } else {
      h += '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><button type="button" class="btn-s" data-mg="edit" data-id="' + id + '">Ubah</button><button type="button" class="btn-s btn-d" data-mg="del" data-id="' + id + '">Hapus</button><button type="button" class="btn-s" data-mg="audit" data-id="' + id + '">Jejak</button></div>';
    }
    h += '</div>';
  });
  return h;
}
function openManage(key) {
  if (!runBy(key)) return;
  var cur = { key: key, mode: null, msg: '' };
  dialog('Kelola data uji ' + key, '<div id="mgv"></div>', [{ text: 'Tutup', value: true, primary: true }]);
  var box = $('mgv');
  function paint() { box.innerHTML = mgBody(cur.key, cur.mode, cur.msg); cur.msg = ''; if (cur.mode && cur.mode.kind === 'audit') loadAudit(cur.mode.id); }
  function loadAudit(id) {
    api('GET', '/api/runs/' + id + '/audit').then(function (r) {
      var el = $('mg-audit'); if (!el) return;
      var ev = (r.j && r.j.events) || [];
      el.innerHTML = ev.length ? ev.map(function (e) { return '<div style="padding:6px 0;border-bottom:1px solid var(--pharos-line)"><b>' + esc(e.action) + '</b> oleh ' + esc(e.analyst) + (e.account ? ' (akun ' + esc(e.account) + ')' : '') + ' · ' + esc(String(e.at_utc).slice(0, 16).replace('T', ' ')) + (e.reason ? ' · ' + esc(e.reason) : '') + (e.changes || []).map(function (c) { return '<div class="mg-note">' + esc(c.field) + ': ' + esc(c.old == null ? '-' : c.old) + ' → ' + esc(c.new == null ? '-' : c.new) + '</div>'; }).join('') + '</div>'; }).join('') : 'Belum ada perubahan tercatat.';
    });
  }
  function done(r, okMsg, close) {
    if (r.status >= 400) { cur.msg = (r.j.error || 'Gagal') + (r.j.details ? ': ' + r.j.details.join('; ') : ''); paint(); return; }
    cur.mode = null;
    reloadDash().then(function () { render(); if (close || !runBy(cur.key)) { var b = box.closest('[role="dialog"]'); if (b && b.parentNode) b.parentNode.remove(); return; } cur.msg = okMsg; paint(); });
  }
  box.addEventListener('input', function (e) { if (e.target && e.target.id === 'mg-ana') anaStore(e.target.value); });
  box.addEventListener('click', function (e) {
    var b = e.target.closest('[data-mg]'); if (!b) return;
    var act = b.getAttribute('data-mg'), id = Number(b.getAttribute('data-id'));
    if (act === 'cancel') { cur.mode = null; paint(); return; }
    if (act === 'edit' || act === 'del' || act === 'audit') { cur.mode = { kind: act, id: id }; paint(); return; }
    needAna().then(function (ok) {
      if (!ok) { cur.msg = 'Isi nama analis (2 sampai 80 karakter) dulu.'; paint(); return; }
      if (act === 'save') {
        var row = runBy(cur.key), it = null; D.media.forEach(function (m) { if (row.prof[m.id] && row.prof[m.id].run_id === id) it = { code: m.id, p: row.prof[m.id] }; });
        var body = {}, valid = $('mg-st').value === '1', rs = $('mg-rs').value.trim(), nt = $('mg-nt').value.trim(), vr = $('mg-vr').value.trim();
        if (valid !== it.p.valid) body.is_valid = valid;
        if (!valid) { if (rs !== (row.invalid[it.code] || '')) body.invalid_reason = rs; if (!rs) { cur.msg = 'Status Tidak valid wajib beralasan.'; paint(); return; } }
        if (nt !== (it.p.note || '')) body.note = nt || null;
        if (vr !== (row.variant || '')) body.variant = vr;
        if (!Object.keys(body).length) { cur.msg = 'Tidak ada perubahan.'; cur.mode = null; paint(); return; }
        api('PATCH', '/api/runs/' + id, body).then(function (r) { done(r, 'Perubahan disimpan dan tercatat di jejak.', 'variant' in body); });
      } else if (act === 'delgo') {
        var reason = $('mg-rs').value.trim();
        if (!reason) { cur.msg = 'Alasan hapus wajib diisi.'; paint(); return; }
        if (!$('mg-ok').checked) { cur.msg = 'Centang konfirmasi hapus dulu.'; paint(); return; }
        api('POST', '/api/runs/' + id + '/delete', { confirm: true, reason: reason }).then(function (r) { done(r, 'Run dihapus dari tampilan. Pulihkan lewat Run terhapus.'); });
      }
    });
  });
  paint();
}
function needAna() { return okAna().then(function (r) { return r.status === 200; }); }
function openRemoved() {
  dialog('Run terhapus', '<div id="rmv">Memuat…</div>', [{ text: 'Tutup', value: true, primary: true }]);
  var box = $('rmv'), msg = '';
  function paint(rows) {
    box.innerHTML = (msg ? '<div role="status" style="margin:0 0 10px;padding:8px 10px;border-radius:var(--pharos-radius);background:var(--pharos-blue-tint);color:var(--pharos-blue-dark);font-size:13px">' + esc(msg) + '</div>' : '') +
      '<label class="mg-field">Nama analis (wajib diketik, tercatat di jejak)<input id="mg-ana" maxlength="80" value="' + esc(anaStored()) + '"></label>' +
      (rows.length ? rows.map(function (x) {
        return '<div class="mg-run"><div class="hd"><b>' + esc(x.batch_no) + (x.variant ? ' ' + esc(x.variant) : '') + '</b> · ' + esc(x.medium_code) + '</div><div class="mg-note">' + (x.kind === 'hapus' ? 'Dihapus' : 'Ditimpa oleh run lain') + ' oleh ' + esc(x.analyst) + ' · ' + esc(String(x.at_utc).slice(0, 16).replace('T', ' ')) + ' · ' + esc(x.reason || '') + '</div>' +
          (x.restorable ? '<label class="mg-field" style="margin-top:8px">Alasan pulihkan (wajib)<input id="mg-rs-' + x.run_id + '" maxlength="400"></label><button type="button" class="btn-s" data-restore="' + x.run_id + '">Pulihkan</button>' : '<div class="mg-note">Tidak dapat dipulihkan dari sini.</div>') + '</div>';
      }).join('') : '<p style="margin:0">Tidak ada run terhapus.</p>');
  }
  function load() { api('GET', '/api/compiles/' + PID + '/removed').then(function (r) { paint((r.j && r.j.runs) || []); }); }
  box.addEventListener('input', function (e) { if (e.target && e.target.id === 'mg-ana') anaStore(e.target.value); });
  box.addEventListener('click', function (e) {
    var b = e.target.closest('[data-restore]'); if (!b) return;
    var id = b.getAttribute('data-restore'), reason = ($('mg-rs-' + id) || {}).value || '';
    needAna().then(function (ok) {
      if (!ok) { msg = 'Isi nama analis (2 sampai 80 karakter) dulu.'; load(); return; }
      if (!reason.trim()) { msg = 'Alasan pulihkan wajib diisi.'; load(); return; }
      api('POST', '/api/runs/' + id + '/restore', { reason: reason.trim() }).then(function (r) {
        msg = r.status === 200 ? 'Run dipulihkan dan tampil lagi di dashboard.' : ((r.j && r.j.error) || 'Gagal memulihkan');
        reloadDash().then(function () { render(); load(); });
      });
    });
  });
  load();
}
$('rmBtn').addEventListener('click', openRemoved);
document.addEventListener('click', function (e) { var b = e.target.closest('[data-manage]'); if (b) openManage(b.getAttribute('data-manage')); });

// ---------- formulir tambah data ----------
var TP = [0, 5, 10, 15, 20, 30, 45, 60], NV = 12, MAXTP = 9, previewSeq = 0, previewTimer = null, lastPrev = null, formReady = false;
function selVal(id) { var e = $(id); return e ? e.value : ''; }
function mediumInfo() { var c = selVal('f-med'); return INFO ? INFO.mediums.filter(function (m) { return m.code === c; })[0] : null; }
function todayISO() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
function fillForm() {
  if (!isWriter() || !INFO) return;
  var fp = '<option value="' + PID + '">' + esc(INFO.product.name) + '</option>';
  PRODUCTS.forEach(function (p) { if (p.id !== PID) fp += '<option value="' + p.id + '">' + esc(p.name) + '</option>'; });
  fp += '<option value="__new">+ Produk baru\u2026</option>';
  $('f-prod').innerHTML = fp; $('f-prod').value = String(PID);
  var want = st.wantMed; st.wantMed = null;
  $('f-med').innerHTML = INFO.mediums.map(function (m) { return '<option value="' + esc(m.code) + '">' + esc(m.name) + (m.full_name && m.full_name !== m.name ? ' \u2014 ' + esc(shortDesc(m.full_name)) : '') + (m.in_product ? '' : ' (baru untuk produk ini)') + '</option>'; }).join('');
  var firstPH = INFO.mediums.filter(function (m) { return m.in_product; })[0];
  $('f-med').value = want || (firstPH ? firstPH.code : INFO.mediums[0].code);
  $('f-cmp').innerHTML = INFO.comparators.length ? INFO.comparators.map(function (c) { return '<option value="' + esc(c.lot) + '">' + esc(c.name) + ' \u00b7 ' + esc(c.lot) + '</option>'; }).join('') : '<option value="">(belum ada pembanding)</option>';
  if (!$('f-date').value) $('f-date').value = todayISO();
  if (!$('f-ana').value) $('f-ana').value = anaStored();   // F12: diingat per sesi, tetap bisa diubah
  mediumDerived(); buildGrid(); anaUpdate();
}
function shortDesc(s) { return String(s).replace(/\s*\(.*\)\s*$/, ''); }
function mediumDerived() {
  var m = mediumInfo(); $('f-vol').value = m && m.volume_text ? m.volume_text : '';
  $('f-app').value = m ? [m.apparatus, m.rpm_text].filter(Boolean).join(' \u00b7 ') : ''; $('f-met').value = m && m.method ? m.method : '';
}
function readGrid() {
  var rows = [];
  for (var v = 0; v < NV; v++) { var r = []; for (var c = 1; c < TP.length; c++) { var el = $('g-' + v + '-' + c); r.push(el ? el.value : ''); } rows.push(r); }
  return rows;
}
function buildGrid(keep) {
  var old = keep || null, h = '<thead><tr><th scope="col" style="width:78px"></th>';
  TP.forEach(function (t) { h += '<th scope="col" style="' + TH_COL + '">' + (t === 0 ? '0' : t + "'") + '</th>'; });
  h += '</tr></thead><tbody>';
  for (var v = 0; v < NV; v++) {
    h += '<tr><th scope="row" style="padding:2px 8px;font-size:12.5px;font-weight:600;color:var(--pharos-slate);text-align:left;white-space:nowrap">Vessel ' + (v + 1) + '</th>';
    TP.forEach(function (t, c) {
      if (c === 0) h += '<td style="padding:2px 3px"><input value="0" readonly aria-label="Vessel ' + (v + 1) + ', menit 0" style="' + INP_ZERO + '"></td>';
      else h += '<td style="padding:2px 3px"><input id="g-' + v + '-' + c + '" data-v="' + v + '" data-c="' + c + '" inputmode="decimal" autocomplete="off" value="' + esc(old && old[v] && old[v][c] != null ? old[v][c] : '') + '" aria-label="Vessel ' + (v + 1) + ', menit ' + t + '" style="' + INP_OFF + '"></td>';
    });
    h += '</tr>';
  }
  [['avg', 'Rata-rata'], ['min', 'Min'], ['max', 'Maks'], ['rsd', 'RSD (%)']].forEach(function (s) {
    h += '<tr style="background:var(--pharos-white)"><th scope="row" style="padding:6px 8px;font-size:12.5px;font-weight:600;color:var(--pharos-slate);text-align:left">' + s[1] + '</th>';
    TP.forEach(function (t, c) { h += '<td id="s-' + s[0] + '-' + c + '" style="' + TD_STAT + '">' + (c === 0 ? (s[0] === 'rsd' ? '' : '0,0') : '') + '</td>'; });
    h += '</tr>';
  });
  $('grid').innerHTML = h + '</tbody>';
  styleInputs();
}
function numOf(s) {   // pembacaan angka entri (koma atau titik desimal); BUKAN rumus
  var t = String(s == null ? '' : s).trim().replace(/\s/g, ''); if (t === '') return null;
  if (/^-?\d+,\d+$/.test(t)) t = t.replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}
function styleInputs() {
  var inputs = $('grid').querySelectorAll('input[data-v]');
  Array.prototype.forEach.call(inputs, function (el) { var n = numOf(el.value); el.style.cssText = (el.value.trim() === '' ? INP_OFF : (isNaN(n) ? INP_ON + ';border-color:var(--pharos-warn-ink);background:var(--pharos-yellow-tint)' : INP_ON)); });
}
function collect() {
  var g = readGrid(), vessels = [], bad = 0;
  g.forEach(function (r, v) {
    var vals = r.map(function (x) { var n = numOf(x); if (n !== null && isNaN(n)) { bad++; return null; } return n; });
    if (vals.some(function (x) { return x !== null; })) vessels.push({ no: v + 1, values: vals });
  });
  return { bad: bad, body: { medium: selVal('f-med'), batch: selVal('f-batch').trim(), variant: selVal('f-var').trim(), test_date: selVal('f-date') || null, comparator: selVal('f-cmp') || null, timepoints: TP.slice(1), vessels: vessels } };
}
function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(runPreview, 350); styleInputs(); }
function runPreview() {
  var c = collect(), seq = ++previewSeq;
  lastPrev = null;
  if (!c.body.vessels.length) { paintPreview(null, c); saveUpdate(); return; }
  var body = JSON.parse(JSON.stringify(c.body)); if (!body.batch) body.batch = '(batch belum diisi)';
  api('POST', '/api/products/' + PID + '/runs/preview', body).then(function (r) {
    if (seq !== previewSeq) return;
    if (r.status === 200) { lastPrev = r.j; paintPreview(r.j, c); } else paintPreview({ error: (r.j.details || [r.j.error || 'Pratinjau gagal']).join('; ') }, c);
    saveUpdate();
  });
}
function paintPreview(p, c) {
  var KB = { sim: ['var(--pharos-blue-tint)', 'var(--pharos-blue-dark)', 'Similar'], rap: ['var(--pharos-gray)', 'var(--pharos-slate)', 'Similar (sangat cepat)'], not: ['var(--pharos-red-tint)', 'var(--pharos-red)', 'Not Similar'] };
  for (var col = 1; col < TP.length; col++) ['avg', 'min', 'max', 'rsd'].forEach(function (k) { $('s-' + k + '-' + col).textContent = ''; });
  var checks = '';
  if (!p || p.error) {
    $('pvF2').textContent = '–'; $('pvBadge').style.display = 'none'; $('pvChart').innerHTML = ''; $('pvLegend').innerHTML = '';
    $('pvNote').textContent = p && p.error ? p.error : 'Pilih pembanding dan isi nilai vessel untuk melihat pratinjau f2.';
    if (c && c.bad) checks += '<li style="display:flex;gap:10px">' + warnIcon + '<span>' + c.bad + ' isian bukan angka (diabaikan).</span></li>';
    setChecks(checks); return;
  }
  p.times.forEach(function (t, i) { var col = TP.indexOf(t); if (col < 1) return; $('s-avg-' + col).textContent = fmt(p.stats.avg[i]); $('s-min-' + col).textContent = fmt(p.stats.min[i]); $('s-max-' + col).textContent = fmt(p.stats.max[i]); $('s-rsd-' + col).textContent = fmt(p.stats.rsd[i]); });
  var f = p.f2, mi = mediumInfo(), medName = mi ? mi.name : '';
  if (f && f.langkah4 && f.langkah4.f2 !== null) {   // F17: pratinjau resmi = Langkah 4; hitung ulang tim n=3 hanya catatan
    var L = f.langkah4, k = KB[L.kind] || KB.not;
    $('pvF2').textContent = fmt(L.f2);
    var b = $('pvBadge'); b.style.display = 'inline-flex'; b.style.background = k[0]; b.style.color = k[1]; b.innerHTML = IC[L.kind].replace(/width="13" height="13"/, 'width="16" height="16"') + esc(k[2]);
    $('pvNote').textContent = 'f2 resmi (Langkah 4) terhadap ' + f.ref.name + ' (' + f.ref.lot + '), ' + medName + '. n = ' + L.n + ' titik (' + L.minutes.map(function (t) { return t + "'"; }).join(', ') + '); jumlah kuadrat selisih = ' + fmt(L.sumsq, 2) + '. ' + (L.reason || '') + (f.sheet && f.sheet.f2 !== null ? ' Pembanding: hitung ulang tim (n = ' + f.sheet.n + ') f2 ' + fmt(f.sheet.f2) + '.' : '');
    drawPreviewChart(f, c);
  } else {
    $('pvF2').textContent = '–'; $('pvBadge').style.display = 'none'; $('pvChart').innerHTML = ''; $('pvLegend').innerHTML = '';
    $('pvNote').textContent = f ? 'f2 belum dapat dihitung: butuh minimal 3 titik waktu yang terisi pada kedua profil.' : 'Belum ada pembanding untuk medium ini; run tetap bisa disimpan tanpa f2.';
  }
  p.checks.forEach(function (x) { checks += '<li style="display:flex;gap:10px">' + (x.level === 'ok' ? okIcon : (x.level === 'warn' ? warnIcon : infoIcon)) + '<span>' + esc(x.text) + '</span></li>'; });
  (p.warnings || []).forEach(function (x) { checks += '<li style="display:flex;gap:10px">' + warnIcon + '<span>' + esc(x.message) + '</span></li>'; });
  if (c && c.bad) checks += '<li style="display:flex;gap:10px">' + warnIcon + '<span>' + c.bad + ' isian bukan angka (diabaikan).</span></li>';
  setChecks(checks);
}
function setChecks(html) {
  var ul = $('pvChecks'), first = $('anaWarn');
  while (ul.lastChild && ul.lastChild !== first) ul.removeChild(ul.lastChild);
  ul.insertAdjacentHTML('beforeend', html);
}
function drawPreviewChart(f, c) {
  var times = f.ref.times, maxT = times[times.length - 1] || 60;
  function x(t) { return (38 + t / maxT * 348).toFixed(1); } function y(v) { return (210 - Math.max(0, Math.min(110, v)) * 1.8).toFixed(1); }
  function poly(a) { var o = []; times.forEach(function (t, i) { if (a[i] !== null && a[i] !== undefined) o.push(x(t) + ',' + y(a[i])); }); return o.join(' '); }
  var s = '<svg viewBox="0 0 400 240" role="img" aria-label="Profil rerata run dan pembanding" style="width:100%;height:auto;display:block">';
  [0, 25, 50, 75, 100].forEach(function (v) { s += '<line x1="38" y1="' + y(v) + '" x2="386" y2="' + y(v) + '" stroke="#D9DCDD"/><text x="32" y="' + (parseFloat(y(v)) + 3.5).toFixed(1) + '" text-anchor="end" font-size="10.5" fill="#666666" font-family="Google Sans,Arial,sans-serif">' + v + '</text>'; });
  times.filter(function (t) { return t === 0 || t % 10 === 0 || t === 45; }).forEach(function (t) { s += '<text x="' + x(t) + '" y="228" text-anchor="middle" font-size="10.5" fill="#666666" font-family="Google Sans,Arial,sans-serif">' + t + '</text>'; });
  s += '<line x1="38" y1="' + y(85) + '" x2="386" y2="' + y(85) + '" stroke="#8E9496" stroke-dasharray="2 3"/>';
  s += '<polyline points="' + poly(f.ref.avg) + '" fill="none" stroke="#202729" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>';
  s += '<polyline points="' + poly(f.test_avg) + '" fill="none" stroke="#0064A2" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
  times.forEach(function (t, i) { if (i > 0 && f.test_avg[i] !== null) s += '<circle cx="' + x(t) + '" cy="' + y(f.test_avg[i]) + '" r="3.6" fill="#0064A2" stroke="#FFFFFF"/>'; });
  $('pvChart').innerHTML = s + '</svg>';
  $('pvLegend').innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px"><svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true"><line x1="1" y1="5" x2="25" y2="5" stroke="#202729" stroke-width="3" stroke-linecap="round"/></svg>' + esc(f.ref.name) + '</span><span style="display:inline-flex;align-items:center;gap:6px"><svg width="26" height="14" viewBox="0 0 26 14" aria-hidden="true"><line x1="1" y1="7" x2="25" y2="7" stroke="#0064A2" stroke-width="2" stroke-linecap="round"/><circle cx="13" cy="7" r="3.6" fill="#0064A2" stroke="#FFFFFF"/></svg>' + esc((INFO && INFO.test_brand ? INFO.test_brand.split(' ')[0] : 'Uji') + ' ' + (c.body.batch || '')) + '</span>';
}
// nama analis: wajib diketik (2 sampai 80 karakter); dikirim bersama tiap simpan
var ana = $('f-ana'), save = $('saveBtn'), aw = $('anaWarn');
function anaUpdate() {
  var ok = !!anaValid(ana.value);
  aw.innerHTML = ok ? okIcon + '<span>Nama analis terisi.</span>' : warnIcon + '<span><b>Nama analis belum diisi.</b> Ketik nama Anda (2 sampai 80 karakter); wajib sebelum run disimpan.</span>';
  saveUpdate();
}
function saveUpdate() {
  var c = collect().body, ok = !!anaValid(ana.value) && c.batch.length > 0 && c.vessels.length > 0 && !!lastPrev && !lastPrev.error && lastPrev.duplicate.status !== 'sama_persis';
  save.setAttribute('aria-disabled', ok ? 'false' : 'true');
  save.style.background = ok ? 'var(--pharos-blue)' : 'var(--pharos-control)'; save.style.color = ok ? 'var(--pharos-white)' : 'var(--pharos-slate)'; save.style.cursor = ok ? 'pointer' : 'not-allowed';
}
ana.addEventListener('input', function () { anaStore(ana.value); anaUpdate(); });
['f-batch', 'f-var', 'f-date', 'f-cmp'].forEach(function (id) { $(id).addEventListener('input', schedulePreview); $(id).addEventListener('change', schedulePreview); });
$('f-med').addEventListener('change', function () { mediumDerived(); schedulePreview(); });
$('grid').addEventListener('input', schedulePreview);
$('grid').addEventListener('keydown', function (e) {   // Enter turun satu vessel
  if (e.key !== 'Enter') return; var t = e.target; if (!t.getAttribute || t.getAttribute('data-v') === null) return;
  var n = $('g-' + (Number(t.getAttribute('data-v')) + 1) + '-' + t.getAttribute('data-c')); if (n) { e.preventDefault(); n.focus(); }
});
$('addTp').addEventListener('click', function () {
  if (TP.length >= MAXTP) { toast('Maksimum ' + MAXTP + ' titik waktu (termasuk 0).'); return; }
  var s = window.prompt('Menit titik waktu baru (angka lebih dari 0):', ''); if (s === null) return;
  var n = numOf(s);
  if (n === null || isNaN(n) || n <= 0 || n > 1440) { toast('Menit harus angka lebih dari 0.'); return; }
  if (TP.indexOf(n) >= 0) { toast('Titik waktu ' + n + ' menit sudah ada.'); return; }
  var g = readGrid(), oldTP = TP.slice();
  TP.push(n); TP.sort(function (a, b) { return a - b; });
  var keep = g.map(function (r) { var row = [0]; TP.forEach(function (t, c) { if (c === 0) return; var oi = oldTP.indexOf(t); row.push(oi > 0 ? r[oi - 1] : ''); }); return row; });
  buildGrid(keep); schedulePreview();
});
function toast(msg) { dialog('Perhatian', '<p style="margin:0">' + esc(msg) + '</p>', [{ text: 'Tutup', value: true, primary: true }]); }

// tab Isi manual / Tempel dari Excel / Impor sheet lama
Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (b) {
  b.addEventListener('click', function () {
    var name = b.getAttribute('data-tab');
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (x) { var on = x === b; x.className = 'tab' + (on ? ' on' : ''); x.setAttribute('aria-selected', on ? 'true' : 'false'); });
    $('tabPaste').style.display = name === 'paste' ? 'flex' : 'none'; $('tabImport').style.display = name === 'import' ? 'flex' : 'none';
  });
});
$('pasteGo').addEventListener('click', function () {   // klien hanya mengurai teks tempel; semua perhitungan di server
  var lines = $('pasteBox').value.replace(/\r/g, '').split('\n').filter(function (l) { return l.trim() !== ''; });
  if (!lines.length) { $('pasteMsg').textContent = 'Tempel dulu data dari Excel.'; return; }
  var cells = lines.map(function (l) { return l.split('\t'); }), mins = null;
  var hdr = cells[0].map(function (x) { return String(x).trim().replace(/['\u2019\u2032]|menit/gi, '').trim(); });
  if (hdr.filter(function (x) { return x !== '' && /^\d+([.,]\d+)?$/.test(x); }).length >= 2 && cells[0].filter(function (x) { return numOf(x) !== null && !isNaN(numOf(x)); }).length === hdr.filter(Boolean).length) {
    mins = hdr.map(function (x) { var n = numOf(x); return x === '' || isNaN(n) ? null : n; }); cells.shift();
  }
  var rows = cells.map(function (r) { return r; });
  var lead = rows.length && rows.every(function (r) { return /^\s*(vessel\s*)?\d+\s*$/i.test(r[0] || '') && r.length > 1; }) && (!mins || mins.length === rows[0].length);
  if (lead) rows = rows.map(function (r) { return r.slice(1); });
  if (mins && lead && mins.length === cells[0].length) mins = mins.slice(1);
  if (rows.length > NV) { $('pasteMsg').textContent = 'Maksimum ' + NV + ' vessel; ' + rows.length + ' baris ditemukan.'; return; }
  var ncol = Math.max.apply(null, rows.map(function (r) { return r.length; }));
  var cols;   // daftar menit untuk tiap kolom tempel
  if (mins && mins.length) { cols = mins; if (mins[0] === 0 && rows.every(function (r) { return numOf(r[0]) === 0 || numOf(r[0]) === null; })) { /* kolom 0 diabaikan di bawah */ } }
  else { cols = []; for (var i = 0; i < ncol; i++) cols.push(TP[i + 1] === undefined ? null : TP[i + 1]); if (ncol === TP.length) cols = TP.slice(); }
  var needed = cols.filter(function (t) { return t !== null && t > 0 && TP.indexOf(t) < 0; });
  var addTP = TP.slice(); needed.forEach(function (t) { if (addTP.indexOf(t) < 0) addTP.push(t); }); addTP.sort(function (a, b) { return a - b; });
  if (addTP.length > MAXTP) { $('pasteMsg').textContent = 'Titik waktu melebihi ' + MAXTP + '.'; return; }
  var g = readGrid(), oldTP = TP.slice();
  TP = addTP;
  var keep = []; for (var v = 0; v < NV; v++) { var row = [0]; TP.forEach(function (t, c) { if (c === 0) return; var oi = oldTP.indexOf(t); row.push(oi > 0 && g[v] ? g[v][oi - 1] : ''); }); keep.push(row); }
  var filled = 0;
  rows.forEach(function (r, v) { cols.forEach(function (t, j) { if (t === null || t <= 0 || r[j] === undefined) return; var c = TP.indexOf(t); if (c > 0 && String(r[j]).trim() !== '') { keep[v][c] = String(r[j]).trim(); filled++; } }); });
  buildGrid(keep); schedulePreview();
  $('pasteMsg').textContent = filled + ' sel terisi dari tempelan. Periksa tabel di bawah, lalu Simpan ke database.';
});
// impor sheet lama
var impBuf = null;
$('impFile').addEventListener('change', function () { impBuf = null; $('impGo').disabled = true; $('impOut').textContent = ''; });
function impCall(dry) {
  var f = $('impFile').files[0]; if (!f) { $('impOut').textContent = 'Pilih berkas .xlsx dulu.'; return; }
  if (!dry && !anaValid(ana.value)) { $('impOut').innerHTML = '<span style="color:var(--pharos-red)">Ketik nama analis (di bagian Identitas run, 2 sampai 80 karakter) sebelum mengimpor.</span>'; return; }
  var go = function () { return f.arrayBuffer().then(function (buf) { var hd = { 'x-file-name': encodeURIComponent(f.name), 'x-analyst-name': encodeURIComponent(anaValid(ana.value)) }; [['impP', 'x-product-name'], ['impS', 'x-strength'], ['impF', 'x-dosage-form']].forEach(function (x) { var v = $(x[0]).value.trim(); if (v) hd[x[1]] = encodeURIComponent(v); }); return api('POST', '/api/imports/xlsx' + (dry ? '?dry=1' : ''), null, { headers: hd, body: buf }); }); };
  var pre = dry ? Promise.resolve(true) : okAna().then(function (r) { return r.status === 200; });
  pre.then(function (ok) { if (!ok) { $('impOut').textContent = 'Nama analis belum valid.'; return null; } return go(); }).then(function (r) {
    if (!r) return;
    if (r.status >= 400) { $('impOut').innerHTML = '<span style="color:var(--pharos-red)">' + esc(r.j.error || 'Impor gagal') + (r.j.details ? ': ' + esc(r.j.details.join('; ')) : '') + '</span>'; return; }
    var j = r.j, h = '<div style="font-weight:600">' + (dry ? 'Laporan pencocokan (belum disimpan)' : 'Impor selesai') + '</div><ul style="margin:6px 0 0;padding-left:18px"><li>Produk: ' + esc(j.compile && j.compile.title) + '</li><li>' + j.runs + ' run, ' + j.comparisons + ' perbandingan; f2 cocok ' + j.f2_cocok + ', tidak cocok ' + j.f2_tidak_cocok + '.</li>';
    if (j.tab_diabaikan && j.tab_diabaikan.length) h += '<li>Tab diabaikan: ' + esc(j.tab_diabaikan.join(', ')) + '</li>';
    if (j.ditahan) h += '<li>' + j.ditahan + ' blok ditahan (dicatat).</li>';
    (j.warnings || []).slice(0, 5).forEach(function (w) { h += '<li>' + esc(w.message) + '</li>'; });
    $('impOut').innerHTML = h + '</ul>'; $('impGo').disabled = !dry;
    if (!dry) { api('GET', '/api/products').then(function (p) { PRODUCTS = p.j.products || PRODUCTS; fillPicker(PID); }); reloadDash().then(function () { st.fresh = null; }); }
  });
}
$('impDry').addEventListener('click', function () { impCall(true); });
$('impGo').addEventListener('click', function () { impCall(false); });

// produk baru lewat konfirmasi
$('f-prod').addEventListener('change', function () {
  var v = $('f-prod').value;
  if (v === '__new') { newProduct().then(function (id) { if (id) selectProduct(id); else $('f-prod').value = String(PID); }); return; }
  selectProduct(Number(v));
});
function newProduct() {
  if (!anaValid(ana.value)) { toast('Ketik nama analis dulu (2 sampai 80 karakter) sebelum membuat produk baru.'); return Promise.resolve(null); }
  var fld = function (id, lab, ph) { return '<div style="display:flex;flex-direction:column;gap:4px;margin-top:8px"><label for="' + id + '" style="font-size:12px;font-weight:600;color:var(--pharos-slate)">' + lab + '</label><input id="' + id + '" placeholder="' + ph + '" autocomplete="off" style="height:40px;padding:0 10px;border:1px solid var(--pharos-control);border-radius:var(--pharos-radius);font-size:14px"></div>'; };
  var read = function (box) { var g = function (id) { return box.querySelector('#' + id).value.trim(); }; return { product_name: g('np-n'), strength: g('np-s'), dosage_form: g('np-f'), api: g('np-a'), project_code: g('np-c') }; };
  return dialog('Produk baru', '<div style="font-size:12.5px;color:var(--pharos-muted)">Isi sesuai nama di sheet. Aplikasi memeriksa produk serupa sebelum membuat.</div>' + fld('np-n', 'Nama produk', 'Nama produk') + fld('np-s', 'Kekuatan', 'Kekuatan') + fld('np-f', 'Bentuk sediaan', 'Bentuk sediaan') + fld('np-a', 'Zat aktif (opsional)', '') + fld('np-c', 'Kode project (opsional)', ''), [{ text: 'Batal', value: null }, { text: 'Periksa dan buat', value: 'ok', primary: true }], read).then(function (v) {
    var d = dialog.last; if (v !== 'ok') return null;
    if (!d.product_name || !d.strength || !d.dosage_form) { toast('Nama produk, kekuatan, dan bentuk sediaan wajib diisi.'); return null; }
    var q = '/api/products/match?product=' + encodeURIComponent(d.product_name) + '&strength=' + encodeURIComponent(d.strength) + '&form=' + encodeURIComponent(d.dosage_form) + '&code=' + encodeURIComponent(d.project_code || '');
    return api('GET', q).then(function (m) {
      var cands = (m.j && m.j.candidates) || [];
      var ask = cands.length ? dialog('Produk serupa sudah ada', '<div style="font-size:13.5px">' + cands.map(function (x) { return '<div style="margin-top:6px"><b>' + esc(x.title) + '</b> <span style="color:var(--pharos-muted)">(cocok lewat ' + esc(x.matched_by) + ')</span></div>'; }).join('') + '<div style="margin-top:10px;color:var(--pharos-muted)">Aplikasi tidak menggabungkan otomatis. Pakai produk yang ada, atau tetap buat produk baru.</div></div>', [{ text: 'Batal', value: null }, { text: 'Tetap buat produk baru', value: 'baru' }, { text: 'Pakai produk yang ada', value: 'pakai', primary: true }]) : Promise.resolve('baru');
      return ask.then(function (c) {
        if (c === 'pakai') return cands[0].compile_id;
        if (c !== 'baru') return null;
        return okAna().then(function () { return api('POST', '/api/products', d); }).then(function (r) {
          if (r.status !== 201) { toast(r.j.error || 'Produk baru gagal dibuat.'); return null; }
          return api('GET', '/api/products').then(function (p) { PRODUCTS = p.j.products || PRODUCTS; fillPicker(r.j.compile_id); return r.j.compile_id; });
        });
      });
    });
  });
}

// simpan ke database
save.addEventListener('click', function () { if (save.getAttribute('aria-disabled') === 'false') doSave(); });
function doSave() {
  var c = collect().body, mi = mediumInfo(), prev = lastPrev, name = anaValid(ana.value);
  var f = prev.f2 && prev.f2.langkah4;
  var sum = '<div style="font-size:13.5px"><div><b>' + esc(INFO.product.name) + '</b>, batch <b>' + esc(c.batch) + '</b>' + (c.variant ? ' (' + esc(c.variant) + ')' : '') + ', ' + esc(mi ? mi.name : '') + '</div>' +
    '<div style="margin-top:6px">Vessel terisi: ' + prev.n_vessels + ' \u00b7 titik waktu: ' + c.timepoints.length + (f && f.f2 !== null ? ' \u00b7 f2 ' + fmt(f.f2) + ' (' + esc(KT[f.kind]) + ') terhadap ' + esc(prev.comparator.name) : ' \u00b7 tanpa f2') + '</div>' +
    '<div style="margin-top:6px">Analis: <b>' + esc(name) + '</b></div>' +
    (prev.duplicate.status === 'bentrok' ? '<div style="margin-top:10px;padding:10px 12px;border-radius:var(--pharos-radius);background:var(--pharos-yellow-tint);color:var(--pharos-warn-ink)"><b>Identitas run sudah ada</b> dengan nilai yang berbeda. Pilih tindakan.</div>' : '') + '</div>';
  var btns = prev.duplicate.status === 'bentrok'
    ? [{ text: 'Batal', value: null }, { text: 'Simpan sebagai run ulang', value: 'ulang' }, { text: 'Timpa run lama', value: 'timpa', primary: true }]
    : [{ text: 'Batal', value: null }, { text: 'Simpan ke database', value: 'simpan', primary: true }];
  dialog('Konfirmasi simpan', sum, btns).then(function (choice) {
    if (!choice) return;
    save.setAttribute('aria-disabled', 'true');
    okAna().then(function (a) {
      if (a.status !== 200) { toast(a.j.error || 'Nama analis belum valid.'); saveUpdate(); return null; }
      var key = JSON.stringify([PID, c, choice]);
      var pid = pushIdFor(key);
      var body = JSON.parse(JSON.stringify(c)); body.push_id = pid; if (choice === 'ulang' || choice === 'timpa') body.decision = choice;
      return api('POST', '/api/products/' + PID + '/runs', body);
    }).then(function (r) {
      if (!r) return;
      if (r.status === 200 || r.status === 201) {
        st.fresh = { batch: c.batch, key: c.variant ? c.batch + ' ' + c.variant : c.batch, mid: c.medium, medName: mi ? mi.name : '', f2: r.j.f2_langkah4, kind: r.j.kind_langkah4, ana: name };
        var sk = st.fresh.key; resetForm();
        reloadDash().then(function () { var i = st.sel.indexOf(sk); if (i < 0) { st.sel = [sk].concat(st.sel).slice(0, 4); } api('GET', '/api/products/' + PID).then(function (x) { INFO = x.j; location.hash = '#dashboard'; route(); }); });
      } else { toast((r.j.error || 'Simpan gagal') + (r.j.details ? ': ' + r.j.details.join('; ') : '')); saveUpdate(); }
    });
  });
}
function pushIdFor(key) {   // push_id tetap untuk isi yang sama, sehingga klik ganda atau ulang aman (idempoten)
  var k = 'udt_f6_push_' + key.length + '_' + hash32(key), v = null;
  try { v = sessionStorage.getItem(k); if (!v) { v = uuid(); sessionStorage.setItem(k, v); } } catch (e) { v = v || uuid(); }
  return v;
}
function hash32(s) { var h = 5381, i; for (i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16); }
function resetForm() { $('f-batch').value = ''; $('f-var').value = ''; TP = [0, 5, 10, 15, 20, 30, 45, 60]; buildGrid(); lastPrev = null; paintPreview(null, null); }

// ---------- rute ----------
function route() {
  if (!ME) return;
  var h = location.hash.replace('#', '') || 'dashboard';
  if (['form', 'dashboard', 'users'].indexOf(h) < 0) h = 'dashboard';
  if (h === 'form' && !isWriter()) h = 'dashboard';
  if (h === 'users' && !isAdmin()) h = 'dashboard';
  showView(h);
  [['navF', 'form'], ['navD', 'dashboard']].forEach(function (x) { var el = $(x[0]); el.className = h === x[1] ? 'on' : ''; if (h === x[1]) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
  if (h === 'users') loadUsers();
  if (h === 'dashboard' && D) render();
  if (h === 'form') { fillForm(); schedulePreview(); }
  window.scrollTo(0, 0);
}
// ---------- panel Pengguna (admin) ----------
var ROLE_OPT = ['pembaca', 'penulis', 'admin'];
function loadUsers() {
  api('GET', '/api/admin/users').then(function (r) {
    if (r.status !== 200) { $('usList').textContent = r.j.error || 'Gagal memuat.'; return; }
    $('usList').innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>' + ['Nama', 'Email', 'Peran', 'Status', 'Masuk terakhir', 'Tindakan'].map(function (h) { return '<th scope="col" style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--pharos-line);color:var(--pharos-slate)">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
      r.j.users.map(function (u) {
        var me = u.user_id === ME.user_id;
        return '<tr><td style="padding:6px 8px;border-bottom:1px solid var(--pharos-line)">' + esc(u.display_name) + (me ? ' (Anda)' : '') + '</td><td style="padding:6px 8px;border-bottom:1px solid var(--pharos-line)">' + esc(u.email) + '</td>' +
          '<td style="padding:6px 8px;border-bottom:1px solid var(--pharos-line)"><select data-uid="' + u.user_id + '" data-act="role" aria-label="Peran ' + esc(u.display_name) + '"' + (me ? ' disabled' : '') + '>' + ROLE_OPT.map(function (o) { return '<option' + (o === u.role ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select></td>' +
          '<td style="padding:6px 8px;border-bottom:1px solid var(--pharos-line)">' + (u.is_active ? 'aktif' : 'nonaktif') + (u.must_change_password ? ' · sandi sementara' : '') + '</td>' +
          '<td style="padding:6px 8px;border-bottom:1px solid var(--pharos-line)">' + (u.last_login_at ? esc(String(u.last_login_at).slice(0, 16).replace('T', ' ')) : '–') + '</td>' +
          '<td style="padding:6px 8px;border-bottom:1px solid var(--pharos-line);white-space:nowrap"><button type="button" data-uid="' + u.user_id + '" data-act="reset" style="min-height:36px">Setel ulang sandi</button> <button type="button" data-uid="' + u.user_id + '" data-act="toggle" data-on="' + (u.is_active ? '0' : '1') + '" style="min-height:36px"' + (me ? ' disabled' : '') + '>' + (u.is_active ? 'Nonaktifkan' : 'Aktifkan') + '</button></td></tr>';
      }).join('') + '</tbody></table>';
  });
}
function showTemp(title, u, temp) {
  return dialog(title, '<p>' + esc(u.display_name) + ' (' + esc(u.email) + ')</p><p>Kata sandi sementara (<b>hanya tampil sekali</b>, salin sekarang; pengguna wajib menggantinya saat masuk pertama):</p><p style="font-family:monospace;font-size:18px;user-select:all;background:var(--pharos-gray-soft);padding:10px;border-radius:var(--pharos-radius)">' + esc(temp) + '</p>', [{ text: 'Sudah saya catat', value: 1, primary: true }]);
}
$('usList').addEventListener('click', function (e) {
  var b = e.target.closest('button[data-act]'); if (!b) return; var id = Number(b.getAttribute('data-uid'));
  if (b.getAttribute('data-act') === 'reset') api('PATCH', '/api/admin/users/' + id, { reset_password: true }).then(function (r) { if (r.status === 200) showTemp('Kata sandi sementara baru', r.j.user, r.j.temporary_password); else toast(r.j.error || 'Gagal.'); loadUsers(); });
  if (b.getAttribute('data-act') === 'toggle') api('PATCH', '/api/admin/users/' + id, { is_active: b.getAttribute('data-on') === '1' }).then(function (r) { if (r.status !== 200) toast(r.j.error || 'Gagal.'); loadUsers(); });
});
$('usList').addEventListener('change', function (e) {
  var s = e.target; if (s.getAttribute('data-act') !== 'role') return;
  api('PATCH', '/api/admin/users/' + Number(s.getAttribute('data-uid')), { role: s.value }).then(function (r) { if (r.status !== 200) toast(r.j.error || 'Gagal.'); loadUsers(); });
});
$('usForm').addEventListener('submit', function (e) {
  e.preventDefault();
  api('POST', '/api/admin/users', { email: $('us-em').value, display_name: $('us-nm').value, role: $('us-rl').value }).then(function (r) {
    if (r.status === 201) { $('usForm').reset(); showTemp('Akun dibuat', r.j.user, r.j.temporary_password); loadUsers(); } else $('us-er').textContent = (r.j.error || 'Gagal') + (r.j.details ? ': ' + r.j.details.join('; ') : '');
  });
});
window.addEventListener('hashchange', route);
window.__udt = { state: st, route: route, render: render };
buildGrid();
boot();
})();
