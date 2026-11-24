/* F15: Architecture: filter tingkat (analis/teknis) dan penampil diagram dalam bingkai sama-asal. Tanpa data dari pengguna. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var cards = Array.prototype.slice.call(document.querySelectorAll('#arcCards .arc-card')), btns = Array.prototype.slice.call(document.querySelectorAll('.arc-filter button'));
  function filter(f) {
    cards.forEach(function (c) { c.hidden = !(f === 'semua' || c.getAttribute('data-level') === f); });
    btns.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-f') === f ? 'true' : 'false'); });
    try { history.replaceState(null, '', f === 'semua' ? location.pathname : '#' + f); } catch (e) { /* abaikan */ }
  }
  btns.forEach(function (b) { b.addEventListener('click', function () { filter(b.getAttribute('data-f')); }); });
  var h0 = location.hash.replace('#', ''); if (h0 === 'analis' || h0 === 'teknis') filter(h0);
  function theme() { var t = document.documentElement.getAttribute('data-theme'); return t === 'light' || t === 'dark' ? t : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); }
  var view = $('arcView'), fr = $('arcFrame');
  function open(src, title, trigger) {
    $('arcViewT').textContent = title; $('arcNew').setAttribute('href', src);
    fr.setAttribute('title', title); fr.setAttribute('src', src + '?embed=1&theme=' + theme());
    view.hidden = false; view.setAttribute('data-trigger', trigger || ''); view.scrollIntoView({ block: 'start' }); $('arcClose').focus();
  }
  Array.prototype.forEach.call(document.querySelectorAll('.arc-open'), function (b) { b.addEventListener('click', function () { open(b.getAttribute('data-src'), b.getAttribute('data-title'), b.getAttribute('data-id')); }); });
  $('arcClose').addEventListener('click', function () {
    var id = view.getAttribute('data-trigger'); view.hidden = true; fr.removeAttribute('src');
    var t = id && document.querySelector('.arc-open[data-id="' + id + '"]'); if (t) t.focus();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !view.hidden) $('arcClose').click(); });
})();
