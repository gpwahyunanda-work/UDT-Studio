// F24: pengisi Master Template .xlsx resmi LANGSUNG di tingkat paket OOXML (zip + XML).
// Alasan bukan exceljs: exceljs membuang grafik (chart) dan sebagian gambar saat memuat-ulang berkas; Master Report/Summary
// membawa grafik profil disolusi. Di sini semua bagian lain (gaya, merge, border, rumus, grafik, logo) tidak disentuh;
// hanya isi sel yang disebut yang diubah. Rumus bersama (t="shared", hasil ekspor Google Sheets) diurai jadi rumus biasa dulu.
import JSZip from 'jszip';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
export const colName = (n) => { let s = ''; for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s; return s; };
export const colNum = (s) => [...s].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
export const splitRef = (ref) => { const m = /^([A-Z]+)(\d+)$/.exec(ref); if (!m) throw new Error('referensi sel tidak valid: ' + ref); return { col: colNum(m[1]), row: Number(m[2]) }; };
const attrsOf = (s) => { const o = {}; for (const m of s.matchAll(/([\w:]+)="([^"]*)"/g)) o[m[1]] = m[2]; return o; };
const attrStr = (o) => Object.entries(o).map(([k, v]) => ` ${k}="${v}"`).join('');

// Geser referensi relatif pada rumus (untuk mengurai rumus bersama). $ = mutlak.
const REF = /(?<![A-Za-z0-9_.])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\d(A-Za-z_])/g;
export function shiftFormula(text, dr, dc) {
  return text.split(/("[^"]*")/).map((part, i) => (i % 2 ? part : part.replace(REF, (_m, ca, c, ra, r) => `${ca}${ca ? c : colName(colNum(c) + dc)}${ra}${ra ? r : Number(r) + dr}`))).join('');
}

export class Sheet {
  constructor(xml) {
    const a = xml.indexOf('<sheetData'), b = xml.indexOf('</sheetData>');
    if (a < 0) throw new Error('sheetData tidak ditemukan');
    const open = xml.indexOf('>', a);
    this.head = xml.slice(0, a); this.tail = xml.slice(b + 12);
    this.rows = new Map();
    const shared = new Map(), dep = [];
    if (b > 0) for (const rm of xml.slice(open + 1, b).matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const ra = attrsOf(rm[1]), r = Number(ra.r), cells = new Map();
      for (const cm of (rm[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ca = attrsOf(cm[1]), inner = cm[2] || '', fm = /<f\b([^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/.exec(inner), vm = /<v>([\s\S]*?)<\/v>/.exec(inner), im = /<is>([\s\S]*?)<\/is>/.exec(inner);
        const { col } = splitRef(ca.r);
        const cell = { attrs: ca, f: fm ? { attrs: attrsOf(fm[1]), text: fm[2] != null ? unesc(fm[2]) : null } : null, v: vm ? vm[1] : null, is: im ? im[1] : null };
        if (cell.f && cell.f.attrs.t === 'shared') { if (cell.f.text) shared.set(cell.f.attrs.si, { text: cell.f.text, row: r, col }); else dep.push({ cell, r, col }); }
        cells.set(col, cell);
      }
      this.rows.set(r, { attrs: ra, cells });
    }
    for (const c of this.rows.values()) for (const cell of c.cells.values()) if (cell.f?.attrs.t === 'shared' && cell.f.text) { const { si } = cell.f.attrs; cell.f = { attrs: {}, text: cell.f.text, si }; }
    for (const { cell, r, col } of dep) { const m = shared.get(cell.f.attrs.si); cell.f = { attrs: {}, text: m ? shiftFormula(m.text, r - m.row, col - m.col) : '0' }; }
  }

  cell(ref, create = false) {
    const { col, row } = splitRef(ref);
    let rw = this.rows.get(row);
    if (!rw) { if (!create) return null; rw = { attrs: { r: String(row) }, cells: new Map() }; this.rows.set(row, rw); }
    let c = rw.cells.get(col);
    if (!c && create) { c = { attrs: { r: ref }, f: null, v: null, is: null }; rw.cells.set(col, c); }
    return c || null;
  }
  // Isi sel. val: null/'' = kosong (gaya dipertahankan); number; string (teks biasa, bukan rumus); { f, v } = rumus dengan nilai cache.
  set(ref, val) {
    const c = this.cell(ref, true); delete c.attrs.t; c.f = null; c.v = null; c.is = null;
    if (val && typeof val === 'object') {
      c.f = { attrs: {}, text: val.f.replace(/^=/, '') };
      if (typeof val.v === 'number' && Number.isFinite(val.v)) c.v = String(val.v);
      else if (typeof val.v === 'string') { c.attrs.t = 'str'; c.v = esc(val.v); }
    } else if (typeof val === 'number') { if (Number.isFinite(val)) c.v = String(val); }
    else if (val !== null && val !== undefined && val !== '') { c.attrs.t = 'inlineStr'; c.is = `<t xml:space="preserve">${esc(val)}</t>`; }
    return c;
  }
  clear(ref) { if (this.cell(ref)) this.set(ref, null); }
  clearRange(c1, r1, c2, r2) { for (let r = r1; r <= r2; r++) { const rw = this.rows.get(r); if (!rw) continue; for (let c = c1; c <= c2; c++) if (rw.cells.has(c)) this.set(colName(c) + r, null); } }
  hideRows(r1, r2) { for (let r = r1; r <= r2; r++) { let rw = this.rows.get(r); if (!rw) { rw = { attrs: { r: String(r) }, cells: new Map() }; this.rows.set(r, rw); } rw.attrs.hidden = '1'; } }
  value(ref) { const c = this.cell(ref); if (!c) return undefined; if (c.is) return unesc(c.is.replace(/<[^>]+>/g, '')); if (c.v == null) return undefined; return c.attrs.t === 's' || c.attrs.t === 'str' ? unesc(c.v) : Number(c.v); }

  toXml() {
    const rows = [...this.rows.entries()].sort((a, b) => a[0] - b[0]).map(([r, rw]) => {
      const { r: _r, ...rest } = rw.attrs;
      const cells = [...rw.cells.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => {
        const f = c.f ? `<f>${esc(c.f.text ?? '')}</f>` : '';
        const inner = f + (c.is != null ? `<is>${c.is}</is>` : '') + (c.v != null ? `<v>${c.v}</v>` : '');
        return inner ? `<c${attrStr(c.attrs)}>${inner}</c>` : `<c${attrStr(c.attrs)}/>`;
      }).join('');
      return `<row r="${r}"${attrStr(rest)}>${cells}</row>`;
    }).join('');
    return `${this.head}<sheetData>${rows}</sheetData>${this.tail}`;
  }
}

export const safeName = (n) => String(n).replace(/[\[\]:*?\/\\]/g, '-').replace(/^'+|'+$/g, '').slice(0, 31) || 'Sheet';
const quoteName = (n) => `'${n.replaceAll("'", "''")}'`;

export class Pkg {
  static async load(buf) { const p = new Pkg(await JSZip.loadAsync(buf)); await p.init(); return p; }
  constructor(zip) { this.zip = zip; this.models = new Map(); }
  async text(path) { const f = this.zip.file(path); return f ? f.async('string') : null; }
  put(path, s) { this.zip.file(path, s); }
  async init() {
    this.wb = await this.text('xl/workbook.xml'); this.wbRels = await this.text('xl/_rels/workbook.xml.rels'); this.ct = await this.text('[Content_Types].xml');
    const rel = new Map([...this.wbRels.matchAll(/<Relationship\b([^>]*?)\/>/g)].map((m) => { const a = attrsOf(m[1]); return [a.Id, a.Target]; }));
    this.sheets = [...this.wb.matchAll(/<sheet\b([^>]*?)\/>/g)].map((m) => { const a = attrsOf(m[1]); const t = rel.get(a['r:id']); return { name: unesc(a.name), sheetId: Number(a.sheetId), rid: a['r:id'], path: 'xl/' + t.replace(/^\/?(xl\/)?/, '') }; });
  }
  names() { return this.sheets.map((s) => s.name); }
  rec(name) { const r = this.sheets.find((s) => s.name === name); if (!r) throw new Error('tab tidak ada: ' + name); return r; }
  async sheet(name) { if (!this.models.has(name)) this.models.set(name, new Sheet(await this.text(this.rec(name).path))); return this.models.get(name); }
  relsPath(sheetPath) { return sheetPath.replace('worksheets/', 'worksheets/_rels/') + '.rels'; }
  nextIdx(prefix, dir) { let m = 0; this.zip.forEach((p) => { const x = new RegExp(`^xl/${dir}/${prefix}(\\d+)\\.xml$`).exec(p); if (x) m = Math.max(m, Number(x[1])); }); return m + 1; }
  overrideType(part) { const m = new RegExp(`<Override\\b[^>]*PartName="/${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*/>`).exec(this.ct); return m ? attrsOf(m[0]).ContentType : null; }
  addOverride(part, type) { this.ct = this.ct.replace('</Types>', `<Override ContentType="${type}" PartName="/${part}"/></Types>`); }
  dropOverride(part) { this.ct = this.ct.replace(new RegExp(`<Override\\b[^>]*PartName="/${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*/>`), ''); }

  // Ubah nama tab + semua rujukan grafik pada gambar tab itu.
  async rename(old, neu) {
    const r = this.rec(old); neu = safeName(neu);
    if (neu !== old && this.names().includes(neu)) throw new Error('nama tab ganda: ' + neu);
    await this.patchCharts(r.path, (x) => x.replaceAll(`${quoteName(old)}!`, `${quoteName(neu)}!`).replaceAll(`${esc(quoteName(old))}!`, `${esc(quoteName(neu))}!`).replaceAll(`>${old}!`, `>${quoteName(neu)}!`));
    if (this.models.has(old)) { this.models.set(neu, this.models.get(old)); this.models.delete(old); }
    r.name = neu; return neu;
  }
  async drawingOf(sheetPath) {
    const rels = await this.text(this.relsPath(sheetPath)); if (!rels) return null;
    const m = /<Relationship\b[^>]*Type="[^"]*\/drawing"[^>]*\/>/.exec(rels); if (!m) return null;
    const a = attrsOf(m[0]); return { id: a.Id, path: 'xl/' + a.Target.replace(/^\.\.\//, '') };
  }
  async chartsOf(drawingPath) {
    const rels = await this.text(drawingPath.replace('drawings/', 'drawings/_rels/') + '.rels'); if (!rels) return [];
    return [...rels.matchAll(/<Relationship\b[^>]*Type="[^"]*\/chart"[^>]*\/>/g)].map((m) => { const a = attrsOf(m[0]); return { id: a.Id, path: 'xl/' + a.Target.replace(/^\.\.\//, '') }; });
  }
  async patchCharts(sheetPath, fn) { const d = await this.drawingOf(sheetPath); if (!d) return; for (const c of await this.chartsOf(d.path)) this.put(c.path, fn(await this.text(c.path))); }

  // Salin tab (dari berkas ASLI di paket, belum diedit) beserta gambar/grafiknya.
  async clone(src, newName) {
    newName = safeName(newName); if (this.names().includes(newName)) throw new Error('nama tab ganda: ' + newName);
    const s = this.rec(src), idx = this.nextIdx('sheet', 'worksheets'), path = `xl/worksheets/sheet${idx}.xml`;
    this.put(path, await this.text(s.path)); this.addOverride(path, this.overrideType(s.path));
    const rels = await this.text(this.relsPath(s.path)), d = await this.drawingOf(s.path);
    if (rels && d) {
      const di = this.nextIdx('drawing', 'drawings'), dp = `xl/drawings/drawing${di}.xml`;
      this.put(dp, await this.text(d.path)); this.addOverride(dp, this.overrideType(d.path));
      this.put(this.relsPath(path), rels.replace(d.path.replace('xl/', '../'), dp.replace('xl/', '../')));
      const drelsSrc = await this.text(d.path.replace('drawings/', 'drawings/_rels/') + '.rels'); let drels = drelsSrc || '';
      let ci = this.nextIdx('chart', 'charts');
      for (const c of await this.chartsOf(d.path)) {
        const np = `xl/charts/chart${ci++}.xml`;
        this.put(np, (await this.text(c.path)).replaceAll(`${quoteName(src)}!`, `${quoteName(newName)}!`).replaceAll(`>${src}!`, `>${quoteName(newName)}!`));
        this.addOverride(np, this.overrideType(c.path)); drels = drels.replace(c.path.replace('xl/', '../'), np.replace('xl/', '../'));
      }
      if (drelsSrc) this.put(dp.replace('drawings/', 'drawings/_rels/') + '.rels', drels);
    } else if (rels) this.put(this.relsPath(path), rels);
    const rid = 'rId' + (Math.max(0, ...[...this.wbRels.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]))) + 1);
    this.wbRels = this.wbRels.replace('</Relationships>', `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/${path}"/></Relationships>`);
    this.sheets.push({ name: newName, sheetId: Math.max(...this.sheets.map((x) => x.sheetId)) + 1, rid, path });
    return newName;
  }
  async remove(name) {
    const r = this.rec(name), d = await this.drawingOf(r.path);
    if (d) { for (const c of await this.chartsOf(d.path)) { this.zip.remove(c.path); this.dropOverride(c.path); } this.zip.remove(d.path); this.zip.remove(d.path.replace('drawings/', 'drawings/_rels/') + '.rels'); this.dropOverride(d.path); }
    this.zip.remove(r.path); this.zip.remove(this.relsPath(r.path)); this.dropOverride(r.path);
    this.wbRels = this.wbRels.replace(new RegExp(`<Relationship\\b[^>]*Id="${r.rid}"[^>]*/>`), '');
    this.sheets = this.sheets.filter((x) => x !== r); this.models.delete(name);
  }
  // Buang grafik yang jangkarnya (baris 0-based) tidak lolos keep(row0).
  async pruneAnchors(name, keep) {
    const r = this.rec(name), d = await this.drawingOf(r.path); if (!d) return;
    let xml = await this.text(d.path), drels = await this.text(d.path.replace('drawings/', 'drawings/_rels/') + '.rels');
    xml = xml.replace(/<xdr:(oneCellAnchor|twoCellAnchor|absoluteAnchor)\b[\s\S]*?<\/xdr:\1>/g, (blk) => {
      const row = Number(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/.exec(blk)?.[1]); if (keep(row)) return blk;
      const rid = /<c:chart\b[^>]*r:id="([^"]+)"/.exec(blk)?.[1];
      if (rid) { const m = new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*/>`).exec(drels); if (m) { const t = 'xl/' + attrsOf(m[0]).Target.replace(/^\.\.\//, ''); this.zip.remove(t); this.dropOverride(t); drels = drels.replace(m[0], ''); } }
      return '';
    });
    this.put(d.path, xml); this.put(d.path.replace('drawings/', 'drawings/_rels/') + '.rels', drels);
  }

  async toBuffer(order) {
    for (const [name, m] of this.models) this.put(this.rec(name).path, m.toXml());
    if (order) this.sheets.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
    let wb = this.wb.replace(/<sheets>[\s\S]*?<\/sheets>/, `<sheets>${this.sheets.map((s) => `<sheet state="visible" name="${esc(s.name)}" sheetId="${s.sheetId}" r:id="${s.rid}"/>`).join('')}</sheets>`);
    wb = wb.replace(/<calcPr[^>]*\/>/, '<calcPr fullCalcOnLoad="1"/>');
    this.put('xl/workbook.xml', wb); this.put('xl/_rels/workbook.xml.rels', this.wbRels); this.put('[Content_Types].xml', this.ct);
    return Buffer.from(await this.zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  }
}
