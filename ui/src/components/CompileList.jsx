import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from './ui/input.jsx';
import { Button } from './ui/button.jsx';
import { Card } from './ui/card.jsx';
import { Dashboard } from './Dashboard.jsx';
import { filterCompiles } from '../lib/search.js';

export function App({ api, me, host }) {
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  useEffect(() => {
    let live = true;
    api('GET', '/api/compiles').then((r) => { if (!live) return; if (r.status === 200) setList(r.body.compiles || []); else setErr((r.body && r.body.error) || 'Daftar compile tidak dapat dimuat'); }).catch(() => live && setErr('Koneksi gagal'));
    return () => { live = false; };
  }, [api]);
  const shown = useMemo(() => filterCompiles(list || [], q), [list, q]);
  if (open !== null) return <Dashboard api={api} compileId={open} host={host} onBack={() => setOpen(null)} />;
  return (
    <div className="uc:grid uc:gap-3">
      <p className="uc:text-sm">Masuk sebagai <strong>{me.analyst}</strong></p>
      <Card aria-labelledby="uc-list-h">
        <h3 id="uc-list-h" className="uc:mb-2 uc:text-base uc:font-semibold">Compile tersimpan</h3>
        <div className="uc:relative uc:mb-3 uc:max-w-md">
          <label htmlFor="uc-cari" className="uc-sr">Cari compile</label>
          <Search size={16} aria-hidden="true" className="uc:absolute uc:left-3 uc:top-2.5 uc:text-muted" />
          <Input id="uc-cari" type="search" className="uc:pl-9" placeholder="Cari produk, kekuatan, atau zat aktif" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {err ? <p role="alert" className="uc:text-danger">{err}</p> : null}
        {list === null && !err ? <p role="status">Memuat daftar…</p> : null}
        {list && !list.length ? <p>Belum ada compile. Data masuk lewat impor sheet atau “Tambahkan ke Compile” (sprint berikutnya).</p> : null}
        {list && list.length ? (
          <div className="uc-scroll" tabIndex={0} role="region" aria-label="Daftar compile">
            <table className="uc-tbl uc:w-full uc:text-sm">
              <caption className="uc-sr">Daftar compile. {shown.length} dari {list.length} tampil.</caption>
              <thead><tr><th scope="col">Compile</th><th scope="col">Zat aktif</th><th scope="col" className="n">Medium</th><th scope="col" className="n">Run</th><th scope="col"><span className="uc-sr">Buka</span></th></tr></thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.compile_id}>
                    <th scope="row" style={{ background: 'transparent', whiteSpace: 'normal' }}>{c.title}</th>
                    <td>{c.api || '–'}</td><td className="n">{c.medium_count}</td><td className="n">{c.run_count}</td>
                    <td><Button variant="primary" onClick={() => setOpen(c.compile_id)}>Buka dashboard<span className="uc-sr"> {c.title}</span></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!shown.length ? <p className="uc:p-2 uc:text-muted" role="status">Tidak ada compile yang cocok dengan “{q}”.</p> : null}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
