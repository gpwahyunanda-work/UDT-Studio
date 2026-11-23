import { Fragment } from 'react';
import { ChevronDown, ChevronRight, ShieldAlert } from 'lucide-react';
import { Badge } from './ui/badge.jsx';
import { Swatch } from './QuadrantChart.jsx';
import { fmtNum, fmtDate } from '../lib/format.js';
import { runLabel, firstAtLeast85, maxRsd } from '../lib/model.js';

export const OUTCOME = {
  similar: { text: 'Mirip (Similar)', tone: 'ok' },
  very_rapid: { text: 'Mirip, sangat cepat (Very Rapid)', tone: 'ok' },
  not_similar: { text: 'Tidak mirip (Not Similar)', tone: 'warn' },
  na: { text: 'Belum dapat dihitung', tone: 'plain' },
};
export function OutcomeBadge({ code }) { const o = OUTCOME[code] || OUTCOME.na; return <Badge tone={o.tone}>{o.text}</Badge>; }

export function RunMatrix({ medium, runs, roles, profiles, refId, f2Of, selected, onToggle, onToggleAll, styleOf, expanded, onExpand, printedFor }) {
  const allOn = runs.length > 0 && runs.every((r) => selected.has(r.run_id));
  return (
    <div className="uc-scroll" tabIndex={0} role="region" aria-label={`Matriks run medium ${medium.label}`}>
      <table className="uc-tbl uc:w-full uc:text-sm">
        <caption className="uc-sr">Run pada medium {medium.label}. Centang untuk menampilkan di grafik. Tombol Detail membuka tabel per vessel dan rincian f2.</caption>
        <thead>
          <tr>
            <th scope="col"><input type="checkbox" checked={allOn} onChange={(e) => onToggleAll(e.target.checked)} aria-label="Pilih semua run" /></th>
            <th scope="col">Run (batch)</th><th scope="col">Peran</th><th scope="col">Tanggal</th><th scope="col">Status</th>
            <th scope="col" className="n">f2 vs pembanding aktif</th><th scope="col" className="n">n (Langkah 4)</th><th scope="col">Kesimpulan (dihitung Langkah 4)</th>
            <th scope="col">Rilis ≥ 85%</th><th scope="col" className="n">RSD tertinggi</th><th scope="col"><span className="uc-sr">Detail</span></th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const p = profiles.get(r.run_id); const role = roles.get(r.run_id); const isRef = r.run_id === refId;
            const c = isRef ? null : f2Of(r.run_id); const st = styleOf(r.run_id); const open = expanded === r.run_id; const a85 = firstAtLeast85(p);
            return (
              <Fragment key={r.run_id}>
                <tr className={`${open ? 'uc:bg-brand-soft' : ''} ${r.is_valid ? '' : 'uc:text-muted'}`} onClick={() => onExpand(open ? null : r.run_id)} style={{ cursor: 'pointer' }}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(r.run_id)} onChange={() => onToggle(r.run_id)} aria-label={`Tampilkan ${runLabel(r)} di grafik`} /></td>
                  <th scope="row" style={{ background: 'transparent', whiteSpace: 'normal' }}>
                    <span className="uc:inline-flex uc:items-center uc:gap-2">{isRef ? <span aria-hidden="true" style={{ width: 18, height: 4, background: '#000', display: 'inline-block' }} /> : <Swatch {...st} />}<span>{runLabel(r)}</span></span>
                    {isRef ? <div><Badge tone="brand" className="uc:whitespace-nowrap">Pembanding aktif</Badge></div> : null}
                  </th>
                  <td>{role === 'pembanding' ? 'Pembanding' : 'Uji'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.test_date)}</td>
                  <td>{r.is_valid ? <Badge tone="ok">Valid</Badge> : <Badge tone="danger"><ShieldAlert size={12} aria-hidden="true" /> Tidak valid</Badge>}</td>
                  <td className="n">{isRef ? '–' : c ? fmtNum(c.f2, 1) : refId == null ? 'Tanpa pembanding' : '–'}</td>
                  <td className="n">{c && !c.error ? c.n : '–'}</td>
                  <td>{c && !c.error ? <OutcomeBadge code={c.outcome.code} /> : '–'}</td>
                  <td>{a85 === null ? 'Belum' : `Menit ${a85}`}</td>
                  <td className="n">{fmtNum(maxRsd(p), 1)}%{c && c.rsdExceeded ? <Badge tone="warn" className="uc:ml-1">Di atas batas</Badge> : null}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="uc:inline-flex uc:items-center uc:gap-1 uc:rounded uc:border uc:border-brand uc:bg-surface uc:px-2 uc:py-1 uc:text-brand uc:cursor-pointer" aria-expanded={open} onClick={() => onExpand(open ? null : r.run_id)}>
                      {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />} Detail<span className="uc-sr"> {runLabel(r)}</span>
                    </button>
                  </td>
                </tr>
                {open ? <tr><td colSpan={11} style={{ background: '#F5F8FA' }}><RunDetail run={r} role={role} profile={p} cmp={c} printed={printedFor(r.run_id)} isRef={isRef} /></td></tr> : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RunDetail({ run, role, profile, cmp, printed, isRef }) {
  if (!profile || profile.error) return <p>Profil tidak dapat dihitung: {profile ? profile.error : 'tidak ada data'}.</p>;
  const n = cmp && !cmp.error ? cmp.n : 0;
  const stat = (k, d = 1) => profile.stats.map((s) => fmtNum(s[k], d));
  return (
    <div className="uc:grid uc:gap-3 uc:py-2">
      <dl className="uc:m-0 uc:grid uc:gap-x-6 uc:gap-y-1 uc:text-sm" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
        <div><dt className="uc:text-muted">Produk</dt><dd className="uc:m-0">{run.brand_name}</dd></div>
        <div><dt className="uc:text-muted">Produsen / lokasi</dt><dd className="uc:m-0">{run.manufacturer_site || '–'}</dd></div>
        <div><dt className="uc:text-muted">Peran</dt><dd className="uc:m-0">{role === 'pembanding' ? 'Pembanding' : 'Uji'}{isRef ? ' (aktif)' : ''}</dd></div>
        <div><dt className="uc:text-muted">Sumber</dt><dd className="uc:m-0">{run.source === 'sheet' ? 'Impor sheet' : 'Studio'}</dd></div>
        {run.note ? <div><dt className="uc:text-muted">Catatan</dt><dd className="uc:m-0">{run.note}</dd></div> : null}
        {!run.is_valid ? <div><dt className="uc:text-muted">Alasan Tidak valid</dt><dd className="uc:m-0">{run.invalid_reason}</dd></div> : null}
      </dl>
      <div className="uc-scroll" tabIndex={0} role="region" aria-label={`Tabel per vessel ${runLabel(run)}`}>
        <table className="uc-tbl uc:text-sm">
          <caption className="uc:text-left uc:font-semibold uc:pb-1">Persen terlepas per vessel (%). {n ? `Sel biru muda = titik yang dipakai f2 (menit ${profile.times[0]} sampai ${profile.times[n - 1]}).` : ''}</caption>
          <thead><tr><th scope="col">Vessel</th>{profile.times.map((t, i) => <th scope="col" className="n" key={t}>{t} mnt{n && i === n - 1 ? <div className="uc:text-xs uc:font-normal">titik masuk f2 terakhir</div> : null}</th>)}</tr></thead>
          <tbody>
            {profile.vesselIds.map((v) => (
              <tr key={v}><th scope="row">{v}</th>{profile.times.map((t, i) => <td className="n" key={t} style={n && i < n ? { background: '#E6F1F8' } : undefined}>{fmtNum(run.vessels[v][i], 1)}</td>)}</tr>
            ))}
          </tbody>
          <tfoot>
            {[['Min', 'min'], ['Maks', 'max'], ['Rata-rata', 'avg'], ['SD', 'sd', 2], ['RSD (%)', 'rsd']].map(([lbl, k, d]) => (
              <tr key={k}><th scope="row">{lbl}</th>{stat(k, d || 1).map((s, i) => <td className="n" key={i} style={{ fontWeight: k === 'avg' ? 600 : 400 }}>{s}</td>)}</tr>
            ))}
          </tfoot>
        </table>
      </div>
      {cmp && !cmp.error ? (
        <div className="uc:text-sm">
          <h4 className="uc:font-semibold uc:mb-1">Rincian f2 terhadap pembanding aktif (dihitung modul Langkah 4)</h4>
          <ul className="uc:m-0 uc:pl-5">
            <li>f2 = <strong>{fmtNum(cmp.f2, 2)}</strong> dengan n = {cmp.n} titik ({cmp.usedTimes.map((t) => `${t}`).join(', ')} menit).</li>
            <li>{cmp.reason}.</li>
            {cmp.both85at15 ? <li>Kedua produk ≥ 85% dalam 15 menit: kategori Very Rapid, f2 hanya informasi.</li> : null}
            {cmp.rsdExceeded ? <li>RSD di atas batas pada: {cmp.rsdDetails.join('; ')}.</li> : <li>RSD dalam batas pada titik yang dipakai.</li>}
            {cmp.timesMismatch ? <li>Titik waktu kedua run tidak sama; f2 dihitung pada titik yang sama saja.</li> : null}
            {!cmp.minPointsValid ? <li>Titik kurang dari 3: f2 kurang kuat sebagai bukti.</li> : null}
          </ul>
          {printed ? (
            <p className="uc:mt-1">Tercetak di sheet: f2 = {fmtNum(printed.f2, 2)}, n = {printed.n_points}.{' '}
              {printed.conclusion_printed ? <>Kesimpulan tercetak: “{printed.conclusion_printed}”.</> : <Badge tone="plain">Kesimpulan tercetak kosong; kesimpulan di tabel dihitung, bukan cetak</Badge>}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
