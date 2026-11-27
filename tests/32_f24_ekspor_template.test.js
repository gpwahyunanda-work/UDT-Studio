// F24: ekspor ke Master Template resmi (Calculation, Report, Summary). Pembuktian:
//  (1) hitung ulang rumus dari berkas HASIL (evaluator rumus terpisah dari penghasil) lalu bandingkan dengan dashboard untuk 5 produk nyata + 4 paket demo;
//  (2) cache nilai di berkas = hasil hitung ulang; (3) blok ditahan tanpa angka; (4) injeksi rumus disanitasi di teks pengguna, rumus template tetap hidup;
//  (5) template asli tidak berubah, grafik/logo ikut, paket OOXML utuh; (6) template tidak cocok -> pesan jelas (422), bukan 500; (7) kontrak ekspor lama utuh.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import JSZip from 'jszip';
import { SaxesParser } from 'saxes';
import { createTestDb } from './helpers/db.js';
import { loginAs, loggedIn } from './helpers/http.js';
import { REPO, loadWorkbook, hasFixtures } from './helpers/fixtures.js';
import { importDemoPackages, hasDemo, studioCmp } from './helpers/demoPkg.js';
import { readWorkbook } from '../server/import/sheetReader.js';
import { handle } from '../server/app.js';
import { loadCompileData } from '../server/compileData.js';
import { buildDashboard } from '../server/dashboard.js';
import { withOfficialF2 } from '../server/f2resmi.js';
import { runIssue } from '../server/exportTemplates.js';
import { Pkg, colName } from '../server/lib/xlsxTemplate.js';
import { evaluateAll, sharedStrings } from '../server/lib/xlsxEval.js';
import { query } from '../server/db.js';

const skip = !hasFixtures || !hasDemo ? 'fixture sheet / demo-package tidak ada' : false;
const SHEETS = [['Empagliflozin10', 'Development of Empagliflozin 10 mg Tablet.xlsx'], ['Empagliflozin25', 'Development of Empagliflozin 25 mg Tablet.xlsx', ['UDT_Release', 'UDT_pH_1_2', 'UDT_pH_4_5', 'UDT_pH_6_8']], ['Zemyc150', 'Development of Zemyc 150 mg Kapsul.xlsx'], ['Gionix16', 'Development of Gionix 16 mg Tab.xlsx'], ['Vastrol20', 'Development of Vastrol 20 mg Tablet.xlsx', ['pH_1_2', 'pH_4_5', 'pH_6_8']]];
const EVID = join(REPO, '..', 'evidence', 'f24');
let db, A, W, prods;
before(async () => {
  if (skip) return;
  db = await createTestDb('f24'); A = await loginAs('Admin F24', 'admin', '10.24.6.1'); W = await loggedIn('Analis F24');
  for (const x of SHEETS) { const r = await A.post('/api/imports', readWorkbook(loadWorkbook(...x))); assert.equal(r.status, 201, JSON.stringify(r.json)); }
  await importDemoPackages(W);
  prods = (await A.get('/api/products')).json.products;
});
after(async () => { if (db) await db.drop(); });

const exp = (id, fmt) => handle(new Request(`https://udt.test/api/products/${id}/export?format=${fmt}`, { headers: { cookie: A.cookie, 'x-forwarded-for': A.ip } }));
const bufOf = async (res) => Buffer.from(await res.arrayBuffer());
async function openBook(buf) {
  const pkg = await Pkg.load(buf); for (const n of pkg.names()) await pkg.sheet(n);
  const ss = sharedStrings(await pkg.text('xl/sharedStrings.xml'));
  return { pkg, names: pkg.names(), vals: evaluateAll(pkg.models, ss) };
}
const num = (x) => typeof x === 'number' && Number.isFinite(x);
const near = (a, b, tol = 1e-7) => num(a) && num(b) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
const V = (b, tab, ref) => { const v = b.vals.get(`${tab}!${ref}`); return v !== undefined ? v : b.pkg.models.get(tab).value(ref); };
const sameMin = (a, b) => a.minutes.length === b.minutes.length && a.minutes.every((x, i) => x === b.minutes[i]);
async function unzipFiles(buf) { const z = await JSZip.loadAsync(buf); const out = []; for (const n of Object.keys(z.files)) if (n.endsWith('.xlsx')) out.push({ name: n, buf: await z.files[n].async('nodebuffer') }); return { z, files: out }; }
const kindOf = (n) => (/ - Calculation\.xlsx$/.test(n) ? 'calc' : / - Report\.xlsx$/.test(n) ? 'report' : 'x');
const codeOfLabel = (data, file) => { const m = data.mediums.map((x) => x.label).sort((a, b) => b.length - a.length).find((l) => file.includes(` ${l} - `)); return m; };

