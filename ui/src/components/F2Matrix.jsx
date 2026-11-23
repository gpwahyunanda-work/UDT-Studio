import { useMemo } from 'react';
import { Check, X } from 'lucide-react';
import { fmtNum } from '../lib/format.js';
import { runLabel } from '../lib/model.js';
import { f2Between } from '../lib/udtBridge.js';

// Matriks f2 antarformula: baris = pembanding, kolom = uji; semua dihitung modul Langkah 4 lewat adaptor.
export function F2Matrix({ host, runs, profiles }) {
  const cells = useMemo(() => runs.map((a) => runs.map((b) => (a.run_id === b.run_id ? null : f2Between(host, profiles.get(a.run_id), profiles.get(b.run_id))))), [runs, profiles, host]);
  if (runs.length < 2) return <p className="uc:text-sm uc:text-muted">Pilih paling sedikit dua run valid di matriks untuk melihat f2 antarformula.</p>;
  return (
    <div className="uc-scroll" tabIndex={0} role="region" aria-label="Matriks f2 antarformula">
      <table className="uc-tbl uc:text-sm">
        <caption className="uc-sr">f2 antar run terpilih. Baris sebagai pembanding, kolom sebagai uji. f2 50 sampai 100 = mirip.</caption>
        <thead><tr><th scope="col">Pembanding ↓ / Uji →</th>{runs.map((r) => <th scope="col" key={r.run_id} className="n">{runLabel(r)}</th>)}</tr></thead>
        <tbody>
          {runs.map((a, i) => (
            <tr key={a.run_id}><th scope="row">{runLabel(a)}</th>
              {runs.map((b, j) => {
                const c = cells[i][j];
                if (!c) return <td key={b.run_id} className="n" style={{ color: '#4F5D66' }}>–</td>;
                if (c.error || !Number.isFinite(c.f2)) return <td key={b.run_id} className="n">n/a</td>;
                const ok = c.outcome.code !== 'not_similar';
                return <td key={b.run_id} className="n" style={{ background: ok ? '#E5F4EB' : '#FFF3E0', color: ok ? '#00693A' : '#8A5100', fontWeight: 600 }}>
                  {ok ? <Check size={12} aria-label="mirip" /> : <X size={12} aria-label="tidak mirip" />} {fmtNum(c.f2, 1)}{c.n < 3 ? <span title="n kurang dari 3"> *</span> : null}
                </td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="uc:text-xs uc:text-muted">Hijau dengan tanda centang = mirip (50 sampai 100 atau Very Rapid). Oranye dengan tanda silang = tidak mirip. Tanda * = kurang dari 3 titik.</p>
    </div>
  );
}
