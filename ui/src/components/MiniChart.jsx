import { useEffect, useMemo, useRef, useState } from 'react';
import { scaleLinear } from '@visx/scale';
import { LinePath } from '@visx/shape';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { GridRows } from '@visx/grid';
import { Group } from '@visx/group';
import { GlyphCircle, GlyphSquare, GlyphTriangle, GlyphDiamond, GlyphCross, GlyphStar, GlyphWye } from '@visx/glyph';
import { fmtNum } from '../lib/format.js';

const GLYPHS = { circle: GlyphCircle, square: GlyphSquare, triangle: GlyphTriangle, diamond: GlyphDiamond, cross: GlyphCross, star: GlyphStar, wye: GlyphWye };
export const DASHES = ['', '7 3', '2 3', '9 3 2 3'];   // pola garis tambahan supaya terbaca hitam-putih (selain warna dan bentuk)
export function Marker({ shape, color, size = 60, left = 0, top = 0 }) {
  const G = GLYPHS[shape] || GlyphCircle;
  return <G left={left} top={top} size={size} fill={color} stroke="#fff" strokeWidth={1} />;
}
export function Swatch({ shape, color, dash }) {
  return <svg width="30" height="14" viewBox="0 0 30 14" aria-hidden="true" focusable="false"><line x1="0" x2="30" y1="7" y2="7" stroke={color} strokeWidth="2" strokeDasharray={dash || undefined} /><Marker shape={shape} color={color} size={50} left={15} top={7} /></svg>;
}

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(360);
  useEffect(() => {
    if (!ref.current) return undefined;
    let flips = 0; let frozen = false; let timer = null; let last = 360;
    const ro = new ResizeObserver(([e]) => {
      if (frozen) return;
      const next = Math.max(240, Math.floor(e.contentRect.width / 8) * 8);
      if (Math.abs(next - last) < 8) return;
      flips += 1; last = next;
      if (flips > 6) { frozen = true; return; }
      if (!timer) timer = setTimeout(() => { flips = 0; timer = null; }, 1000);
      setW(next);
    });
    ro.observe(ref.current);
    return () => { ro.disconnect(); if (timer) clearTimeout(timer); };
  }, []);
  return [ref, w];
}

const M = { t: 10, r: 12, b: 40, l: 44 };
const H = 230;

