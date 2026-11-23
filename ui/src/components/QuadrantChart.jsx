import { useEffect, useMemo, useRef, useState } from 'react';
import { scaleLinear } from '@visx/scale';
import { LinePath } from '@visx/shape';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { GridRows } from '@visx/grid';
import { Group } from '@visx/group';
import { GlyphCircle, GlyphSquare, GlyphTriangle, GlyphDiamond, GlyphCross, GlyphStar, GlyphWye } from '@visx/glyph';
import { fmtNum } from '../lib/format.js';
import { runLabel } from '../lib/model.js';

const GLYPHS = { circle: GlyphCircle, square: GlyphSquare, triangle: GlyphTriangle, diamond: GlyphDiamond, cross: GlyphCross, star: GlyphStar, wye: GlyphWye };
export function Marker({ shape, color, size = 60, left = 0, top = 0 }) {
  const G = GLYPHS[shape] || GlyphCircle;
  return <G left={left} top={top} size={size} fill={color} stroke="#fff" strokeWidth={1} />;
}
// Penanda kunci (swatch) kecil untuk legenda dan matriks: warna + bentuk.
export function Swatch({ shape, color }) {
  return <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false"><Marker shape={shape} color={color} size={64} left={9} top={9} /></svg>;
}

// Lebar mengikuti wadah. Wadah boleh menyusut (min-w-0) supaya SVG tidak memaksa lebar sendiri; perubahan kecil diabaikan
// dan umpan balik berulang (mis. bilah gulir muncul-hilang) dibekukan setelah 6 kali per detik, mencegah putaran tak berujung.
function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(480);
  useEffect(() => {
    if (!ref.current) return undefined;
    let flips = 0; let frozen = false; let timer = null; let last = 480;
    const ro = new ResizeObserver(([e]) => {
      if (frozen) return;
      const next = Math.max(280, Math.floor(e.contentRect.width / 8) * 8);
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

const M = { t: 12, r: 16, b: 46, l: 46 };
const H = 300;

// Satu kuadran: pembanding = garis hitam tebal; tiap run = warna + bentuk titik; garis putus 85%; batang galat = ±SD.
export function QuadrantChart({ id, title, sub, refPts, refRun, series, styleOf }) {
  const [box, width] = useWidth();
  const all = [...(refPts || []), ...series.flatMap((s) => s.pts)];
  const maxT = Math.max(30, ...all.map((p) => p.t));
  const x = useMemo(() => scaleLinear({ domain: [0, maxT * 1.04], range: [0, width - M.l - M.r] }), [maxT, width]);
  const y = useMemo(() => scaleLinear({ domain: [0, 110], range: [H - M.t - M.b, 0] }), []);
  const first85 = (pts) => pts.findIndex((p) => p.y >= 85);
  const desc = `${series.length} run uji dan ${refPts ? 'pembanding aktif' : 'tanpa pembanding'}. Sumbu x: menit; sumbu y: persen terlepas. Data lengkap ada pada tabel di bawah grafik.`;
  return (
    <figure className="uc:m-0 uc:min-w-0 uc:rounded-lg uc:border uc:border-line uc:bg-surface uc:p-3" aria-labelledby={`${id}-t`}>
      <figcaption id={`${id}-t`} className="uc:mb-1 uc:flex uc:flex-wrap uc:items-baseline uc:gap-x-2">
        <span className="uc:text-base uc:font-semibold">{title}</span>
        {sub ? <span className="uc:text-xs uc:text-muted">{sub}</span> : null}
      </figcaption>
      <div ref={box} className="uc:w-full uc:min-w-0 uc:overflow-hidden">
        <svg width={width} height={H} role="img" aria-labelledby={`${id}-t ${id}-d`}>
          <desc id={`${id}-d`}>{desc}</desc>
          <Group left={M.l} top={M.t}>
            <GridRows scale={y} width={width - M.l - M.r} tickValues={[0, 20, 40, 60, 80, 100]} stroke="#E3E8EB" />
            <line x1={0} x2={width - M.l - M.r} y1={y(85)} y2={y(85)} stroke="#00693A" strokeWidth={1.5} strokeDasharray="6 4" />
            <text x={4} y={y(85) - 5} textAnchor="start" fontSize="12" fill="#00693A" fontWeight="600">85%</text>
            {refPts && refPts.length ? (
              <g>
                <LinePath data={refPts} x={(d) => x(d.t)} y={(d) => y(d.y)} stroke="#000" strokeWidth={4} strokeLinejoin="round" />
                {refPts.map((p) => <ErrBar key={p.t} x={x(p.t)} y={y(p.y)} lo={y(Math.max(0, p.y - p.sd))} hi={y(Math.min(110, p.y + p.sd))} color="#000" />)}
                {first85(refPts) >= 0 ? <circle cx={x(refPts[first85(refPts)].t)} cy={y(refPts[first85(refPts)].y)} r={9} fill="none" stroke="#000" strokeWidth={2} /> : null}
              </g>
            ) : null}
            {series.map(({ run, pts }) => {
              const st = styleOf(run.run_id); const f = first85(pts);
              return (
                <g key={run.run_id}>
                  <LinePath data={pts} x={(d) => x(d.t)} y={(d) => y(d.y)} stroke={st.color} strokeWidth={2} />
                  {pts.map((p) => <ErrBar key={p.t} x={x(p.t)} y={y(p.y)} lo={y(Math.max(0, p.y - p.sd))} hi={y(Math.min(110, p.y + p.sd))} color={st.color} />)}
                  {pts.map((p) => (
                    <g key={p.t}><title>{`${runLabel(run)}: menit ${p.t}, ${fmtNum(p.y, 1)}% ± ${fmtNum(p.sd, 1)} (RSD ${fmtNum(p.rsd, 1)}%)`}</title><Marker shape={st.shape} color={st.color} left={x(p.t)} top={y(p.y)} size={56} /></g>
                  ))}
                  {f >= 0 ? <circle cx={x(pts[f].t)} cy={y(pts[f].y)} r={9} fill="none" stroke={st.color} strokeWidth={2} /> : null}
                </g>
              );
            })}
            <AxisBottom top={H - M.t - M.b} scale={x} numTicks={Math.min(8, Math.floor((width - M.l) / 60))} label="Waktu (menit)" labelProps={{ fontSize: 12, fill: '#1F2A30', textAnchor: 'middle' }} tickLabelProps={{ fontSize: 12, fill: '#1F2A30', textAnchor: 'middle' }} stroke="#4F5D66" tickStroke="#4F5D66" />
            <AxisLeft scale={y} tickValues={[0, 20, 40, 60, 80, 100]} label="Terlepas (%)" labelOffset={28} labelProps={{ fontSize: 12, fill: '#1F2A30', textAnchor: 'middle' }} tickLabelProps={{ fontSize: 12, fill: '#1F2A30', textAnchor: 'end', dy: '0.33em' }} stroke="#4F5D66" tickStroke="#4F5D66" />
          </Group>
        </svg>
      </div>
      <p className="uc:text-xs uc:text-muted">Lingkaran besar = titik pertama yang mencapai 85% atau lebih. Batang = ± SD.{refRun ? ` Garis hitam tebal = pembanding aktif ${refRun}.` : ' Belum ada pembanding aktif.'}</p>
      <ul aria-label={`Legenda ${title}`} className="uc:m-0 uc:mt-1 uc:flex uc:list-none uc:flex-wrap uc:gap-x-3 uc:gap-y-0.5 uc:p-0 uc:text-xs">
        {refPts ? <li className="uc:inline-flex uc:items-center uc:gap-1"><span aria-hidden="true" style={{ width: 20, height: 4, background: '#000', display: 'inline-block' }} /> Pembanding aktif</li> : null}
        {series.map((s) => <li key={s.run.run_id} className="uc:inline-flex uc:items-center uc:gap-1"><Swatch {...styleOf(s.run.run_id)} /> {runLabel(s.run)}</li>)}
      </ul>
      <ChartTable refPts={refPts} refRun={refRun} series={series} />
    </figure>
  );
}

function ErrBar({ x, y, lo, hi, color }) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || Math.abs(hi - lo) < 1) return null;
  return <g stroke={color} strokeWidth={1.5}><line x1={x} x2={x} y1={hi} y2={lo} /><line x1={x - 4} x2={x + 4} y1={hi} y2={hi} /><line x1={x - 4} x2={x + 4} y1={lo} y2={lo} /></g>;
}

// Alternatif grafik untuk pembaca layar: tabel rata-rata ± SD per menit.
function ChartTable({ refPts, refRun, series }) {
  const rows = [...(refPts ? [{ name: `Pembanding aktif ${refRun || ''}`, pts: refPts }] : []), ...series.map((s) => ({ name: runLabel(s.run), pts: s.pts }))];
  const times = [...new Set(rows.flatMap((r) => r.pts.map((p) => p.t)))].sort((a, b) => a - b);
  if (!rows.length) return null;
  return (
    <details className="uc:mt-1">
      <summary className="uc:cursor-pointer uc:text-sm uc:text-brand uc:underline">Lihat data grafik sebagai tabel</summary>
      <div className="uc-scroll" tabIndex={0} role="region" aria-label="Tabel data grafik">
        <table className="uc-tbl uc:w-full uc:text-xs">
          <caption className="uc-sr">Rata-rata ± SD persen terlepas per menit</caption>
          <thead><tr><th scope="col">Run</th>{times.map((t) => <th scope="col" key={t} className="n">{t} mnt</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.name}><th scope="row">{r.name}</th>{times.map((t) => { const p = r.pts.find((q) => q.t === t); return <td key={t} className="n">{p ? `${fmtNum(p.y, 1)} ± ${fmtNum(p.sd, 1)}` : '–'}</td>; })}</tr>
          ))}</tbody>
        </table>
      </div>
    </details>
  );
}
