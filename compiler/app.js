/* UDT Compiler: UI dari HTML tim (Mockup_Langkah6_Compile_UDT_Vastrol_v3.html), tampilan/kelas/teks dipertahankan.
   Beda dari mockup: data berasal dari API (bukan var D tertanam); TIDAK ada rumus f2/statistik di sini (server yang menghitung:
   f2_sheet aturan tim dan f2_langkah4 modul asli); tombol dan isian tersambung ke server (docs/KONTRAK_API_COMPILER.md). Teks dari server dirender lewat esc(). */
(function () {
'use strict';
var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
var SLOT = ['#1D63D6', '#C2410C', '#7C3AED', '#0F766E'];
var IC = {
  sim: '<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  rap: '<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4l4.2 4L3 12M8.5 4l4.2 4-4.2 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  not: '<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  inv: '<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M5 8h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
};
var KT = { sim: 'Similar', rap: 'Similar (sangat cepat, f2 hanya informasi)', not: 'Not Similar' };
var WARN = '<svg width="15" height="15" viewBox="0 0 16 16" role="img" aria-label="Ada peringatan"><path d="M8 1.8L15 14H1z" fill="#FFF1C9" stroke="#8A5A00" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 6.2v3.6" stroke="#8A5A00" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.9" r=".9" fill="#8A5A00"/></svg>';
var okIcon = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style="flex:none;margin-top:2px"><circle cx="8" cy="8" r="7" fill="#E7F0FD"/><path d="M4.5 8.4l2.4 2.4 4.6-4.8" fill="none" stroke="#0B3F87" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var warnIcon = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style="flex:none;margin-top:2px"><path d="M8 1.8L15 14H1z" fill="#FFF1C9" stroke="#8A5A00" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 6.2v3.6" stroke="#8A5A00" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.9" r=".9" fill="#8A5A00"/></svg>';
var infoIcon = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style="flex:none;margin-top:2px"><circle cx="8" cy="8" r="7" fill="#EEF1F5"/><path d="M8 7.2v4" stroke="#2F3A48" stroke-width="1.7" stroke-linecap="round"/><circle cx="8" cy="4.9" r=".95" fill="#2F3A48"/></svg>';
var TONE = { warn: 'background:#FFF1C9;color:#6B4400', bad: 'background:#FDEDE1;color:#8F3010', info: 'background:#EEF1F5;color:#2F3A48' };
var INP_ON = 'width:100%;height:36px;padding:0 8px;border:1px solid #C9D0DA;border-radius:6px;background:#fff;font-size:13px;text-align:right;font-variant-numeric:tabular-nums;color:#14181F';
var INP_OFF = 'width:100%;height:36px;padding:0 8px;border:1px solid #E1E5EB;border-radius:6px;background:#FAFBFC;font-size:13px;text-align:right';
var INP_ZERO = INP_ON + ';background:#F7F9FC;color:#5A6575';
var TD_STAT = 'padding:6px 8px;text-align:right;font-variant-numeric:tabular-nums;font-size:13px;';
var TH_COL = 'padding:6px 3px;font-weight:600;font-size:12px;color:#3B4452;text-align:center';

function $(id) { return document.getElementById(id); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function fdate(s) { var p = s.split('-'); return Number(p[2]) + ' ' + MON[parseInt(p[1], 10) - 1] + ' ' + p[0]; }
function fmt(x, d) { return (typeof x === 'number' && isFinite(x)) ? x.toFixed(d == null ? 1 : d).replace('.', ',') : '–'; }
function api(method, path, body, raw) {
  var h = {}, b;
  if (raw) { h = raw.headers; b = raw.body; } else if (body) { h['content-type'] = 'application/json'; b = JSON.stringify(body); }
  return fetch(path, { method: method, credentials: 'same-origin', headers: h, body: b }).then(function (r) {
    return r.json().catch(function () { return {}; }).then(function (j) { if (r.status === 401 && path !== '/api/auth/login') { showLogin(''); } return { status: r.status, j: j }; });
  });
}
function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  var b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}

var ME = null, PRODUCTS = [], PID = null, D = null, INFO = null;
var st = { comp: null, sel: [], q: '', inc: 'valid', month: '', fresh: null };

// ---------- dialog ----------
function dialog(title, bodyHtml, buttons, read) {
  return new Promise(function (resolve) {
    var root = $('dlgRoot'), back = document.createElement('div');
    back.style.cssText = 'position:fixed;inset:0;background:rgba(20,24,31,.5);z-index:100;display:flex;align-items:center;justify-content:center;padding:12px;font-family:Inter,system-ui,sans-serif';
    var box = document.createElement('div'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', title);
    box.style.cssText = 'background:#fff;border-radius:10px;max-width:560px;width:100%;max-height:90vh;overflow:auto;padding:18px 20px;color:#14181F;font-size:14px;line-height:1.45;box-shadow:0 8px 32px rgba(0,0,0,.3)';
    box.innerHTML = '<h2 style="margin:0 0 10px;font-family:\'Space Grotesk\',Inter,sans-serif;font-size:18px;font-weight:600">' + esc(title) + '</h2><div id="dlgBody">' + bodyHtml + '</div><div id="dlgBtns" style="display:flex;flex-wrap:wrap;gap:10px;margin-top:16px;justify-content:flex-end"></div>';
    back.appendChild(box); root.appendChild(back);
    function done(v) { document.removeEventListener('keydown', onKey); if (read) dialog.last = read(box); back.remove(); resolve(v); }
    function onKey(e) { if (e.key === 'Escape') done(null); }
    document.addEventListener('keydown', onKey);
    var first = null;
    buttons.forEach(function (b) {
      var el = document.createElement('button'); el.type = 'button'; el.textContent = b.text;
      el.style.cssText = 'min-height:44px;padding:0 18px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;' + (b.primary ? 'border:0;background:#0B4FA8;color:#fff' : 'border:1px solid #0B4FA8;background:#fff;color:#0B4FA8');
      el.addEventListener('click', function () { done(b.value); });
      $('dlgBtns').appendChild(el); if (!first || b.primary) first = el;
    });
    if (first) first.focus();
  });
}

// ---------- login / sesi ----------
function showView(name) {
  ['login', 'form', 'dashboard'].forEach(function (v) { $(v).style.display = v === name ? 'block' : 'none'; });
  $('topnav').style.display = name === 'login' ? 'none' : 'block';
}
function showLogin(msg) { ME = null; showView('login'); $('l-err').textContent = msg || ''; }
$('loginForm').addEventListener('submit', function (e) {
  e.preventDefault();
  api('POST', '/api/auth/login', { password: $('l-pw').value }).then(function (r) {
    $('l-pw').value = '';
    if (r.status === 200) boot(); else $('l-err').textContent = r.j.error || 'Masuk gagal';
  });
});
$('reset').addEventListener('click', function (e) { e.preventDefault(); api('POST', '/api/auth/logout').then(function () { D = null; showLogin(''); }); });

function isWriter() { return ME && ME.role === 'penulis'; }
function boot() {
  api('GET', '/api/me').then(function (r) {
    if (r.status !== 200) { showLogin(''); return; }
    ME = r.j;
    document.body.setAttribute('data-role', ME.role);
    $('navF').style.display = isWriter() ? '' : 'none';
    $('addRunLink').style.display = isWriter() ? '' : 'none';
    $('lblNav').textContent = 'UDT Compiler · ' + (isWriter() ? 'penulis' : 'pembaca');
    return api('GET', '/api/products').then(function (p) {
      PRODUCTS = p.j.products || [];
      var q = new URLSearchParams(location.search).get('p'), saved = null;
      try { saved = sessionStorage.getItem('udt_prod'); } catch (x) { saved = null; }
      var pick = PRODUCTS.filter(function (x) { return String(x.id) === (q || saved); })[0] || PRODUCTS.filter(function (x) { return x.run_count > 0; })[0] || PRODUCTS[0];
      fillPicker(pick ? pick.id : null);
      if (pick) return selectProduct(pick.id); D = null; route();
    });
  }).catch(function () { showLogin('Server tidak terjangkau.'); });
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
    var rows = visibleRows(true); st.sel = rows.filter(function (r) { return anyValid(r); }).slice(0, 3).map(function (r) { return r.key; });
    $('prodPick').value = String(id);
    fillMonths(); fillForm();
    route();
  });
}
function reloadDash() { return api('GET', '/api/products/' + PID + '/dashboard').then(function (r) { if (r.status === 200) { D = r.j; if (!D.comps[st.comp]) st.comp = D.comp_order[0] || null; fillMonths(); } }); }

// ---------- dashboard ----------
function runBy(k) { for (var i = 0; i < D.runs.length; i++) { if (D.runs[i].key === k) return D.runs[i]; } return null; }
function anyValid(r) { return Object.keys(r.prof).some(function (m) { return r.prof[m].valid; }); }
function visibleRows(skipQ) {
  return D.runs.filter(function (r) { return !r.comp; }).filter(function (r) {
    if (st.inc === 'valid' && !anyValid(r)) return false;
    if (st.month && String(r.date).indexOf(st.month) !== 0) return false;
    if (!skipQ && st.q && r.key.toLowerCase().indexOf(st.q.toLowerCase()) < 0) return false;
    return true;
  });
}
function fillMonths() {
  var p = D.product, opts = '<option value="">Semua' + (p.date_min ? ' (' + fdate(p.date_min) + ' – ' + fdate(p.date_max) + ')' : '') + '</option>';
  (p.months || []).forEach(function (m) { var x = m.split('-'); opts += '<option value="' + m + '"' + (st.month === m ? ' selected' : '') + '>' + MON[parseInt(x[1], 10) - 1] + ' ' + x[0] + '</option>'; });
  $('dt').innerHTML = opts;
}
function shapePath(sh, x, y, r) {
  var f = function (n) { return n.toFixed(1); };
  if (sh === 0) return 'M' + f(x - r) + ' ' + f(y) + 'a' + r + ' ' + r + ' 0 1 0 ' + f(2 * r) + ' 0a' + r + ' ' + r + ' 0 1 0 ' + f(-2 * r) + ' 0z';
  if (sh === 1) return 'M' + f(x - r) + ' ' + f(y - r) + 'h' + f(2 * r) + 'v' + f(2 * r) + 'h' + f(-2 * r) + 'z';
  if (sh === 2) return 'M' + f(x) + ' ' + f(y - r * 1.2) + 'L' + f(x + r * 1.1) + ' ' + f(y + r * 0.9) + 'L' + f(x - r * 1.1) + ' ' + f(y + r * 0.9) + 'z';
  return 'M' + f(x) + ' ' + f(y - r * 1.25) + 'L' + f(x + r * 1.25) + ' ' + f(y) + 'L' + f(x) + ' ' + f(y + r * 1.25) + 'L' + f(x - r * 1.25) + ' ' + f(y) + 'z';
}
function cellHtml(c) { return '<div role="cell"><div class="cell ' + c.cls + '" title="' + esc(c.tip) + '">' + (c.kind ? IC[c.kind] : '') + '<span>' + c.txt + '</span></div></div>'; }
function noticeHtml() {
  if (!st.fresh) return '';
  var f = st.fresh;
  return '<div role="status" style="border-radius:10px;padding:12px 16px;font-size:13.5px;background:#E7F0FD;border:1px solid #9DBDF0;color:#0B3F87"><b>Run ' + esc(f.batch) + ' ' + esc(f.medName) + ' masuk database</b> dan sekarang tampil di dashboard' + (f.f2 !== null ? ' (f2 ' + fmt(f.f2) + ' · ' + esc(KT[f.kind] || '') + ')' : '') + '. Disimpan oleh ' + esc(f.ana) + '.</div>';
}
function render() {
  if (!D) { return; }
  var p = D.product;
  $('dashTitle').textContent = 'Compile profil disolusi — ' + p.name;
  $('dashApi').textContent = p.api ? (p.api_uncertain ? 'API belum pasti (sheet menulis ' + p.api + ')' : 'API ' + p.api) : '';
  var comp = D.comps[st.comp], other = null;
  D.comp_order.forEach(function (k) { if (!other && k !== st.comp) other = D.comps[k]; });
  var cRun = comp ? runBy(comp.key) : null, oRun = other ? runBy(other.key) : null, nNot = 0;
  var TM = D.times, maxT = TM[TM.length - 1] || 60;
  function cellOf(run, mid) { var m = (D.cells[st.comp] || {})[run.key]; return m ? m[mid] : null; }
  function cellsFor(run, count) {
    var out = [];
    D.media.forEach(function (m) {
      var pf = run.prof[m.id], cp = cRun && cRun.prof[m.id], c = (comp && cp && pf) ? cellOf(run, m.id) : null;
      if (!m.has || !pf || !cp || !c || run.key === (comp && comp.key)) { out.push({ kind: '', cls: 'k-none', txt: '\u2014', tip: m.has ? 'Tidak ada data' : 'Belum ada data ' + m.name }); return; }
      if (!pf.valid) {
        if (st.inc === 'valid') { out.push({ kind: '', cls: 'k-none', txt: '\u2014', tip: 'Run tidak valid (disembunyikan)' }); return; }
        out.push({ kind: 'inv', cls: 'k-inv', txt: fmt(c.f2s), tip: 'Run tidak valid: ' + (run.invalid[m.id] || '') }); return;
      }
      if (count && c.ks === 'not') nNot++;
      var fresh = st.fresh && st.fresh.key === run.key && st.fresh.mid === m.id;
      out.push({ kind: c.ks, cls: 'k-' + c.ks + (fresh ? ' newc' : ''), txt: fmt(c.f2s), tip: 'f2 ' + fmt(c.f2s) + ' \u2014 ' + KT[c.ks] + (c.beda ? ' \u00b7 Langkah 4: f2 ' + fmt(c.f2l) + ' (' + (KT[c.kl] || '\u2013') + ')' : '') });
    });
    return out;
  }
  var all = visibleRows(true), rows = visibleRows(false), cellsByKey = {};
  all.forEach(function (r) { cellsByKey[r.key] = cellsFor(r, true); });
  $('compBtns').innerHTML = D.comp_order.map(function (id) { var c = D.comps[id], on = st.comp === id; return '<button type="button" class="seg' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-comp="' + esc(id) + '"><b>' + esc(c.name) + '</b><span>' + esc(c.lot) + '</span></button>'; }).join('');
  var big = "font-family:'Space Grotesk',Inter,sans-serif;font-weight:600;font-size:30px;line-height:1.1";
  var withData = D.media.filter(function (m) { return m.has; }).length, empty = D.media.filter(function (m) { return !m.has; }).map(function (m) { return m.name; });
  var fl = D.findings.filter(function (f) { return !f.comp || f.comp === st.comp; });
  $('stats').innerHTML = '<div><div style="' + big + '">' + all.length + '</div><div style="color:#556070;font-size:13px">batch ' + esc(p.name.split(' ')[0]) + ' terkompilasi</div></div>' +
    '<div><div style="' + big + '">' + withData + ' <span style="font-size:18px;color:#556070">dari ' + D.media.length + '</span></div><div style="color:#556070;font-size:13px">medium berisi data' + (empty.length ? ' (' + esc(empty.join(', ')) + ' kosong)' : '') + '</div></div>' +
    '<div><div style="' + big + ';color:#8F3010">' + nNot + '</div><div style="color:#556070;font-size:13px">hasil Not Similar terhadap ' + esc(comp ? comp.name : '–') + '</div></div>' +
    '<div><div style="' + big + ';color:#8A5A00">' + fl.length + '</div><div style="color:#556070;font-size:13px">temuan perlu dicek (di bawah)</div></div>';
  $('notice').innerHTML = noticeHtml();
  $('mxTitle').textContent = 'Matriks f2 terhadap ' + (comp ? comp.name : '–');
  var heads = D.media.map(function (m, j) { var n = 0; all.forEach(function (r) { if (cellsByKey[r.key][j].kind === 'not') n++; }); return '<div role="columnheader" style="text-align:center;padding:8px 0"><div>' + esc(m.name) + '</div><div class="' + (n > 0 ? 'sum-not' : 'sum-ok') + '" style="font-weight:400;font-size:11px">' + (m.has ? n + ' Not Similar' : 'kosong') + '</div></div>'; }).join('');
  var h = '<div role="row" class="rw hd"><div role="columnheader"><span style="position:absolute;left:-9999px">Tampilkan di grafik</span></div><div role="columnheader" style="text-align:left;padding:8px 0">Batch</div>' + heads + '</div>';
  if (comp) h += '<div role="row" class="rw pin"><div></div><div role="cell" style="padding:6px 8px 6px 0"><div style="font-weight:600">' + esc(comp.name) + ' <span style="font-size:11px;background:#14181F;color:#fff;border-radius:4px;padding:1px 6px;margin-left:4px">Aktif</span></div><div style="font-size:11.5px;color:#556070">' + esc(comp.lot) + (comp.maker ? ' \u00b7 ' + esc(comp.maker) : '') + '</div></div>' + cellsFor(cRun, false).map(cellHtml).join('') + '</div>';
  if (other) h += '<div role="row" class="rw pin"><div></div><div role="cell" style="padding:6px 8px 6px 0"><div style="font-weight:600">' + esc(other.name) + '</div><div style="font-size:11.5px;color:#556070">Pembanding lain \u00b7 ' + esc(other.lot) + ' \u00b7 f2 terhadap yang aktif</div></div>' + cellsFor(oRun, false).map(cellHtml).join('') + '</div>';
  rows.forEach(function (r) {
    var idx = st.sel.indexOf(r.key), w = D.warn[r.key];
    h += '<div role="row" class="rw"><div role="cell"><label style="display:flex;align-items:center;justify-content:center;width:44px;height:48px;cursor:pointer"><input type="checkbox" data-key="' + esc(r.key) + '"' + (idx >= 0 ? ' checked' : '') + ' aria-label="Tampilkan ' + esc(r.key) + ' pada grafik" style="width:18px;height:18px;margin:0;cursor:pointer"></label></div>' +
      '<div role="cell" style="padding:4px 8px 4px 0"><div style="display:flex;align-items:center;gap:7px"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="' + (idx >= 0 ? shapePath(idx, 7, 7, 4.2) : '') + '" fill="' + (idx >= 0 ? SLOT[idx] : 'transparent') + '"/></svg><span style="font-weight:600;font-variant-numeric:tabular-nums">' + esc(r.code) + '</span>' + (r.variant ? '<span style="font-size:11px;background:#EEF1F5;color:#2F3A48;border-radius:4px;padding:1px 6px;white-space:nowrap">' + esc(r.variant) + '</span>' : '') + (w ? '<span title="' + esc(w) + '" style="display:inline-flex">' + WARN + '</span>' : '') + '</div><div style="font-size:11.5px;color:#556070;padding-left:21px">' + (r.date ? fdate(r.date) : 'tanggal kosong') + '</div></div>' + cellsByKey[r.key].map(cellHtml).join('') + '</div>';
  });
  if (!rows.length) h += '<div style="padding:18px 16px;color:#556070">' + (D.runs.length ? 'Tidak ada batch yang cocok dengan pencarian.' : 'Belum ada data. Tambahkan run lewat Tambah data run.') + '</div>';
  $('matrix').innerHTML = h;
  var lg = '<span style="font-weight:600;font-family:\'Space Grotesk\',Inter,sans-serif;font-size:16px;margin-right:4px">Profil rerata, ' + D.media.length + ' medium</span>';
  if (comp) lg += '<span style="display:inline-flex;align-items:center;gap:6px"><svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true"><line x1="1" y1="5" x2="25" y2="5" stroke="#14181F" stroke-width="3" stroke-linecap="round"/></svg>' + esc(comp.name) + ' (aktif)</span>';
  if (other) lg += '<span style="display:inline-flex;align-items:center;gap:6px"><svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true"><line x1="1" y1="5" x2="25" y2="5" stroke="#6B7280" stroke-width="2" stroke-dasharray="6 4" stroke-linecap="round"/></svg>' + esc(other.name) + '</span>';
  st.sel.forEach(function (k, i) { var r = runBy(k); if (!r) return; lg += '<span style="display:inline-flex;align-items:center;gap:6px"><svg width="26" height="14" viewBox="0 0 26 14" aria-hidden="true"><line x1="1" y1="7" x2="25" y2="7" stroke="' + SLOT[i] + '" stroke-width="2" stroke-linecap="round"/><path d="' + shapePath(i, 7, 7, 4.2) + '" transform="translate(6 0)" fill="' + SLOT[i] + '" stroke="#fff" stroke-width="1"/></svg>' + esc(r.code) + (r.variant ? ' ' + esc(r.variant) : '') + '</span>'; });
  lg += '<span style="display:inline-flex;align-items:center;gap:6px;color:#556070"><svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true"><line x1="1" y1="5" x2="25" y2="5" stroke="#8A94A3" stroke-width="1" stroke-dasharray="2 3"/></svg>85%</span>';
  $('legend').innerHTML = lg;
  var W = 400, H = 250, ml = 40, mr = 16, mt = 12, mb = 32, pw = W - ml - mr, ph = H - mt - mb;
  function px(t) { return ml + t / maxT * pw; } function py(v) { return mt + (1 - v / 110) * ph; }
  function pts(a) { var o = []; TM.forEach(function (t, i) { if (a[i] !== null && a[i] !== undefined) o.push(px(t).toFixed(1) + ',' + py(a[i]).toFixed(1)); }); return o.join(' '); }
  var ticks = TM.filter(function (t) { return t === 0 || t % 10 === 0 || t === 45; });
  $('panels').innerHTML = D.media.map(function (m) {
    var head = '<div style="display:flex;flex-direction:column"><h3 style="margin:0;font-size:15px;font-weight:600;font-family:\'Space Grotesk\',Inter,sans-serif">' + esc(m.name) + '</h3><div style="font-size:12px;color:#556070">' + esc(m.desc) + '</div></div>';
    var art = '<article style="background:#fff;border:1px solid #DCE1E8;border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:8px;min-width:0">' + head;
    if (!m.has) return art + '<div style="min-height:300px;border:1px dashed #B8C0CC;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;padding:20px;color:#3B4452"><div style="font-weight:600">Belum ada data ' + esc(m.name) + ' untuk ' + esc(p.name.split(' ')[0]) + '</div><div style="font-size:12.5px;color:#556070;max-width:240px">Kuadran ini terisi setelah satu run medium ' + esc(m.name) + ' ditambahkan.</div>' + (isWriter() ? '<a href="#form" data-addmed="' + esc(m.id) + '" style="display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border:1px solid #0B4FA8;border-radius:8px;font-weight:600;font-size:13px;text-decoration:none">Tambah data ' + esc(m.name) + '</a>' : '') + '</div></article>';
    var s = '<svg viewBox="0 0 400 250" role="img" aria-label="Profil disolusi rerata pada ' + esc(m.name) + '" style="width:100%;height:auto;display:block">';
    [0, 25, 50, 75, 100].forEach(function (v) { s += '<line class="gl" x1="' + ml + '" y1="' + py(v).toFixed(1) + '" x2="' + (W - mr) + '" y2="' + py(v).toFixed(1) + '"/><text class="tk te" x="' + (ml - 6) + '" y="' + (py(v) + 3.5).toFixed(1) + '">' + v + '</text>'; });
    ticks.forEach(function (t) { s += '<text class="tk tm" x="' + px(t).toFixed(1) + '" y="' + (H - 14) + '">' + t + '</text>'; });
    s += '<line class="thr" x1="' + ml + '" y1="' + py(85).toFixed(1) + '" x2="' + (W - mr) + '" y2="' + py(85).toFixed(1) + '"/>';
    var oP = oRun && oRun.prof[m.id], cP = cRun && cRun.prof[m.id], dots = '', chips = '';
    if (oP) s += '<polyline class="ln w2 d1" points="' + pts(oP.avg) + '" stroke="#6B7280"/>';
    if (cP) s += '<polyline class="ln w3" points="' + pts(cP.avg) + '" stroke="#14181F"/>';
    st.sel.forEach(function (k, i) {
      var r = runBy(k), pf = r && r.prof[m.id]; if (!pf || !cP || (!pf.valid && st.inc === 'valid')) return;
      s += '<polyline class="ln w2" points="' + pts(pf.avg) + '" stroke="' + SLOT[i] + '"/>';
      TM.forEach(function (t, q) { if (q > 0 && pf.avg[q] !== null) dots += '<path class="dot" d="' + shapePath(i, px(t), py(pf.avg[q]), 3.6) + '" fill="' + SLOT[i] + '"/>'; });
      var c = cellOf(r, m.id); if (!c) return;
      chips += '<span class="chip k-' + c.ks + '"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="' + shapePath(i, 7, 7, 4.2) + '" fill="' + SLOT[i] + '" stroke="#fff" stroke-width="1"/></svg>' + esc(r.code) + (r.variant ? ' ' + esc(r.variant) : '') + ' \u00b7 ' + fmt(c.f2s) + '</span>';
    });
    s += dots + '<text class="tk tm" x="' + (ml + pw / 2) + '" y="' + (H - 2) + '">Waktu (menit)</text></svg>';
    return art + s + '<div style="display:flex;flex-wrap:wrap;gap:6px">' + chips + '</div></article>';
  }).join('');
  $('chartNote').textContent = 'Angka pada label batch adalah f2 terhadap ' + (comp ? comp.name : '–') + '. Sumbu y: % terlarut rerata; sumbu x: menit.';
  $('flagBody').innerHTML = fl.length ? fl.map(function (f) {
    return '<tr class="flagrow"><td style="padding-left:16px;font-weight:600">' + esc(f.batch) + '</td><td>' + esc(f.medium) + '</td><td><span class="chip" style="' + (TONE[f.tone] || TONE.info) + '">' + esc(f.type) + '</span></td><td style="padding-right:16px">' + esc(f.text) + '</td></tr>';
  }).join('') : '<tr class="flagrow"><td colspan="4" style="padding-left:16px;color:#556070">Tidak ada temuan.</td></tr>';
  var ex = ''; var lk = 'display:flex;align-items:center;min-height:40px;padding:0 12px;border-radius:6px;color:#14181F;text-decoration:none;font-size:13.5px';
  [['xlsx', 'Excel (.xlsx) \u2014 format sheet lama'], ['csv', 'CSV (.csv)'], ['tsv', 'TSV (.tsv)']].forEach(function (x) { ex += '<a role="menuitem" href="/api/products/' + PID + '/export?format=' + x[0] + '" style="' + lk + '">' + x[1] + '</a>'; });
  $('expMenu').innerHTML = ex;
}
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-comp]'); if (b) { st.comp = b.getAttribute('data-comp'); st.fresh = null; render(); return; }
  var t = e.target.closest('#expBtn');
  if (t) { var mn = $('expMenu'), open = mn.style.display !== 'flex'; mn.style.display = open ? 'flex' : 'none'; t.setAttribute('aria-expanded', open ? 'true' : 'false'); return; }
  if (!e.target.closest('#expMenu')) $('expMenu').style.display = 'none';
  var am = e.target.closest('[data-addmed]'); if (am) { st.wantMed = am.getAttribute('data-addmed'); }
});
document.addEventListener('change', function (e) {
  var k = e.target.getAttribute && e.target.getAttribute('data-key'); if (!k) return;
  var s = st.sel.slice(), i = s.indexOf(k); if (i >= 0) s.splice(i, 1); else { if (s.length >= 4) s.shift(); s.push(k); } st.sel = s; st.fresh = null; render();
});
$('st').addEventListener('change', function (e) { st.inc = e.target.value; st.fresh = null; render(); });
$('q').addEventListener('input', function (e) { st.q = e.target.value; render(); });
$('dt').addEventListener('change', function (e) { st.month = e.target.value; st.fresh = null; render(); });

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
  if (ME && ME.analyst && !$('f-ana').value) $('f-ana').value = ME.analyst;
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
    h += '<tr><th scope="row" style="padding:2px 8px;font-size:12.5px;font-weight:600;color:#3B4452;text-align:left;white-space:nowrap">Vessel ' + (v + 1) + '</th>';
    TP.forEach(function (t, c) {
      if (c === 0) h += '<td style="padding:2px 3px"><input value="0" readonly aria-label="Vessel ' + (v + 1) + ', menit 0" style="' + INP_ZERO + '"></td>';
      else h += '<td style="padding:2px 3px"><input id="g-' + v + '-' + c + '" data-v="' + v + '" data-c="' + c + '" inputmode="decimal" autocomplete="off" value="' + esc(old && old[v] && old[v][c] != null ? old[v][c] : '') + '" aria-label="Vessel ' + (v + 1) + ', menit ' + t + '" style="' + INP_OFF + '"></td>';
    });
    h += '</tr>';
  }
  [['avg', 'Rata-rata'], ['min', 'Min'], ['max', 'Maks'], ['rsd', 'RSD (%)']].forEach(function (s) {
    h += '<tr style="background:#F3F5F8"><th scope="row" style="padding:6px 8px;font-size:12.5px;font-weight:600;color:#3B4452;text-align:left">' + s[1] + '</th>';
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
  Array.prototype.forEach.call(inputs, function (el) { var n = numOf(el.value); el.style.cssText = (el.value.trim() === '' ? INP_OFF : (isNaN(n) ? INP_ON + ';border-color:#B45309;background:#FFFBF0' : INP_ON)); });
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
  var KB = { sim: ['#E7F0FD', '#0B3F87', 'Similar'], rap: ['#EEF1F5', '#2F3A48', 'Similar (sangat cepat)'], not: ['#FDEDE1', '#8F3010', 'Not Similar'] };
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
  if (f && f.sheet.f2 !== null) {
    var k = KB[f.sheet.kind] || KB.not;
    $('pvF2').textContent = fmt(f.sheet.f2);
    var b = $('pvBadge'); b.style.display = 'inline-flex'; b.style.background = k[0]; b.style.color = k[1]; b.innerHTML = IC[f.sheet.kind].replace(/width="13" height="13"/, 'width="16" height="16"') + esc(k[2]);
    $('pvNote').textContent = 'f2 terhadap ' + f.ref.name + ' (' + f.ref.lot + '), ' + medName + '. n = ' + f.sheet.n + ' titik (' + f.sheet.minutes.map(function (t) { return t + "'"; }).join(', ') + '); jumlah kuadrat selisih = ' + fmt(f.sheet.sumsq, 2) + '; A = ' + fmt(f.sheet.a, 3) + '. Nilai Langkah 4 (aturan pemotongan titik): f2 ' + fmt(f.langkah4.f2) + ', n = ' + f.langkah4.n + '.';
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
  [0, 25, 50, 75, 100].forEach(function (v) { s += '<line x1="38" y1="' + y(v) + '" x2="386" y2="' + y(v) + '" stroke="#E6EAF0"/><text x="32" y="' + (parseFloat(y(v)) + 3.5).toFixed(1) + '" text-anchor="end" font-size="10.5" fill="#5A6575" font-family="Inter,sans-serif">' + v + '</text>'; });
  times.filter(function (t) { return t === 0 || t % 10 === 0 || t === 45; }).forEach(function (t) { s += '<text x="' + x(t) + '" y="228" text-anchor="middle" font-size="10.5" fill="#5A6575" font-family="Inter,sans-serif">' + t + '</text>'; });
  s += '<line x1="38" y1="' + y(85) + '" x2="386" y2="' + y(85) + '" stroke="#8A94A3" stroke-dasharray="2 3"/>';
  s += '<polyline points="' + poly(f.ref.avg) + '" fill="none" stroke="#14181F" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>';
  s += '<polyline points="' + poly(f.test_avg) + '" fill="none" stroke="#1D63D6" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
  times.forEach(function (t, i) { if (i > 0 && f.test_avg[i] !== null) s += '<circle cx="' + x(t) + '" cy="' + y(f.test_avg[i]) + '" r="3.6" fill="#1D63D6" stroke="#fff"/>'; });
  $('pvChart').innerHTML = s + '</svg>';
  $('pvLegend').innerHTML = '<span style="display:inline-flex;align-items:center;gap:6px"><svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true"><line x1="1" y1="5" x2="25" y2="5" stroke="#14181F" stroke-width="3" stroke-linecap="round"/></svg>' + esc(f.ref.name) + '</span><span style="display:inline-flex;align-items:center;gap:6px"><svg width="26" height="14" viewBox="0 0 26 14" aria-hidden="true"><line x1="1" y1="7" x2="25" y2="7" stroke="#1D63D6" stroke-width="2" stroke-linecap="round"/><circle cx="13" cy="7" r="3.6" fill="#1D63D6" stroke="#fff"/></svg>' + esc((INFO && INFO.test_brand ? INFO.test_brand.split(' ')[0] : 'Uji') + ' ' + (c.body.batch || '')) + '</span>';
}
// nama analis: wajib; dikirim ke server (sesi) sebelum menyimpan
var ana = $('f-ana'), save = $('saveBtn'), aw = $('anaWarn');
function anaUpdate() {
  var ok = ana.value.trim().length > 0;
  aw.innerHTML = ok ? okIcon + '<span>Nama analis terisi.</span>' : warnIcon + '<span><b>Nama analis belum diisi.</b> Wajib sebelum run disimpan.</span>';
  saveUpdate();
}
function saveUpdate() {
  var c = collect().body, ok = ana.value.trim().length > 0 && c.batch.length > 0 && c.vessels.length > 0 && !!lastPrev && !lastPrev.error && lastPrev.duplicate.status !== 'sama_persis';
  save.setAttribute('aria-disabled', ok ? 'false' : 'true');
  save.style.background = ok ? '#0B4FA8' : '#C9D0DA'; save.style.color = ok ? '#fff' : '#3B4452'; save.style.cursor = ok ? 'pointer' : 'not-allowed';
}
ana.addEventListener('input', anaUpdate);
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
  if (!dry && !ana.value.trim()) { $('impOut').innerHTML = '<span style="color:#8F3010">Isi nama analis (di bagian Identitas run) sebelum mengimpor.</span>'; return; }
  var go = function () { return f.arrayBuffer().then(function (buf) { return api('POST', '/api/imports/xlsx' + (dry ? '?dry=1' : ''), null, { headers: { 'x-file-name': encodeURIComponent(f.name) }, body: buf }); }); };
  var pre = dry ? Promise.resolve(true) : api('PUT', '/api/me/analyst', { name: ana.value.trim() }).then(function (r) { return r.status === 200; });
  pre.then(function (ok) { if (!ok) { $('impOut').textContent = 'Nama analis ditolak server.'; return null; } return go(); }).then(function (r) {
    if (!r) return;
    if (r.status >= 400) { $('impOut').innerHTML = '<span style="color:#8F3010">' + esc(r.j.error || 'Impor gagal') + (r.j.details ? ': ' + esc(r.j.details.join('; ')) : '') + '</span>'; return; }
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
  if (!ana.value.trim()) { toast('Isi nama analis dulu sebelum membuat produk baru.'); return Promise.resolve(null); }
  var fld = function (id, lab, ph) { return '<div style="display:flex;flex-direction:column;gap:4px;margin-top:8px"><label for="' + id + '" style="font-size:12px;font-weight:600;color:#3B4452">' + lab + '</label><input id="' + id + '" placeholder="' + ph + '" autocomplete="off" style="height:40px;padding:0 10px;border:1px solid #C9D0DA;border-radius:8px;font-size:14px"></div>'; };
  var read = function (box) { var g = function (id) { return box.querySelector('#' + id).value.trim(); }; return { product_name: g('np-n'), strength: g('np-s'), dosage_form: g('np-f'), api: g('np-a'), project_code: g('np-c') }; };
  return dialog('Produk baru', '<div style="font-size:12.5px;color:#556070">Isi sesuai nama di sheet. Aplikasi memeriksa produk serupa sebelum membuat.</div>' + fld('np-n', 'Nama produk', 'mis. Vastrol') + fld('np-s', 'Kekuatan', 'mis. 20 mg') + fld('np-f', 'Bentuk sediaan', 'mis. Tablet') + fld('np-a', 'Zat aktif (opsional)', '') + fld('np-c', 'Kode project (opsional)', ''), [{ text: 'Batal', value: null }, { text: 'Periksa dan buat', value: 'ok', primary: true }], read).then(function (v) {
    var d = dialog.last; if (v !== 'ok') return null;
    if (!d.product_name || !d.strength || !d.dosage_form) { toast('Nama produk, kekuatan, dan bentuk sediaan wajib diisi.'); return null; }
    var q = '/api/products/match?product=' + encodeURIComponent(d.product_name) + '&strength=' + encodeURIComponent(d.strength) + '&form=' + encodeURIComponent(d.dosage_form) + '&code=' + encodeURIComponent(d.project_code || '');
    return api('GET', q).then(function (m) {
      var cands = (m.j && m.j.candidates) || [];
      var ask = cands.length ? dialog('Produk serupa sudah ada', '<div style="font-size:13.5px">' + cands.map(function (x) { return '<div style="margin-top:6px"><b>' + esc(x.title) + '</b> <span style="color:#556070">(cocok lewat ' + esc(x.matched_by) + ')</span></div>'; }).join('') + '<div style="margin-top:10px;color:#556070">Aplikasi tidak menggabungkan otomatis. Pakai produk yang ada, atau tetap buat produk baru.</div></div>', [{ text: 'Batal', value: null }, { text: 'Tetap buat produk baru', value: 'baru' }, { text: 'Pakai produk yang ada', value: 'pakai', primary: true }]) : Promise.resolve('baru');
      return ask.then(function (c) {
        if (c === 'pakai') return cands[0].compile_id;
        if (c !== 'baru') return null;
        return api('PUT', '/api/me/analyst', { name: ana.value.trim() }).then(function () { return api('POST', '/api/products', d); }).then(function (r) {
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
  var c = collect().body, mi = mediumInfo(), prev = lastPrev, name = ana.value.trim();
  var f = prev.f2 && prev.f2.sheet;
  var sum = '<div style="font-size:13.5px"><div><b>' + esc(INFO.product.name) + '</b>, batch <b>' + esc(c.batch) + '</b>' + (c.variant ? ' (' + esc(c.variant) + ')' : '') + ', ' + esc(mi ? mi.name : '') + '</div>' +
    '<div style="margin-top:6px">Vessel terisi: ' + prev.n_vessels + ' \u00b7 titik waktu: ' + c.timepoints.length + (f && f.f2 !== null ? ' \u00b7 f2 ' + fmt(f.f2) + ' (' + esc(KT[f.kind]) + ') terhadap ' + esc(prev.comparator.name) : ' \u00b7 tanpa f2') + '</div>' +
    '<div style="margin-top:6px">Analis: <b>' + esc(name) + '</b></div>' +
    (prev.duplicate.status === 'bentrok' ? '<div style="margin-top:10px;padding:10px 12px;border-radius:8px;background:#FFF1C9;color:#6B4400"><b>Identitas run sudah ada</b> dengan nilai yang berbeda. Pilih tindakan.</div>' : '') + '</div>';
  var btns = prev.duplicate.status === 'bentrok'
    ? [{ text: 'Batal', value: null }, { text: 'Simpan sebagai run ulang', value: 'ulang' }, { text: 'Timpa run lama', value: 'timpa', primary: true }]
    : [{ text: 'Batal', value: null }, { text: 'Simpan ke database', value: 'simpan', primary: true }];
  dialog('Konfirmasi simpan', sum, btns).then(function (choice) {
    if (!choice) return;
    save.setAttribute('aria-disabled', 'true');
    api('PUT', '/api/me/analyst', { name: name }).then(function (a) {
      if (a.status !== 200) { toast(a.j.error || 'Nama analis ditolak server.'); saveUpdate(); return null; }
      ME.analyst = name;
      var key = JSON.stringify([PID, c, choice]);
      var pid = pushIdFor(key);
      var body = JSON.parse(JSON.stringify(c)); body.push_id = pid; if (choice === 'ulang' || choice === 'timpa') body.decision = choice;
      return api('POST', '/api/products/' + PID + '/runs', body);
    }).then(function (r) {
      if (!r) return;
      if (r.status === 200 || r.status === 201) {
        st.fresh = { batch: c.batch, key: c.variant ? c.batch + ' ' + c.variant : c.batch, mid: c.medium, medName: mi ? mi.name : '', f2: r.j.f2_sheet, kind: r.j.kind_sheet, ana: name };
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
  if (!ME) { showView('login'); return; }
  var h = location.hash.replace('#', '') || 'dashboard';
  if (['form', 'dashboard'].indexOf(h) < 0) h = 'dashboard';
  if (h === 'form' && !isWriter()) h = 'dashboard';
  showView(h);
  $('navF').className = 'nav' + (h === 'form' ? ' on' : ''); $('navD').className = 'nav' + (h === 'dashboard' ? ' on' : '');
  if (h === 'dashboard' && D) render();
  if (h === 'form') { fillForm(); schedulePreview(); }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
window.__udt = { state: st, route: route, render: render };
buildGrid();
boot();
})();
