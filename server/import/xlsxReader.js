// Baca berkas .xlsx (unggahan analis) menjadi grid {name, values, formulas, comments} untuk readWorkbook. Hanya baca; tidak ada tulis ke Sheets.
import ExcelJS from 'exceljs';

const pad = (n) => String(n).padStart(2, '0');
const scalar = (v) => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === 'object') {
    if ('result' in v) return scalar(v.result);
    if ('richText' in v) return v.richText.map((x) => x.text).join('');
    if ('text' in v) return String(v.text);
    if ('error' in v) return '';
    return '';
  }
  return String(v);
};
const formulaOf = (cell, v) => {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    if (typeof v.formula === 'string') return '=' + v.formula;
    if (typeof v.sharedFormula === 'string') { try { return '=' + cell.formula; } catch { return ''; } }
  }
  return scalar(v);
};

export async function readXlsxTabs(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const tabs = [];
  wb.eachSheet((ws) => {
    const values = [], formulas = [], comments = {}; let emptyComments = 0;
    ws.eachRow({ includeEmpty: false }, (row, rn) => {
      const rv = [], rf = [];
      row.eachCell({ includeEmpty: false }, (cell, cn) => {
        rv[cn - 1] = scalar(cell.value); rf[cn - 1] = formulaOf(cell, cell.value);
        const note = cell.note;
        if (note) { const txt = typeof note === 'string' ? note : (note.texts || []).map((t) => t.text).join(''); if (txt.trim()) comments[cell.address] = txt; else emptyComments += 1; }   // komentar berutas Google tidak terbaca dari .xlsx
      });
      values[rn - 1] = Array.from(rv, (x) => x ?? ''); formulas[rn - 1] = Array.from(rf, (x) => x ?? '');
    });
    for (let i = 0; i < values.length; i++) { values[i] ||= []; formulas[i] ||= []; }
    tabs.push({ name: ws.name, values, formulas, comments, emptyComments });
  });
  return tabs;
}
