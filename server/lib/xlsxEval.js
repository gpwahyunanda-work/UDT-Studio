// F24: evaluator rumus untuk isi cache nilai rumus pada .xlsx hasil (penampil tanpa hitung ulang tetap menunjukkan angka)
// dan untuk tes paritas (hitung ulang dari berkas hasil, bukan dari modul penghasil). Memakai fast-formula-parser (MIT).
import FormulaParser from 'fast-formula-parser';
import { colName } from './xlsxTemplate.js';

const unesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
// Fungsi yang belum ada di fast-formula-parser (hanya rentang/angka; sel kosong dan teks pada rentang diabaikan, seperti Excel).
const nums = (args) => args.map((a) => a.value).flatMap((a) => (Array.isArray(a) ? a.flat() : [a])).filter((x) => typeof x === 'number' && Number.isFinite(x));
const FUNCTIONS = {
  MIN: (...a) => { const v = nums(a); return v.length ? Math.min(...v) : 0; },
  MAX: (...a) => { const v = nums(a); return v.length ? Math.max(...v) : 0; },
  STDEV: (...a) => { const v = nums(a); if (v.length < 2) return new FormulaParser.FormulaError('#DIV/0!'); const m = v.reduce((x, y) => x + y, 0) / v.length; return Math.sqrt(v.reduce((x, y) => x + (y - m) ** 2, 0) / (v.length - 1)); },
};
export const sharedStrings = (xml) => (xml ? [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unesc(t[1])).join('')) : []);

// models: Map(nama tab -> Sheet). Hasil: Map('tab!A1' -> nilai | { error }). writeBack = isi cache ke model.
export function evaluateAll(models, ss, { writeBack = false } = {}) {
  const memo = new Map(), busy = new Set();
  const constant = (cell) => {
    if (!cell) return null;
    const t = cell.attrs.t;
    if (cell.is != null) return unesc(cell.is.replace(/<[^>]+>/g, ''));
    if (cell.v == null) return null;
    if (t === 's') return ss[Number(cell.v)] ?? '';
    if (t === 'str') return unesc(cell.v);
    if (t === 'b') return cell.v === '1';
    if (t === 'e') return { error: cell.v };
    return Number(cell.v);
  };
  const parser = new FormulaParser({
    functions: FUNCTIONS,
    onCell: (ref) => { const v = valueAt(ref.sheet, ref.row, ref.col); return v && typeof v === 'object' && v.error ? new FormulaParser.FormulaError(v.error) : v; },
    onRange: (ref) => { const out = []; for (let r = ref.from.row; r <= ref.to.row; r++) { const row = []; for (let c = ref.from.col; c <= ref.to.col; c++) { const v = valueAt(ref.sheet, r, c); row.push(v && typeof v === 'object' && v.error ? new FormulaParser.FormulaError(v.error) : v); } out.push(row); } return out; },
  });
  function valueAt(sheet, row, col) {
    const key = `${sheet}!${colName(col)}${row}`;
    if (memo.has(key)) return memo.get(key);
    const sh = models.get(sheet), cell = sh?.cell(colName(col) + row);
    if (!cell) return null;
    if (!cell.f) return constant(cell);
    if (busy.has(key)) return { error: '#REF!' };
    busy.add(key);
    let res;
    try {
      const out = parser.parse(cell.f.text, { sheet, row, col });
      res = out && typeof out === 'object' && 'error' in out && !Array.isArray(out) ? { error: out.error } : (Array.isArray(out) ? out[0]?.[0] ?? null : out);
    } catch (e) { res = { error: e.message?.startsWith('#') ? e.message : '#VALUE!' }; }
    busy.delete(key);
    if (res === null || res === undefined) res = 0;
    memo.set(key, res);
    if (writeBack) {
      delete cell.attrs.t;
      if (typeof res === 'number') cell.v = Number.isFinite(res) ? String(res) : (cell.attrs.t = 'e', '#NUM!');
      else if (typeof res === 'string') { cell.attrs.t = 'str'; cell.v = res.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
      else if (typeof res === 'boolean') { cell.attrs.t = 'b'; cell.v = res ? '1' : '0'; }
      else { cell.attrs.t = 'e'; cell.v = res.error || '#VALUE!'; }
    }
    return res;
  }
  const out = new Map();
  for (const [name, sh] of models) for (const [r, rw] of sh.rows) for (const [c, cell] of rw.cells) if (cell.f) out.set(`${name}!${colName(c)}${r}`, valueAt(name, r, c));
  return out;
}

export async function recalcPkg(pkg) {
  for (const n of pkg.names()) await pkg.sheet(n);
  const ss = sharedStrings(await pkg.text('xl/sharedStrings.xml'));
  evaluateAll(pkg.models, ss, { writeBack: true });
}
