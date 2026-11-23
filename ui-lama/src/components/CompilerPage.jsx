import { useEffect, useMemo, useState } from 'react';
import { TriangleAlert, ArrowLeft, Download, Plus, Upload, ChevronDown } from 'lucide-react';
import { MiniChart, EmptyQuad, Swatch, DASHES } from './MiniChart.jsx';
import { RunPanel, ImportDialog, RemovedRuns } from './Dialogs.jsx';
import { buildProfiles, deriveRoles } from '../lib/model.js';
import { bridgeStatus } from '../lib/udtBridge.js';
import { layoutMediums, refCandidates, batchRows, computeCells, buildFindings, kpis, checkedDefault, monthsOf, shortBrand, FINDING_TYPES, MAX_CHECKED, refRunFor } from '../lib/layout.js';
import { fmtNum, fmtDate } from '../lib/format.js';
import { exportPng, exportSvg } from '../lib/exportImage.js';

const STYLES = [{ color: '#0072B2', shape: 'circle' }, { color: '#C4500B', shape: 'square' }, { color: '#7B3FB5', shape: 'triangle' }, { color: '#00795A', shape: 'diamond' }];
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const monthLabel = (m) => `${BULAN[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const ptsOf = (p) => (p && !p.error ? p.times.map((t, i) => ({ t, y: p.means[i], sd: p.stats[i].sd })).filter((q) => Number.isFinite(q.y)) : []);
const typeClass = { 'Beda dengan sheet lama': 'amber', 'Data identik': 'yellow', 'RSD di atas batas': 'red', 'Peringatan data': 'orange', 'Catatan impor': 'slate' };
const fileBase = (t) => String(t).replace(/^Development of\s+/i, 'Compile ');

export function CompilerPage({ api, me, host, compileId, onBack }) {
  const [state, setState] = useState({ loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    api('GET', `/api/compiles/${compileId}/data`).then((r) => { if (live) setState(r.status === 200 ? { data: r.body } : { error: (r.body && r.body.error) || 'Data tidak dapat dimuat' }); }).catch(() => live && setState({ error: 'Koneksi gagal' }));
    return () => { live = false; };
  }, [api, compileId, tick]);
  if (state.loading) return <p role="status">Memuat data compile…</p>;
  if (state.error) return <div><button className="cx-btn" type="button" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" /> Daftar produk</button><p role="alert" className="cx-err">{state.error}</p></div>;
  return <Body data={state.data} api={api} me={me} host={host} onBack={onBack} reload={() => setTick((x) => x + 1)} />;
}

export function Body({ data, api, me, host, onBack, reload }) {
  const st = bridgeStatus(host);
  const writer = me.role === 'penulis';
  const roles = useMemo(() => deriveRoles(data), [data]);
  const profiles = useMemo(() => (st.ok ? buildProfiles(host, data) : new Map()), [data, host, st.ok]);
  const slots = useMemo(() => layoutMediums(data.mediums, data.runs), [data]);
  const cands = useMemo(() => refCandidates(data, roles), [data, roles]);
  const [activeKey, setActiveKey] = useState(() => (cands[0] ? cands[0].key : null));
  const [status, setStatus] = useState('valid');
  const [q, setQ] = useState('');
  const [month, setMonth] = useState('');
  const rows = useMemo(() => batchRows(data, slots, cands, { status, q, month }), [data, slots, cands, status, q, month]);
  const computed = useMemo(() => (st.ok ? computeCells(host, profiles, data, rows, slots, cands, activeKey) : { cells: new Map(), others: [], refBySlot: new Map(), active: null }), [st.ok, host, profiles, data, rows, slots, cands, activeKey]);
  const findings = useMemo(() => (st.ok ? buildFindings({ host, profiles, data, roles, slots, rows: batchRows(data, slots, cands, { status: 'semua' }), computed: computeCells(host, profiles, data, batchRows(data, slots, cands, { status: 'semua' }), slots, cands, activeKey), candidates: cands }) : []), [st.ok, host, profiles, data, roles, slots, cands, activeKey]);
  const [checked, setChecked] = useState(() => checkedDefault(batchRows(data, slots, cands, { status: 'valid' })));
  const [fType, setFType] = useState('');
  const [fQ, setFQ] = useState('');
  const [all, setAll] = useState(false);
  const [panel, setPanel] = useState(null);
  const [menu, setMenu] = useState(false);
  const [imp, setImp] = useState(false);
  const [note, setNote] = useState('');
  if (!st.ok) return <p role="alert" className="cx-err">Modul Langkah 4 tidak ditemukan di halaman ({st.missing.join(', ')}). Muat ulang halaman; bila tetap, hubungi pengembang.</p>;

  const title = data.compile.title.replace(/^Development of\s+/i, '');
  const m0 = data.mediums.find((m) => m.apparatus || m.volume_text) || data.mediums[0] || {};
  const K = kpis({ rows, slots, computed, findings, data, status });
  const activeCand = computed.active;
  const styleOf = (key) => { const i = checked.indexOf(key); return i < 0 ? null : { ...STYLES[i % STYLES.length], dash: DASHES[i % DASHES.length] }; };
  const toggle = (key) => setChecked((c) => (c.includes(key) ? c.filter((x) => x !== key) : c.length >= MAX_CHECKED ? c : [...c, key]));
  const warnRows = new Map(); for (const f of findings) if (f.type !== 'Catatan impor') (warnRows.get(f.run_id) || warnRows.set(f.run_id, []).get(f.run_id)).push(f);
  const base = fileBase(data.compile.title);
  const fl = findings.filter((f) => (!fType || f.type === fType) && (!fQ || `${f.batch} ${f.medium} ${f.text}`.toLowerCase().includes(fQ.toLowerCase())));
  const typeCount = Object.fromEntries(FINDING_TYPES.map((t) => [t, findings.filter((f) => f.type === t).length]));
  const apiText = data.compile.api_uncertain ? 'Zat aktif belum pasti (lihat Perlu dicek)' : data.compile.api ? `API ${data.compile.api}` : 'Zat aktif belum diisi';
  const sub = [apiText, m0.volume_text, [m0.apparatus, m0.rpm_text].filter(Boolean).join(' '), m0.method, writer ? `akun penulis, nama analis dicatat per run (${me.analyst || 'belum diisi'})` : 'akun pembaca (hanya melihat)'].filter(Boolean).join(' · ');
  const root = () => document.getElementById('cx-root');
  const dates = data.runs.map((r) => r.test_date).filter(Boolean).sort();
  const rangeText = dates.length ? `Semua (${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])})` : 'Semua';

  return (
    <div id="cx-root" className="cx-page">
      <header className="cx-head">
        <div>
          <p className="cx-eyebrow">UDT COMPILER</p>
          <h1 className="cx-title">Compile profil disolusi — {title}</h1>
          <p className="cx-sub">{sub}</p>
        </div>
        <div className="cx-actions cx-noprint">
          <button type="button" className="cx-btn" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" /> Daftar produk</button>
          <div className="cx-menuwrap">
            <button type="button" className="cx-btn" aria-haspopup="true" aria-expanded={menu} onClick={() => setMenu(!menu)}><Download size={16} aria-hidden="true" /> Ekspor ke sheet <ChevronDown size={14} aria-hidden="true" /></button>
            {menu ? <ul className="cx-menu" role="menu" onMouseLeave={() => setMenu(false)}>
              <li role="none"><a role="menuitem" href={`/api/compiles/${data.compile.compile_id}/export?format=xlsx`}>Excel (.xlsx), rumus hidup</a></li>
              <li role="none"><a role="menuitem" href={`/api/compiles/${data.compile.compile_id}/export?format=csv`}>CSV</a></li>
              <li role="none"><a role="menuitem" href={`/api/compiles/${data.compile.compile_id}/export?format=tsv`}>TSV</a></li>
              <li role="none"><button role="menuitem" type="button" onClick={async () => { setMenu(false); try { const r = await exportPng(root(), `${title}`, base, 1600); setNote(`PNG dibuat: ${r.width} × ${r.height} px.`); } catch { setNote('PNG gagal dibuat.'); } }}>Gambar grafik PNG (≥ 1600 px)</button></li>
              <li role="none"><button role="menuitem" type="button" onClick={() => { setMenu(false); setNote(exportSvg(root(), title, base) ? 'SVG dibuat.' : 'Tidak ada grafik.'); }}>Gambar grafik SVG</button></li>
              <li role="none"><button role="menuitem" type="button" onClick={() => { setMenu(false); window.print(); }}>Cetak / PDF (satu halaman)</button></li>
            </ul> : null}
          </div>
          {writer ? <button type="button" className="cx-btn" onClick={() => setImp(true)}><Upload size={16} aria-hidden="true" /> Impor sheet lama</button> : null}
          <a className="cx-btn cx-primary" href="/"><Plus size={16} aria-hidden="true" /> Tambah data</a>
        </div>
      </header>
      {note ? <p role="status" className="cx-small cx-noprint">{note}</p> : null}

      <section className="cx-card cx-controls cx-noprint" aria-label="Kontrol tampilan">
        <div role="radiogroup" aria-label="Pembanding aktif" className="cx-ctl">
          <span className="cx-lab">Pembanding aktif</span>
          <div className="cx-seg">
            {cands.map((c) => <button key={c.key} type="button" role="radio" aria-checked={c.key === activeKey} className={c.key === activeKey ? 'on' : ''} onClick={() => setActiveKey(c.key)}>{shortBrand(c.brand)} / {c.batch}</button>)}
            {!cands.length ? <span className="cx-small">Belum ada pembanding</span> : null}
          </div>
        </div>
        <label className="cx-ctl"><span className="cx-lab">Cari batch</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="mis. F0048J26A" /></label>
        <label className="cx-ctl"><span className="cx-lab">Status run</span><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="valid">Valid saja</option><option value="tidak_valid">Tidak valid saja</option><option value="semua">Semua</option></select></label>
        <label className="cx-ctl"><span className="cx-lab">Rentang tanggal uji</span><select value={month} onChange={(e) => setMonth(e.target.value)}><option value="">{rangeText}</option>{monthsOf(data).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></label>
      </section>

      <section className="cx-kpis" aria-label="Ringkasan">
        <div><strong>{K.batches}</strong><span>batch {data.compile.product_name} terkompilasi</span></div>
        <div><strong>{K.mediumWith}<small> dari {K.mediumOf}</small></strong><span>medium berisi data{K.emptyNames.length ? ` (${K.emptyNames.join(', ')} kosong)` : ''}</span></div>
        <div className="red"><strong>{K.notSimilar}</strong><span>hasil Not Similar terhadap {activeCand ? shortBrand(activeCand.brand) : 'pembanding'}</span></div>
        <div className="amber"><strong>{K.findings}</strong><span>temuan perlu dicek (di bawah)</span></div>
      </section>

      <div className="cx-main">
        <section className="cx-card cx-left" aria-labelledby="cx-mx-h">
          <h2 id="cx-mx-h">Matriks f2 terhadap {activeCand ? shortBrand(activeCand.brand) : 'pembanding'}</h2>
          <p className="cx-small">Centang sampai {MAX_CHECKED} batch untuk melihat profilnya di grafik. Terbaru di atas.</p>
          <div className="cx-scroll" tabIndex={0} role="region" aria-label="Matriks f2">
            <table className="cx-tbl">
              <thead><tr><th scope="col" className="cx-ck"><span className="cx-sr">Pilih</span></th><th scope="col">Batch</th>{slots.map((s) => { const n = [...computed.cells.entries()].filter(([k, v]) => k.endsWith(`|${s.code}`) && v && v.code === 'not_similar').length; const has = rows.some((e) => e.cells.has(s.code)); return <th scope="col" key={s.code} className="n">{s.label}<small>{has ? `${n} Not Similar` : 'belum ada data'}</small></th>; })}<th scope="col"><span className="cx-sr">Peringatan</span></th></tr></thead>
              <tbody>
                {activeCand ? <tr className="cx-ref"><td /><th scope="row"><b>{shortBrand(activeCand.brand)}</b> <span className="cx-badge on">Aktif</span><small>{activeCand.batch}{activeCand.site ? ` · ${activeCand.site}` : ''}</small></th>{slots.map((s) => <td key={s.code} className="n">—</td>)}<td /></tr> : null}
                {computed.others.map((o) => <tr className="cx-ref" key={o.cand.key}><td /><th scope="row"><b>{shortBrand(o.cand.brand)}</b> <span className="cx-badge">Pembanding lain</span><small>{o.cand.batch} · f2 terhadap pembanding aktif</small></th>{slots.map((s) => { const c = o.cells.get(s.code); return <Cell key={s.code} c={c} />; })}<td /></tr>)}
                {rows.map((e) => {
                  const sty = styleOf(e.key); const isOn = checked.includes(e.key); const warn = e.runs.flatMap((r) => warnRows.get(r.run_id) || []);
                  return (
                    <tr key={e.key} className={isOn ? 'sel' : ''}>
                      <td className="cx-ck"><input type="checkbox" checked={isOn} disabled={!isOn && checked.length >= MAX_CHECKED} onChange={() => toggle(e.key)} aria-label={`Tampilkan ${e.batch}${e.variant ? ' ' + e.variant : ''} di grafik`} /></td>
                      <th scope="row"><span className="cx-bt">{sty ? <Swatch {...sty} /> : null}<button type="button" className="cx-code" onClick={() => setPanel(e)} title="Buka detail run">{e.batch}</button>{e.variant ? <span className="cx-tag">{e.variant}</span> : null}</span><small>{fmtDate(e.date)}{e.extra ? ` · +${e.extra} run ulang` : ''}</small></th>
                      {slots.map((s) => <Cell key={s.code} c={computed.cells.get(`${e.key}|${s.code}`)} none={!e.cells.has(s.code)} />)}
                      <td>{warn.length ? <span title={warn.map((w) => `${w.type}: ${w.text}`).join('\n')} role="img" aria-label={`${warn.length} temuan pada batch ini`}><TriangleAlert size={16} className="cx-warn-ic" aria-hidden="true" /></span> : null}</td>
                    </tr>
                  );
                })}
                {!rows.length ? <tr><td colSpan={slots.length + 3} className="cx-small">Tidak ada batch yang cocok dengan filter.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <ul className="cx-legend" aria-label="Legenda penanda"><li><span className="cx-m ok">✓</span> Similar (f2 ≥ 50)</li><li><span className="cx-m">»</span> Sangat cepat: keduanya ≥ 85% di 15 menit, f2 hanya informasi</li><li><span className="cx-m bad">×</span> Not Similar</li></ul>
        </section>

        <section className="cx-card cx-right" aria-labelledby="cx-pr-h">
          <h2 id="cx-pr-h">Profil rerata, {slots.filter((s) => !s.empty).length} medium</h2>
          <ul className="cx-legend2" aria-label="Legenda grafik">
            {activeCand ? <li><span className="cx-line black" /> {shortBrand(activeCand.brand)} (aktif)</li> : null}
            {computed.others.map((o) => <li key={o.cand.key}><span className="cx-line gray" /> {shortBrand(o.cand.brand)}</li>)}
            {checked.map((k) => { const s = styleOf(k); const r = rows.find((x) => x.key === k); return s && r ? <li key={k}><Swatch {...s} /> {r.batch}{r.variant ? ` ${r.variant}` : ''}</li> : null; })}
            <li><span className="cx-line dots" /> 85%</li>
          </ul>
          <div className="cx-grid2">
            {slots.map((s, i) => {
              const ttl = s.label;
              if (s.empty) return <EmptyQuad key={s.code} title={ttl} label={s.label} product={data.compile.product_name} studioHref="/" />;
              const ref = computed.refBySlot.get(s.code);
              const series = checked.map((k) => { const r = rows.find((x) => x.key === k); const run = r && r.cells.get(s.code); const sty = styleOf(k); if (!run || !sty) return null; const c = computed.cells.get(`${k}|${s.code}`); return { key: k, label: `${r.batch}${r.variant ? ' ' + r.variant : ''}`, pts: ptsOf(profiles.get(run.run_id)), style: sty, dash: sty.dash, f2: c && !c.error ? c.f2 : null }; }).filter(Boolean);
              const others = computed.others.map((o) => { const rr = refRunFor(o.cand, s, data); return rr ? { key: o.cand.key, pts: ptsOf(profiles.get(rr.run_id)) } : null; }).filter(Boolean);
              return <MiniChart key={s.code} id={`cx-q${i}`} title={ttl} sub={s.fullName} refPts={ref ? ptsOf(profiles.get(ref.run_id)) : null} others={others} series={series} />;
            })}
          </div>
          <p className="cx-small">Angka pada label batch adalah f2 terhadap {activeCand ? shortBrand(activeCand.brand) : 'pembanding aktif'}. Sumbu y: % terlarut rerata; sumbu x: menit.</p>
        </section>
      </div>

      <section className="cx-card cx-find cx-noprint-table" aria-labelledby="cx-fd-h">
        <h2 id="cx-fd-h">Perlu dicek <span className="cx-badge amber">{findings.length}</span></h2>
        <p className="cx-small">Data dan kesimpulan tidak diubah. Aplikasi hanya menandai.</p>
        <div className="cx-fbar cx-noprint">
          <button type="button" className={`cx-pill ${fType === '' ? 'on' : ''}`} aria-pressed={fType === ''} onClick={() => setFType('')}>Semua ({findings.length})</button>
          {FINDING_TYPES.filter((t) => typeCount[t]).map((t) => <button type="button" key={t} className={`cx-pill ${typeClass[t]} ${fType === t ? 'on' : ''}`} aria-pressed={fType === t} onClick={() => setFType(fType === t ? '' : t)}>{t} ({typeCount[t]})</button>)}
          <input type="search" aria-label="Cari temuan" placeholder="Cari batch atau temuan" value={fQ} onChange={(e) => setFQ(e.target.value)} />
        </div>
        <div className="cx-scroll cx-noprint" tabIndex={0} role="region" aria-label="Tabel temuan">
          <table className="cx-tbl"><thead><tr><th scope="col">Batch</th><th scope="col">Medium</th><th scope="col">Jenis</th><th scope="col">Temuan</th></tr></thead>
            <tbody>{(all ? fl : fl.slice(0, 8)).map((f) => <tr key={f.key}><th scope="row"><b>{f.batch}</b></th><td>{f.medium}</td><td><span className={`cx-pill static ${typeClass[f.type]}`}>{f.type}</span></td><td>{f.text}</td></tr>)}
              {!fl.length ? <tr><td colSpan={4} className="cx-small">Tidak ada temuan.</td></tr> : null}</tbody></table>
        </div>
        {fl.length > 8 ? <p className="cx-small cx-noprint" role="status">Menampilkan {all ? fl.length : 8} dari {fl.length} temuan.</p> : null}
        {fl.length > 8 ? <button type="button" className="cx-btn cx-noprint" onClick={() => setAll(!all)}>{all ? 'Ciutkan' : `Tampilkan semua (${fl.length})`}</button> : null}
      </section>

      {writer ? <RemovedRuns api={api} compileId={data.compile.compile_id} tick={data} onChanged={reload} /> : null}
      {panel ? <RunPanel api={api} writer={writer} row={panel} mediums={data.mediums} onClose={() => setPanel(null)} onChanged={() => { setPanel(null); reload(); }} /> : null}
      {imp ? <ImportDialog onClose={() => setImp(false)} onDone={() => { setImp(false); reload(); }} /> : null}
    </div>
  );
}

function Cell({ c, none }) {
  if (none || !c) return <td className="n cx-na">—</td>;
  if (c.error) return <td className="n cx-na" title={c.error}>n/a</td>;
  const cls = c.code === 'not_similar' ? 'bad' : c.code === 'similar' ? 'ok' : '';
  return <td className={`n cx-f2 ${cls}`} title={c.outcome.statusText}><span className="cx-mk" aria-hidden="true">{c.mark}</span> <i>{fmtNum(c.f2, 1)}</i><span className="cx-sr"> {c.outcome.statusText}</span></td>;
}
