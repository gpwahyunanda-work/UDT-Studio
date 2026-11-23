import { useEffect, useState } from 'react';
import { fmtDate } from '../lib/format.js';

function Modal({ title, onClose, children, wide }) {
  useEffect(() => { const f = (e) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', f); return () => document.removeEventListener('keydown', f); }, [onClose]);
  return (
    <div className="cx-back cx-noprint" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`cx-dlg ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="cx-dlg-h">
        <div className="cx-dlg-h"><h2 id="cx-dlg-h">{title}</h2><button type="button" className="cx-btn" onClick={onClose} autoFocus>Tutup</button></div>
        {children}
      </div>
    </div>
  );
}
const post = (api, m, p, b) => api(m, p, b).then((r) => { if (r.status >= 400) throw new Error((r.body && r.body.error) || 'Gagal'); return r.body; });
const errText = (e) => (e && e.message) || 'Gagal';

// Detail batch: status Valid/Tidak valid + alasan, catatan, varian, hapus (konfirmasi + alasan), jejak perubahan dengan nilai lama.
export function RunPanel({ api, writer, row, mediums, onClose, onChanged }) {
  const med = new Map(mediums.map((m) => [m.medium_id, m.label]));
  return (
    <Modal title={`Batch ${row.batch}${row.variant ? ' ' + row.variant : ''}`} onClose={onClose} wide>
      <p className="cx-small">{row.brand}. Identitas run = produk + batch + varian + medium + data vessel; tanggal tidak termasuk identitas.{writer ? '' : ' Akun pembaca: hanya melihat.'}</p>
      {row.runs.slice().sort((a, b) => a.medium_id - b.medium_id || b.run_id - a.run_id).map((r) => <RunEditor key={r.run_id} api={api} writer={writer} run={r} medLabel={med.get(r.medium_id)} onChanged={onChanged} />)}
    </Modal>
  );
}

function RunEditor({ api, writer, run, medLabel, onChanged }) {
  const [f, setF] = useState({ is_valid: run.is_valid, invalid_reason: run.invalid_reason || '', note: run.note || '', variant: run.variant || '' });
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [trail, setTrail] = useState(null); const [del, setDel] = useState(null);
  useEffect(() => { let live = true; api('GET', `/api/runs/${run.run_id}/audit`).then((r) => live && setTrail(r.body.events || [])); return () => { live = false; }; }, [api, run.run_id, msg]);
  const save = async () => {
    if (busy) return; setBusy(true); setMsg('');
    try {
      const body = { is_valid: f.is_valid, invalid_reason: f.is_valid ? null : f.invalid_reason, note: f.note || null, variant: f.variant };
      const r = await post(api, 'PATCH', `/api/runs/${run.run_id}`, body);
      setMsg(r.unchanged ? 'Tidak ada perubahan.' : `Tersimpan (${r.changed.join(', ')}). Perubahan tercatat di jejak.`); if (!r.unchanged) setTimeout(onChanged, 700);
    } catch (e) { setMsg(errText(e)); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (busy) return; setBusy(true);
    try { await post(api, 'POST', `/api/runs/${run.run_id}/delete`, { confirm: true, reason: del.reason }); onChanged(); } catch (e) { setMsg(errText(e)); setBusy(false); }
  };
  return (
    <section className="cx-run">
      <h3>{medLabel} <span className="cx-small">· {fmtDate(run.test_date)} · run {run.run_id} · {run.source === 'sheet' ? 'impor sheet' : 'Studio'} · {run.is_valid ? 'Valid' : 'Tidak valid'}</span></h3>
      {writer ? (
        <div className="cx-form">
          <label>Status<select value={f.is_valid ? 'v' : 't'} onChange={(e) => setF({ ...f, is_valid: e.target.value === 'v' })}><option value="v">Valid</option><option value="t">Tidak valid</option></select></label>
          {!f.is_valid ? <label>Alasan Tidak valid (wajib)<input value={f.invalid_reason} onChange={(e) => setF({ ...f, invalid_reason: e.target.value })} maxLength={500} /></label> : null}
          <label>Varian<input value={f.variant} onChange={(e) => setF({ ...f, variant: e.target.value })} maxLength={120} /></label>
          <label className="wide">Catatan<textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={2000} /></label>
          <div className="cx-row"><button type="button" className="cx-btn cx-primary" disabled={busy || (!f.is_valid && !f.invalid_reason.trim())} onClick={save}>Simpan perubahan</button>
            <button type="button" className="cx-btn danger" disabled={busy} onClick={() => setDel({ reason: '' })}>Hapus run…</button><span role="status" className="cx-small">{msg}</span></div>
          {del ? <div className="cx-confirm" role="alertdialog" aria-label="Konfirmasi hapus"><p><b>Hapus run ini?</b> Run tidak dihapus permanen: disembunyikan dan dapat dipulihkan; alasan tercatat.</p><label>Alasan hapus (wajib)<input value={del.reason} onChange={(e) => setDel({ reason: e.target.value })} /></label><div className="cx-row"><button type="button" className="cx-btn danger" disabled={busy || !del.reason.trim()} onClick={remove}>Ya, hapus</button><button type="button" className="cx-btn" onClick={() => setDel(null)}>Batal</button></div></div> : null}
        </div>
      ) : <p className="cx-small">{run.note ? `Catatan: ${run.note}` : 'Tanpa catatan.'}{run.is_valid ? '' : ` Tidak valid: ${run.invalid_reason}`}</p>}
      <details><summary>Jejak perubahan ({trail ? trail.length : '…'})</summary>
        <ul className="cx-trail">{(trail || []).map((e) => <li key={e.event_id}><b>{e.action}</b> oleh {e.analyst}, {new Date(e.at_utc).toLocaleString('id-ID')}{e.reason ? ` — alasan: ${e.reason}` : ''}{e.changes.length ? <ul>{e.changes.map((c) => <li key={c.field}>{c.field}: <del>{c.old ?? '(kosong)'}</del> → <ins>{c.new ?? '(kosong)'}</ins></li>)}</ul> : null}</li>)}{trail && !trail.length ? <li className="cx-small">Belum ada perubahan.</li> : null}</ul></details>
    </section>
  );
}

export function RemovedRuns({ api, compileId, tick, onChanged }) {
  const [rows, setRows] = useState([]); const [msg, setMsg] = useState('');
  useEffect(() => { let live = true; api('GET', `/api/compiles/${compileId}/removed`).then((r) => live && setRows(r.body.runs || [])); return () => { live = false; }; }, [api, compileId, tick]);
  if (!rows.length) return null;
  const restore = async (r) => {
    const reason = window.prompt(`Alasan memulihkan run ${r.run_id} (${r.batch_no})?`); if (!reason || !reason.trim()) return;
    try { await post(api, 'POST', `/api/runs/${r.run_id}/restore`, { reason }); onChanged(); } catch (e) { setMsg(errText(e)); }
  };
  return (
    <section className="cx-card cx-noprint" aria-labelledby="cx-rm-h"><h2 id="cx-rm-h">Run dihapus atau ditimpa ({rows.length})</h2>
      <ul>{rows.map((r) => <li key={r.run_id}>{r.batch_no}{r.variant ? ' ' + r.variant : ''} · {r.medium_code} · {r.kind} oleh {r.analyst} — {r.reason} {r.restorable ? <button type="button" className="cx-btn" onClick={() => restore(r)}>Pulihkan</button> : <span className="cx-small">(ditimpa; tidak dapat dipulihkan dari sini)</span>}</li>)}</ul><p role="status" className="cx-small">{msg}</p></section>
  );
}

// Impor sheet lama dari UI: pilih .xlsx -> laporan pencocokan (belum disimpan) -> konfirmasi.
export function ImportDialog({ onClose, onDone }) {
  const [file, setFile] = useState(null); const [rep, setRep] = useState(null); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(null);
  const send = async (dry) => {
    const r = await fetch(`/api/imports/xlsx${dry ? '?dry=1' : ''}`, { method: 'POST', credentials: 'same-origin', headers: { 'x-file-name': encodeURIComponent(file.name), 'content-type': 'application/octet-stream' }, body: file });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error ? j.error + (j.details ? ': ' + j.details.join('; ') : '') : 'Gagal'); return j;
  };
  const check = async () => { setBusy(true); setMsg(''); setRep(null); try { setRep(await send(true)); } catch (e) { setMsg(errText(e)); } finally { setBusy(false); } };
  const go = async () => { if (busy) return; setBusy(true); setMsg(''); try { setDone(await send(false)); } catch (e) { setMsg(errText(e)); } finally { setBusy(false); } };
  return (
    <Modal title="Impor sheet lama" onClose={onClose} wide>
      <p className="cx-small">Berkas “Development of … .xlsx”. Tab non-UDT diabaikan; nama tab boleh “UDT …”; Vastrol tanpa Release diterima. Pembacaan satu arah dari berkas yang Anda pilih, tidak ada baca-balik dari Google Sheets.</p>
      <input type="file" accept=".xlsx" aria-label="Pilih berkas xlsx" onChange={(e) => { setFile(e.target.files[0] || null); setRep(null); setDone(null); }} />
      <div className="cx-row"><button type="button" className="cx-btn" disabled={!file || busy} onClick={check}>Periksa (belum disimpan)</button>{rep && !done ? <button type="button" className="cx-btn cx-primary" disabled={busy} onClick={go}>Impor ke database</button> : null}</div>
      <p role="alert" className="cx-err">{msg}</p>
      {rep ? <Report r={rep} /> : null}
      {done ? <div><p className="cx-ok" role="status">Impor selesai: {JSON.stringify(done.counts)}; perbandingan ditambah {done.comparisons_added}.</p><button type="button" className="cx-btn cx-primary" onClick={onDone}>Muat ulang dashboard</button></div> : null}
    </Modal>
  );
}
function Report({ r }) {
  return (
    <div className="cx-report" aria-label="Laporan pencocokan">
      <h3>Laporan pencocokan</h3>
      <ul><li>Compile: <b>{r.compile ? r.compile.title : 'tidak terbaca dari nama berkas'}</b></li><li>Medium terbaca: {r.mediums.map((m) => m.code).join(', ') || '–'}</li><li>Run: {r.runs}; perbandingan: {r.comparisons}</li>
        <li>Pemeriksaan f2 sheet: {r.f2_cocok} cocok, {r.f2_tidak_cocok} tidak cocok</li><li>Tab diabaikan (bukan UDT): {r.tab_diabaikan.join(', ') || 'tidak ada'}</li><li>Blok/tab ditahan: {r.ditahan}</li></ul>
      {Object.entries(r.notes || {}).map(([k, v]) => <details key={k}><summary>{k} ({v.length})</summary><ul>{v.slice(0, 30).map((n, i) => <li key={i} className="cx-small">{n.tab ? `[${n.tab}] ` : ''}{n.message}</li>)}</ul></details>)}
    </div>
  );
}
