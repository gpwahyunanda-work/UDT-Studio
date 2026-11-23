// Ekspor gambar grafik: SVG gabungan 2x2 (SVG), PNG >= 1600 px lewat kanvas. Satu arah; tanpa jaringan.
const NS = 'http://www.w3.org/2000/svg';
const FONT = "'Google Sans','Segoe UI',system-ui,Arial,sans-serif";

export function composeSvg(root, title) {
  const charts = [...root.querySelectorAll('figure[data-chart] svg[data-svg="chart"]')];
  if (!charts.length) return null;
  const cw = Math.max(...charts.map((s) => Number(s.getAttribute('width')))), ch = Math.max(...charts.map((s) => Number(s.getAttribute('height'))));
  const labels = [...root.querySelectorAll('figure[data-chart] figcaption strong')].map((e) => e.textContent);
  const chipsOf = (fig) => [...fig.querySelectorAll('.cx-chip span:last-child')].map((e) => e.textContent).join('   ');
  const figs = [...root.querySelectorAll('figure[data-chart]')].filter((f) => f.querySelector('svg[data-svg="chart"]'));
  const gap = 16, head = 44, foot = 22, cols = 2, rows = Math.ceil(charts.length / cols);
  const W = cols * cw + (cols + 1) * gap, Ht = head + rows * (ch + foot + 26) + gap;
  const out = document.createElementNS(NS, 'svg');
  out.setAttribute('xmlns', NS); out.setAttribute('width', W); out.setAttribute('height', Ht); out.setAttribute('viewBox', `0 0 ${W} ${Ht}`); out.setAttribute('font-family', FONT);
  const bg = document.createElementNS(NS, 'rect'); bg.setAttribute('width', W); bg.setAttribute('height', Ht); bg.setAttribute('fill', '#fff'); out.appendChild(bg);
  const t = document.createElementNS(NS, 'text'); t.setAttribute('x', gap); t.setAttribute('y', 28); t.setAttribute('font-size', 18); t.setAttribute('font-weight', 700); t.setAttribute('fill', '#1F2A30'); t.textContent = title; out.appendChild(t);
  charts.forEach((svg, i) => {
    const gx = gap + (i % cols) * (cw + gap), gy = head + Math.floor(i / cols) * (ch + foot + 26);
    const lab = document.createElementNS(NS, 'text'); lab.setAttribute('x', gx); lab.setAttribute('y', gy + 12); lab.setAttribute('font-size', 14); lab.setAttribute('font-weight', 700); lab.setAttribute('fill', '#1F2A30'); lab.textContent = labels[i] || ''; out.appendChild(lab);
    const g = document.createElementNS(NS, 'g'); g.setAttribute('transform', `translate(${gx},${gy + 18})`);
    const c = svg.cloneNode(true); c.removeAttribute('role'); g.appendChild(c); out.appendChild(g);
    const chips = document.createElementNS(NS, 'text'); chips.setAttribute('x', gx); chips.setAttribute('y', gy + 18 + ch + 14); chips.setAttribute('font-size', 11); chips.setAttribute('fill', '#1F2A30'); chips.textContent = chipsOf(figs[i]); out.appendChild(chips);
  });
  return { svg: out, width: W, height: Ht };
}

const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
const safe = (s) => String(s).replace(/[^\w .,()-]+/g, '_');

export function exportSvg(root, title, fileBase) {
  const c = composeSvg(root, title); if (!c) return false;
  download(new Blob([new XMLSerializer().serializeToString(c.svg)], { type: 'image/svg+xml' }), `${safe(fileBase)}.svg`); return true;
}
export function exportPng(root, title, fileBase, minWidth = 1600) {
  const c = composeSvg(root, title); if (!c) return Promise.resolve(false);
  const scale = Math.max(1, minWidth / c.width), url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(c.svg)], { type: 'image/svg+xml' }));
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas'); cv.width = Math.ceil(c.width * scale); cv.height = Math.ceil(c.height * scale);
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      cv.toBlob((b) => { download(b, `${safe(fileBase)}.png`); ok({ width: cv.width, height: cv.height }); }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); fail(new Error('gambar gagal dibuat')); };
    img.src = url;
  });
}