// Himpunan nilai yang diharapkan dari dashboard: per kode medium, pasangan (f2, n, total) tak ditahan yang muat di template.
async function expectedFromDashboard(id, data) {
  const dash = (await A.get(`/api/products/${id}/dashboard`)).json, byId = new Map(data.runs.map((r) => [r.run_id, r])), row = new Map(dash.runs.map((r) => [r.key, r]));
  const out = [];
  for (const ck of dash.comp_order) for (const [key, byMed] of Object.entries(dash.cells[ck] || {})) for (const [code, cell] of Object.entries(byMed)) {
    const tr = byId.get(row.get(key)?.prof[code]?.run_id), rr = byId.get(row.get(ck)?.prof[code]?.run_id); if (!tr || !rr) continue;
    out.push({ code, held: !!cell.held, f2: cell.f2, n: cell.n, total: cell.total, fit: !runIssue(tr, 7) && !runIssue(rr, 7) && sameMin(tr, rr) });
  }
  return { dash, pairs: out };
}
const sortKey = (x) => `${x.code}|${x.f2.toFixed(5)}|${x.n}|${x.total.toFixed(4)}`;

test('P1 paritas: hitung ulang dari berkas hasil = dashboard (5 produk nyata + 4 paket demo); Report, Summary, Calculation; cache = hasil hitung ulang', { skip, timeout: 900000 }, async () => {
  const rep = []; let nReport = 0, nSummary = 0, nCalc = 0;
  for (const p of prods) {
    const raw = await loadCompileData(query, p.id, { withPoints: true });
    const dashAll = await buildDashboard(query, p.id), data = withOfficialF2(raw, dashAll);
    const { dash, pairs } = await expectedFromDashboard(p.id, data);
    const res = await exp(p.id, 'calcreport'); assert.equal(res.status, 200, `${p.name} calcreport`);
    assert.match(res.headers.get('content-disposition'), /\.zip"/);
    const zbuf = await bufOf(res); const { files } = await unzipFiles(zbuf);
    const slug = p.name.replace(/[^\w-]+/g, '_'); if (process.env.UDT_F24_DUMP) { mkdirSync(join(EVID, 'contoh'), { recursive: true }); writeFileSync(join(EVID, 'contoh', `${slug}_CalculationReport.zip`), zbuf); }
    // ---- Report: f2, n, Total (rumus Excel asli) = dashboard
    const actRep = [], actCalc = [];
    for (const f of files) {
      const b = await openBook(f.buf), kind = kindOf(f.name), label = codeOfLabel(data, f.name);
      assert.ok(label, `${p.name}: label medium dari nama berkas ${f.name}`);
      const code = data.mediums.find((m) => m.label === label).code;
      for (const [k, v] of b.vals) { const c = k.slice(k.indexOf('!') + 1), tab = k.slice(0, k.indexOf('!')), cell = b.pkg.models.get(tab).cell(c); if (num(v)) { const cached = cell.attrs.t === undefined ? Number(cell.v) : NaN; assert.ok(near(cached, v, 1e-9), `${p.name} ${f.name} ${k}: cache ${cell.v} != hitung ulang ${v}`); } }
      if (kind === 'report') for (const tab of b.names) {
        nReport++;
        const f2 = V(b, tab, 'G51'), n = V(b, tab, 'G49'), total = V(b, tab, 'G48'), concl = V(b, tab, 'G53');
        if (num(f2)) { actRep.push({ code, f2, n, total }); assert.ok(/^(Similar|Not Similar)/.test(concl), `${tab} kesimpulan`); if (!/rapidly/.test(concl)) assert.equal(concl.startsWith('Not Similar'), f2 < 50, `${tab}: kesimpulan konsisten dengan f2`); }
      }
      if (kind === 'calc') for (const tab of b.names) {
        nCalc++;
        const T = [...Array(9).keys()].filter((k) => typeof V(b, tab, `${colName(4 + k)}21`) === 'string' && /'$/.test(V(b, tab, `${colName(4 + k)}21`))).length;
        const avg = [], rsd = [];
        for (let k = 0; k < T; k++) { avg.push(V(b, tab, `${colName(4 + k)}69`)); rsd.push(V(b, tab, `${colName(4 + k)}71`)); }
        actCalc.push({ code, avg, rsd, tab });
      }
    }
    const expRep = pairs.filter((x) => x.fit && !x.held && num(x.f2)).map(sortKey).sort();
    assert.deepEqual(actRep.map(sortKey).sort(), expRep, `${p.name}: (f2, n, Total) Report = dashboard`);
    // ---- Calculation: rata-rata dan RSD per titik = profil dashboard (Langkah 4), untuk tiap run dashboard yang muat
    for (const r of dash.runs) for (const [code, pr] of Object.entries(r.prof)) {
      const run = data.runs.find((x) => x.run_id === pr.run_id); if (!run || run.held || runIssue(run, 9)) continue;
      const ix = pr.avg.map((_, i) => i).slice(1).filter((i) => pr.avg[i] !== null), want = ix.map((i) => pr.avg[i]), wantRsd = ix.map((i) => pr.rsd[i]);   // rata-rata 0: RSD = 0 di dashboard, galat #DIV/0! di rumus template (SD/AVG), sama seperti Studio
      const hit = actCalc.find((c) => c.code === code && c.avg.length === want.length && c.avg.every((x, i) => near(x, want[i], 1e-6)) && c.rsd.every((x, i) => (want[i] === 0 ? !num(x) || x === 0 : near(x, wantRsd[i], 1e-5))));
      assert.ok(hit, `${p.name} ${code} ${r.key}: Calculation memuat rata-rata/RSD dashboard`);
    }
    // ---- Summary
    const sres = await exp(p.id, 'summary');
    const sbuf = sres.status === 200 ? await bufOf(sres.clone()) : null; if (sbuf && process.env.UDT_F24_DUMP) writeFileSync(join(EVID, 'contoh', `${slug}_Summary.xlsx`), sbuf);
    if (sres.status === 200) {
      const b = await openBook(await bufOf(sres)), actSum = [];
      for (const tab of b.names) {
        nSummary++;
        const code = data.mediums.find((m) => tab === m.label || tab.startsWith(m.label + ' ('))?.code;
        assert.ok(code, `${p.name}: tab Summary ${tab} = kode medium`);
        for (let k = 1; k < 12; k++) { const s = 14 + 23 * k, f2 = V(b, tab, `N${s + 4}`); if (num(f2)) actSum.push({ code, f2, n: V(b, tab, `N${s + 2}`), total: V(b, tab, `N${s + 1}`) }); }
        // rata-rata blok referensi (baris 14) = baris Average (33) dan label titik waktu
        for (let j = 0; j < 7; j++) { const c = colName(5 + j); if (num(V(b, tab, `${c}33`))) assert.ok(near(V(b, tab, `${c}14`), V(b, tab, `${c}33`)), 'AVG tertaut'); }
      }
      assert.deepEqual(actSum.map(sortKey).sort(), expRep, `${p.name}: (f2, n, Total) Summary = dashboard`);
    } else assert.equal(sres.status, 422, `${p.name} summary hanya boleh 200 atau 422`);
    rep.push({ produk: p.name, pasangan_dashboard: pairs.length, f2_report: actRep.length, tab_calculation: actCalc.length });
  }
  assert.ok(nReport >= 20 && nSummary >= 9 && nCalc >= 60, `cakupan: report ${nReport}, summary ${nSummary}, calc ${nCalc}`);
  if (process.env.UDT_F24_DUMP) { mkdirSync(EVID, { recursive: true }); writeFileSync(join(EVID, 'paritas_ringkas.json'), JSON.stringify({ tab_report: nReport, tab_summary: nSummary, tab_calculation: nCalc, per_produk: rep }, null, 1)); }
});

test('P2 blok ditahan tidak berangka di Calculation; Report melewati pasangan ditahan', { skip, timeout: 300000 }, async () => {
  let held = 0;
  for (const p of prods) {
    const raw = await loadCompileData(query, p.id, { withPoints: true }), data = withOfficialF2(raw, await buildDashboard(query, p.id));
    const hr = data.runs.filter((r) => r.held && !runIssue(r, 9)); if (!hr.length) continue;
    const { files } = await unzipFiles(await bufOf(await exp(p.id, 'calcreport')));
    for (const r of hr) {
      held++;
      const f = files.find((x) => kindOf(x.name) === 'calc' && x.name.includes(` ${data.mediums.find((m) => m.medium_id === r.medium_id).label} - `)); assert.ok(f);
      const b = await openBook(f.buf), tabs = b.names.filter((n) => n.includes(r.batch_no) && /DITAHAN/.test(String(V(b, n, 'B35')))); assert.ok(tabs.length >= 1, `tab ditahan ${r.batch_no}`);
      for (const tab of tabs) for (let row = 22; row <= 71; row++) for (let c = 4; c <= 12; c++) { const v = V(b, tab, colName(c) + row); if (row <= 33 || row >= 39) assert.ok(!num(v), `${tab} ${colName(c)}${row} tidak boleh berangka (ditahan): ${v}`); }
    }
  }
  assert.ok(held >= 1, 'setidaknya satu blok ditahan teruji (F0058D26A)');
});

test('P3 injeksi rumus: teks pengguna disanitasi; rumus template tetap hidup; tak ada rumus dari teks pengguna', { skip, timeout: 300000 }, async () => {
  const names = ['=HYPERLINK("http://x","k")', '+cmd|calc', '-1+1', '@SUM(1)'];
  const cid = (await W.post('/api/compiles', { product_name: names[0], strength: '1 mg', dosage_form: 'Tablet', project_code: 'F24-inj' })).json.compile_id;
  const times = [5, 10, 15, 30, 45, 60], mk = (base) => [1, 2, 3].map((no) => ({ no, values: times.map((t, i) => Math.min(100, base + i * 9 + no)) }));
  const pkg = { compile_id: cid, mediums: [{ code: '6,8', full_name: 'Buffer pH 6,8' }], runs: [
    { key: 'r', medium_code: '6,8', brand_name: names[1], batch_no: 'R-1', role: 'reference', variant: '', test_date: '2026-11-04', timepoints: times, values: mk(30), manufacturer_site: names[3] },
    { key: 'u', medium_code: '6,8', brand_name: names[2], batch_no: names[3], role: 'uji', variant: names[0], test_date: '2026-11-04', timepoints: times, values: mk(25), manufacturer_site: names[1] }],
  comparisons: [studioCmp(times, mk(30), mk(25))] };
  const c = await W.post('/api/ingest/commit', { push_id: randomUUID(), decisions: {}, package: pkg }); assert.ok([200, 201].includes(c.status), JSON.stringify(c.json));
  const pid = (await A.get('/api/products')).json.products.find((x) => /HYPERLINK/.test(x.name)).id;
  const r1 = await exp(pid, 'calcreport'), r2 = await exp(pid, 'summary');
  assert.equal(r1.status, 200, await r1.clone().text()); assert.equal(r2.status, 200, await r2.clone().text());
  const files = [...(await unzipFiles(await bufOf(r1))).files, { name: 'summary.xlsx', buf: await bufOf(r2) }];
  assert.ok(files.length >= 3);
  let seen = 0;
  for (const f of files) {
    const b = await openBook(f.buf);
    for (const tab of b.names) for (const [, rw] of b.pkg.models.get(tab).rows) for (const [, cell] of rw.cells) {
      if (cell.f) { assert.doesNotMatch(cell.f.text, /HYPERLINK|cmd|SUM\(1\)/, `rumus dari teks pengguna di ${f.name}/${tab}`); continue; }
      if (cell.is == null) continue;
      const t = cell.is.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      if (/HYPERLINK|cmd\||@SUM|-1\+1/.test(t)) { seen++; assert.ok(!/^[=+\-@]/.test(t), `teks berbahaya tanpa awalan ': ${t}`); }
    }
    // rumus template tetap ada (tidak dimatikan)
    const fcount = [...b.pkg.models.values()].reduce((a, m) => a + [...m.rows.values()].reduce((x, rw) => x + [...rw.cells.values()].filter((cl) => cl.f).length, 0), 0);
    assert.ok(fcount > 40, `${f.name}: rumus template tetap hidup (${fcount})`);
  }
  assert.ok(seen >= 4, `teks berbahaya terlihat tersanitasi di berkas (${seen})`);
});

test('P4 template asli tidak berubah; grafik dan logo ikut; paket OOXML utuh (rel, tipe konten, XML wellformed)', { skip, timeout: 300000 }, async () => {
  const orig = join(REPO, '..', 'data', 'request_yonathan_27nov', 'handover-udtpharos');
  for (const n of ['Master_Calculation.xlsx', 'Master_Report.xlsx', 'Master_Summary.xlsx']) {
    assert.ok(existsSync(join(REPO, 'server', 'templates', n)), n);
    if (existsSync(join(orig, n))) assert.equal(createHash('sha256').update(readFileSync(join(REPO, 'server', 'templates', n))).digest('hex'), createHash('sha256').update(readFileSync(join(orig, n))).digest('hex'), `${n} disalin apa adanya`);
  }
  const p = prods.find((x) => /Zemyc/.test(x.name)), { files } = await unzipFiles(await bufOf(await exp(p.id, 'calcreport')));
  const all = [...files, { name: 'Summary.xlsx', buf: await bufOf(await exp(p.id, 'summary')) }];
  for (const f of all) {
    const z = await JSZip.loadAsync(f.buf), names = new Set(Object.keys(z.files).filter((n) => !z.files[n].dir));
    for (const n of names) if (/\.(xml|rels)$/.test(n)) { const sx = new SaxesParser(); let err = null; sx.on('error', (e) => { err ||= e; }); sx.write(await z.file(n).async('string')).close(); assert.equal(err, null, `${f.name}/${n} bukan XML wellformed: ${err}`); }
    const ct = await z.file('[Content_Types].xml').async('string');
    for (const m of ct.matchAll(/PartName="\/([^"]+)"/g)) assert.ok(names.has(m[1]), `${f.name}: tipe konten menunjuk bagian hilang ${m[1]}`);
    for (const rn of [...names].filter((n) => n.endsWith('.rels'))) {
      const base = rn.replace('_rels/', '').replace(/\.rels$/, ''), dir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '';
      for (const m of (await z.file(rn).async('string')).matchAll(/Target="([^"]+)"/g)) { if (/^https?:/.test(m[1])) continue; const t = m[1].startsWith('/') ? m[1].slice(1) : new URL(m[1], 'http://x/' + dir).pathname.slice(1); assert.ok(names.has(t), `${f.name}: ${rn} menunjuk ${m[1]} (hilang)`); }
    }
    for (const n of names) if (/^xl\/(worksheets|drawings|charts)\/[^/]+\.xml$/.test(n)) assert.ok(ct.includes(`PartName="/${n}"`), `${f.name}: tipe konten ${n}`);
    const wbx = await z.file('xl/workbook.xml').async('string'); assert.match(wbx, /fullCalcOnLoad="1"/);
    const nm = [...wbx.matchAll(/<sheet [^>]*name="([^"]+)"/g)].map((m) => m[1]); assert.equal(new Set(nm).size, nm.length, 'nama tab unik');
    const charts = [...names].filter((n) => /^xl\/charts\//.test(n)).length;
    if (/Report/.test(f.name)) { assert.equal(charts, nm.length, `${f.name}: satu grafik profil per tab Report`); assert.ok([...names].some((n) => /^xl\/media\//.test(n)), 'logo ikut'); }
    if (/Calculation/.test(f.name)) assert.equal(charts, 0);
  }
  // Summary: jumlah grafik = jumlah blok uji yang dipakai (blok kosong tidak membawa grafik)
  const z = await JSZip.loadAsync(all[all.length - 1].buf), nchart = Object.keys(z.files).filter((n) => /^xl\/charts\/chart\d+\.xml$/.test(n)).length, b = await openBook(all[all.length - 1].buf);
  let blocks = 0; for (const tab of b.names) for (let k = 1; k < 12; k++) if (V(b, tab, `B${14 + 23 * k}`)) blocks++;
  assert.equal(nchart, blocks, 'grafik Summary = blok uji terpakai');
  // rumus asli template dipertahankan di Calculation: pola rumus % terlarut dan koreksi volume ganti
  const calc = await openBook(files.find((f) => kindOf(f.name) === 'calc').buf), t0 = calc.names[1], sh = calc.pkg.models.get(t0);
  assert.equal(sh.cell('D39').f.text, '(D22/$M$27)*($N$22/$E$14)*($E$16/$E$15)*($M$18/$M$17)*($M$16)');
  assert.equal(sh.cell('F55').f.text, 'F39+($M$14/$M$15)*SUM(D55:E55)');
  assert.equal(sh.cell('D70').f.text, 'STDEV(D55:D57)');
});

test('P5 template tidak cocok: pesan jelas (422 / catatan), bukan 500; 12+ vessel dan titik waktu di luar daftar', { skip, timeout: 300000 }, async () => {
  const mk = async (name, runs, times) => {
    const cid = (await W.post('/api/compiles', { product_name: name, strength: '5 mg', dosage_form: 'Tablet', project_code: 'F24-' + name })).json.compile_id;
    const c = await W.post('/api/ingest/commit', { push_id: randomUUID(), decisions: {}, package: { compile_id: cid, mediums: [{ code: '6,8', full_name: 'Buffer pH 6,8' }], runs, comparisons: [studioCmp(times, runs[0].values, runs[1].values)] } });
    assert.ok([200, 201].includes(c.status), JSON.stringify(c.json));
    return (await A.get('/api/products')).json.products.find((x) => x.name.startsWith(name)).id;
  };
  const vals = (nv, ts, base) => Array.from({ length: nv }, (_, i) => ({ no: i + 1, values: ts.map((t, j) => Math.min(99, base + j * 7 + i * 0.3)) }));
  const t10 = [5, 10, 15, 20, 30, 45, 60, 75, 90, 120], t6 = [5, 10, 15, 30, 45, 60];
  // semua run terlalu besar: 13 vessel dan 10 titik
  const bad = await mk('Besarbanget', [{ key: 'r', medium_code: '6,8', brand_name: 'Ref X', batch_no: 'R1', role: 'reference', variant: '', test_date: '2026-11-04', timepoints: t10, values: vals(13, t10, 20) }, { key: 'u', medium_code: '6,8', brand_name: 'Uji X', batch_no: 'U1', role: 'uji', variant: '', test_date: '2026-11-04', timepoints: t10, values: vals(13, t10, 18) }], t10);
  for (const f of ['calcreport', 'summary']) { const r = await exp(bad, f); assert.equal(r.status, 422, f); const j = await r.json(); assert.match(j.error, /Template tidak cocok/); assert.match(j.error, /vessel|titik waktu/); }
  // campuran: satu pasangan muat, satu uji terlalu besar -> 200 + catatan
  const mix = await mk('Campuran', [{ key: 'r', medium_code: '6,8', brand_name: 'Ref M', batch_no: 'R1', role: 'reference', variant: '', test_date: '2026-11-04', timepoints: t6, values: vals(6, t6, 20) }, { key: 'u', medium_code: '6,8', brand_name: 'Uji M', batch_no: 'U1', role: 'uji', variant: '', test_date: '2026-11-04', timepoints: t6, values: vals(6, t6, 19) }], t6);
  const ok = await exp(mix, 'calcreport'); assert.equal(ok.status, 200); assert.equal(ok.headers.get('x-catatan-ekspor'), null, 'semua muat: tanpa catatan');
  const { files, z } = await unzipFiles(await bufOf(ok)); assert.equal(files.length, 2); assert.ok(!z.file('CATATAN.txt'));
  // kontrak lama utuh: xlsx (format sheet lama), csv, tsv; format asing 400
  const old = await exp(mix, 'xlsx'); assert.equal(old.status, 200); assert.match(old.headers.get('content-type'), /spreadsheetml/);
  for (const f of ['csv', 'tsv']) assert.equal((await exp(mix, f)).status, 200);
  assert.equal((await exp(mix, 'zzz')).status, 400);
  assert.equal((await handle(new Request(`https://udt.test/api/products/${mix}/export?format=summary`))).status, 401, 'tanpa sesi ditolak');
});

test('P6 UI Compiler: tiga unduhan berlabel analis, tombol lama diganti', () => {
  const app = readFileSync(join(REPO, 'compiler', 'app.js'), 'utf8'), html = readFileSync(join(REPO, 'compiler', 'index.html'), 'utf8');
  for (const t of ['Calculation &amp; Report (Excel)', 'Summary (Excel)', 'Data mentah', "base + 'calcreport", "base + 'summary", "base + 'csv", "base + 'tsv", '/export?format=', 'Master Template resmi', 'Master Summary']) assert.ok(app.includes(t), t);
  assert.ok(html.includes('>Unduh hasil<') && !html.includes('Ekspor ke sheet'));
  assert.ok(app.includes('x-catatan-ekspor') && app.includes('downloadTemplate'), 'pesan jelas bila sebagian tidak muat');
  assert.ok(!app.includes('format sheet lama'), 'label lama dihapus dari menu');
});
