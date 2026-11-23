import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { CompilerPage } from './CompilerPage.jsx';
import { filterCompiles } from '../lib/search.js';

const routeId = () => { const m = /^#\/c\/(\d+)$/.exec(window.location.hash); return m ? Number(m[1]) : null; };

export function App({ api, me, host }) {
  const [id, setId] = useState(routeId);
  useEffect(() => { const f = () => setId(routeId()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  const open = (n) => { window.location.hash = n ? `#/c/${n}` : ''; setId(n); };
  if (id !== null) return <CompilerPage api={api} me={me} host={host} compileId={id} onBack={() => open(null)} />;
  return <Picker api={api} me={me} open={open} />;
}

// Pintu masuk: pemilih produk dengan pencarian.
function Picker({ api, me, open }) {
  const [list, setList] = useState(null); const [err, setErr] = useState(''); const [q, setQ] = useState('');
  useEffect(() => { let live = true; api('GET', '/api/compiles').then((x) => { if (!live) return; x.status === 200 ? setList(x.body.compiles || []) : setErr((x.body && x.body.error) || 'Daftar produk tidak dapat dimuat'); }).catch(() => live && setErr('Koneksi gagal')); return () => { live = false; }; }, [api]);
  const shown = useMemo(() => filterCompiles(list || [], q), [list, q]);
  return (
    <div className="cx-page">
      <header className="cx-head"><div><p className="cx-eyebrow">UDT COMPILER</p><h1 className="cx-title">Pilih produk</h1><p className="cx-sub">Masuk sebagai {me.role === 'penulis' ? `penulis (${me.analyst})` : 'pembaca'}. Dashboard dibuka per produk.</p></div>
        <div className="cx-actions"><a className="cx-btn cx-primary" href="/">Buka UDT Studio</a></div></header>
      <section className="cx-card" aria-labelledby="cx-pk-h">
        <h2 id="cx-pk-h">Produk tersimpan</h2>
        <div className="cx-search"><label htmlFor="cx-cari" className="cx-sr">Cari produk</label><Search size={16} aria-hidden="true" /><input id="cx-cari" type="search" placeholder="Cari produk, kekuatan, kode project, atau zat aktif" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {err ? <p role="alert" className="cx-err">{err}</p> : null}
        {list === null && !err ? <p role="status">Memuat daftar…</p> : null}
        {list && !list.length ? <p>Belum ada produk. Data masuk lewat tombol “Kirim ke Compiler” di Langkah 5 UDT Studio{me.role === 'penulis' ? ' atau impor sheet lama setelah membuka sebuah produk' : ''}.</p> : null}
        {list && list.length ? <div className="cx-scroll" tabIndex={0} role="region" aria-label="Daftar produk"><table className="cx-tbl"><caption className="cx-sr">Daftar produk. {shown.length} dari {list.length} tampil.</caption>
          <thead><tr><th scope="col">Produk</th><th scope="col">Kode project</th><th scope="col">Zat aktif</th><th scope="col" className="n">Medium</th><th scope="col" className="n">Run</th><th scope="col"><span className="cx-sr">Buka</span></th></tr></thead>
          <tbody>{shown.map((c) => <tr key={c.compile_id}><th scope="row">{c.title.replace(/^Development of\s+/i, '')}</th><td>{c.project_code || '–'}</td><td>{c.api_uncertain ? 'belum pasti' : c.api || '–'}</td><td className="n">{c.medium_count}</td><td className="n">{c.run_count}</td><td><button type="button" className="cx-btn cx-primary" onClick={() => open(c.compile_id)}>Buka dashboard<span className="cx-sr"> {c.title}</span></button></td></tr>)}</tbody></table>
          {!shown.length ? <p className="cx-small" role="status">Tidak ada produk yang cocok dengan “{q}”.</p> : null}</div> : null}
      </section>
    </div>
  );
}
