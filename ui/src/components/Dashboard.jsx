import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, TriangleAlert } from 'lucide-react';
import { Button } from './ui/button.jsx';
import { Card } from './ui/card.jsx';
import { Badge } from './ui/badge.jsx';
import { Select } from './ui/input.jsx';
import { QuadrantChart } from './QuadrantChart.jsx';
import { RunMatrix } from './RunMatrix.jsx';
import { F2Matrix } from './F2Matrix.jsx';
import { arrangeMediums, buildProfiles, chartSeries, compareWithRef, defaultRef, deriveRoles, runLabel, styleFor } from '../lib/model.js';
import { dataWarnings, printedVsStep4 } from '../lib/warnings.js';
import { bridgeStatus, f2Between } from '../lib/udtBridge.js';
import { fmtDate } from '../lib/format.js';

export function Dashboard({ api, compileId, host, onBack }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let live = true;
    api('GET', `/api/compiles/${compileId}/data`).then((r) => { if (live) setState(r.status === 200 ? { data: r.body } : { error: (r.body && r.body.error) || 'Data tidak dapat dimuat' }); })
      .catch(() => live && setState({ error: 'Koneksi gagal' }));
    return () => { live = false; };
  }, [api, compileId]);
  if (state.loading) return <p role="status">Memuat data compile…</p>;
  return (
    <div className="uc:grid uc:gap-3">
      <div><Button onClick={onBack}><ArrowLeft size={16} aria-hidden="true" /> Kembali ke daftar compile</Button></div>
      {state.error ? <p role="alert" className="uc:text-danger">{state.error}</p> : <Body data={state.data} host={host} />}
    </div>
  );
}