// Satu kartu kuadran: HANYA batch tercentang + pembanding aktif (hitam tebal) + pembanding lain (abu-abu putus-putus) + garis 85% bertitik.
export function MiniChart({ id, title, sub, refPts, others, series }) {
  const [box, width] = useWidth();
  const [zoom, setZoom] = useState(false);
  const all = [...(refPts || []), ...others.flatMap((o) => o.pts), ...series.flatMap((s) => s.pts)];
  const maxT = zoom ? 20 : Math.max(30, ...all.map((p) => p.t));
  const yMin = zoom ? 40 : 0;
  const x = useMemo(() => scaleLinear({ domain: [0, maxT * 1.04], range: [0, width - M.l - M.r] }), [maxT, width]);
  const y = useMemo(() => scaleLinear({ domain: [yMin, 105], range: [H - M.t - M.b, 0] }), [yMin]);
  const clip = `${id}-clip`;
  const tickY = zoom ? [40, 55, 70, 85, 100] : [0, 20, 40, 60, 80, 100];
  return (
    <figure className="cx-chart" aria-labelledby={`${id}-t`} data-chart={id}>
      <figcaption id={`${id}-t`} className="cx-chart-h">
        <span><strong>{title}</strong>{sub && sub !== title ? <small className="cx-sub">{sub}</small> : null}</span>
        <button type="button" className="cx-link cx-noprint" aria-pressed={zoom} onClick={() => setZoom(!zoom)}>{zoom ? 'Tampilan penuh' : 'Zoom 0–20 mnt'}</button>
      </figcaption>
      <div ref={box} className="cx-chart-box">
        <svg width={width} height={H} role="img" aria-labelledby={`${id}-t ${id}-d`} data-svg="chart" fontFamily="'Google Sans','Segoe UI',system-ui,Arial,sans-serif">
          <desc id={`${id}-d`}>{`${series.length} batch tercentang dan pembanding aktif. Sumbu x: waktu (menit); sumbu y: % terlarut rerata.`}</desc>
          <defs><clipPath id={clip}><rect x={0} y={-4} width={width - M.l - M.r} height={H - M.t - M.b + 8} /></clipPath></defs>
          <Group left={M.l} top={M.t}>
            <GridRows scale={y} width={width - M.l - M.r} tickValues={tickY} stroke="#E3E8EB" />
            <line x1={0} x2={width - M.l - M.r} y1={y(85)} y2={y(85)} stroke="#6B7780" strokeWidth={1.2} strokeDasharray="1.5 3.5" strokeLinecap="round" />
            <text x={3} y={y(85) - 4} textAnchor="start" fontSize="11" fill="#4F5D66">85%</text>
            <g clipPath={`url(#${clip})`}>
              {others.map((o) => <LinePath key={o.key} data={o.pts} x={(d) => x(d.t)} y={(d) => y(d.y)} stroke="#8A949B" strokeWidth={2} strokeDasharray="7 4" />)}
              {series.map((s) => (
                <g key={s.key}>
                  <LinePath data={s.pts} x={(d) => x(d.t)} y={(d) => y(d.y)} stroke={s.style.color} strokeWidth={2} strokeDasharray={s.dash || undefined} />
                  {s.pts.map((p) => <g key={p.t}><title>{`${s.label}: menit ${p.t}, ${fmtNum(p.y, 1)}% ± ${fmtNum(p.sd, 1)}`}</title><Marker shape={s.style.shape} color={s.style.color} left={x(p.t)} top={y(p.y)} size={46} /></g>)}
                </g>
              ))}
              {refPts && refPts.length ? <LinePath data={refPts} x={(d) => x(d.t)} y={(d) => y(d.y)} stroke="#000" strokeWidth={4.5} strokeLinejoin="round" /> : null}
              {refPts && refPts.length ? refPts.map((p) => <circle key={p.t} cx={x(p.t)} cy={y(p.y)} r={3} fill="#fff" stroke="#000" strokeWidth={2} />) : null}
            </g>
            <AxisBottom top={H - M.t - M.b} scale={x} numTicks={zoom ? 5 : Math.min(7, Math.floor((width - M.l) / 55))} label="Waktu (menit)" labelProps={{ fontSize: 11, fill: '#1F2A30', textAnchor: 'middle' }} tickLabelProps={{ fontSize: 11, fill: '#1F2A30', textAnchor: 'middle' }} stroke="#4F5D66" tickStroke="#4F5D66" />
            <AxisLeft scale={y} tickValues={tickY} label="% terlarut rerata" labelOffset={28} labelProps={{ fontSize: 11, fill: '#1F2A30', textAnchor: 'middle' }} tickLabelProps={{ fontSize: 11, fill: '#1F2A30', textAnchor: 'end', dy: '0.33em' }} stroke="#4F5D66" tickStroke="#4F5D66" />
          </Group>
        </svg>
      </div>
      <ul className="cx-chips" aria-label={`Label batch ${title}`}>
        {series.map((s) => <li key={s.key} className="cx-chip" style={{ borderColor: s.style.color }}><Swatch {...s.style} dash={s.dash} /> <span>{s.label}{s.f2 !== null && s.f2 !== undefined ? ` · ${fmtNum(s.f2, 1)}` : ''}</span></li>)}
        {!series.length ? <li className="cx-small">Centang batch pada matriks untuk melihat profilnya.</li> : null}
      </ul>
    </figure>
  );
}

export function EmptyQuad({ title, label, product, studioHref }) {
  return (
    <figure className="cx-chart cx-empty" aria-label={`${title}: belum ada data`}>
      <figcaption className="cx-chart-h"><span><strong>{title}</strong></span></figcaption>
      <div className="cx-empty-body">
        <p><strong>Belum ada data {label} untuk {product}</strong></p>
        <p className="cx-small">Kuadran ini terisi setelah satu run medium {label} ditambahkan.</p>
        <a className="cx-btn cx-noprint" href={studioHref}>Tambah data {label}</a>
      </div>
    </figure>
  );
}