export function Body({ data, host }) {
  const st = bridgeStatus(host);
  const roles = useMemo(() => deriveRoles(data), [data]);
  const arr = useMemo(() => arrangeMediums(data.mediums, data.runs), [data]);
  const profiles = useMemo(() => (st.ok ? buildProfiles(host, data) : new Map()), [data, host, st.ok]);
  const styleIdx = useMemo(() => new Map(data.runs.map((r, i) => [r.run_id, styleFor(i)])), [data]);
  const styleOf = (id) => styleIdx.get(id);
  const [showInvalid, setShowInvalid] = useState(false);
  const [selected, setSelected] = useState(() => new Set(data.runs.filter((r) => r.is_valid).map((r) => r.run_id)));
  const [refBy, setRefBy] = useState({});
  const [mediumId, setMediumId] = useState(arr.defaultMedium ? arr.defaultMedium.medium_id : null);
  const [expanded, setExpanded] = useState(null);
  const refOf = (mid) => (mid in refBy ? refBy[mid] : defaultRef(mid, data, roles));

  const warns = useMemo(() => {
    if (!st.ok) return [];
    const byCmp = new Map(data.comparisons.map((c) => [c.comparison_id, f2Between(host, profiles.get(c.ref_run_id), profiles.get(c.test_run_id))]));
    return [...dataWarnings(data, roles), ...printedVsStep4(data, byCmp)];
  }, [data, roles, profiles, host, st.ok]);

  if (!st.ok) return <p role="alert" className="uc:text-danger">Modul Langkah 4 tidak ditemukan di halaman ({st.missing.join(', ')}). Dashboard tidak dapat menghitung f2. Muat ulang halaman; bila tetap, hubungi pengembang.</p>;

  const visible = (r) => showInvalid || r.is_valid;
  const medium = data.mediums.find((m) => m.medium_id === mediumId) || null;
  const mediumRuns = data.runs.filter((r) => r.medium_id === mediumId && visible(r));
  const refId = medium ? refOf(medium.medium_id) : null;
  const refRuns = data.runs.filter((r) => r.medium_id === mediumId && r.is_valid && roles.get(r.run_id) === 'pembanding');
  const f2Of = (testId) => compareWithRef(host, profiles, refId, testId);
  const printedFor = (testId) => data.comparisons.find((c) => c.test_run_id === testId && c.ref_run_id === refId) || null;
  const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = (on) => setSelected((s) => { const n = new Set(s); mediumRuns.forEach((r) => (on ? n.add(r.run_id) : n.delete(r.run_id))); return n; });
  const sel2 = mediumRuns.filter((r) => r.is_valid && selected.has(r.run_id));
  const warnCount = warns.length;
  const c = data.compile;

  return (
    <div className="uc:grid uc:gap-4">
      <header>
        <h3 className="uc:text-xl uc:font-semibold">{c.title}</h3>
        <p className="uc:text-sm uc:text-muted">{c.api ? `Zat aktif: ${c.api}. ` : ''}{data.runs.length} run, {data.mediums.length} medium, {data.comparisons.length} perbandingan tersimpan.</p>
      </header>

      <Card aria-labelledby="uc-warn-h">
        <h3 id="uc-warn-h" className="uc:flex uc:items-center uc:gap-2 uc:text-base uc:font-semibold"><TriangleAlert size={18} aria-hidden="true" /> Peringatan <Badge tone={warnCount ? 'warn' : 'ok'}>{warnCount}</Badge></h3>
        {warnCount ? (
          <ul className="uc:m-0 uc:mt-2 uc:grid uc:gap-1 uc:pl-5 uc:text-sm">
            {warns.map((w, i) => <li key={i}><Badge tone={w.code.startsWith('W-n') || w.code === 'W-f2-selisih' ? 'warn' : 'plain'}>{w.code}</Badge> {w.text}</li>)}
          </ul>
        ) : <p className="uc:text-sm uc:text-muted">Tidak ada peringatan mutu data.</p>}
      </Card>

      <div className="uc:flex uc:flex-wrap uc:items-center uc:gap-4">
        <label className="uc:inline-flex uc:items-center uc:gap-2"><input type="checkbox" checked={showInvalid} onChange={(e) => setShowInvalid(e.target.checked)} /> Tampilkan run Tidak valid ({data.runs.filter((r) => !r.is_valid).length})</label>
      </div>

      <section aria-labelledby="uc-grafik-h">
        <h3 id="uc-grafik-h" className="uc:mb-2 uc:text-base uc:font-semibold">Grafik pelepasan per medium</h3>
        <div className="uc:grid uc:gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,460px),1fr))' }}>
          {arr.quads.map((q, i) => {
            if (!q.medium) return <Card key={q.slot}><h4 className="uc:font-semibold">{q.slot === 'Release' ? 'Release' : `pH ${q.slot}`}</h4><p className="uc:text-sm uc:text-muted">Compile ini tidak punya medium ini.</p></Card>;
            const runs = data.runs.filter((r) => r.medium_id === q.medium.medium_id && visible(r) && r.is_valid);
            const rid = refOf(q.medium.medium_id);
            const cs = chartSeries(profiles, runs, selected, rid);
            const rr = data.runs.find((r) => r.run_id === rid);
            return <QuadrantChart key={q.medium.medium_id} id={`uc-q${i}`} title={q.medium.label} sub={`${q.medium.full_name}${q.substituted ? ' (pengganti Release: medium dengan run terbanyak)' : ''}`}
              refPts={cs.ref} refRun={rr ? runLabel(rr) : ''} series={cs.series} styleOf={styleOf} />;
          })}
        </div>
      </section>

      <section aria-labelledby="uc-mat-h" className="uc:grid uc:gap-2">
        <h3 id="uc-mat-h" className="uc:text-base uc:font-semibold">Matriks run</h3>
        <div role="group" aria-label="Pilih medium" className="uc:flex uc:flex-wrap uc:gap-2">
          {arr.quads.filter((q) => q.medium).map((q) => (
            <Button key={q.medium.medium_id} variant={q.medium.medium_id === mediumId ? 'primary' : 'outline'} aria-pressed={q.medium.medium_id === mediumId} onClick={() => { setMediumId(q.medium.medium_id); setExpanded(null); }}>{q.medium.label}</Button>
          ))}
        </div>
        {medium ? (
          <>
            <div className="uc:flex uc:flex-wrap uc:items-center uc:gap-2">
              <label htmlFor="uc-ref" className="uc:font-semibold">Pembanding aktif</label>
              <Select id="uc-ref" value={refId == null ? '' : String(refId)} onChange={(e) => setRefBy({ ...refBy, [medium.medium_id]: e.target.value === '' ? null : Number(e.target.value) })}>
                <option value="">Tanpa pembanding</option>
                {refRuns.map((r) => <option key={r.run_id} value={r.run_id}>{r.brand_name} {runLabel(r)} · {fmtDate(r.test_date)}</option>)}
              </Select>
              <span className="uc:text-sm uc:text-muted">{medium.full_name}</span>
            </div>
            {mediumRuns.length ? <RunMatrix medium={medium} runs={mediumRuns} roles={roles} profiles={profiles} refId={refId} f2Of={f2Of} selected={selected} onToggle={toggle} onToggleAll={toggleAll}
              styleOf={styleOf} expanded={expanded} onExpand={setExpanded} printedFor={printedFor} /> : <p className="uc:text-sm uc:text-muted">Belum ada run pada medium ini.</p>}
            <h3 className="uc:mt-2 uc:text-base uc:font-semibold">f2 antarformula ({medium.label})</h3>
            <F2Matrix host={host} runs={sel2} profiles={profiles} />
          </>
        ) : <p>Compile ini belum punya medium.</p>}
      </section>
    </div>
  );
}

