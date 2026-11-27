// F22: uji ujung-ke-ujung di Chrome agen (CDP 9222) terhadap scripts/f22_serve.mjs (CSP penuh, stub API).
// Pakai: node scripts/f22_serve.mjs 19222   lalu   node scripts/f22_e2e.mjs --base http://127.0.0.1:19222 --out evidence/f22
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { openTab } from './f14_visual.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base', 'http://127.0.0.1:19222'), out = resolve(arg('out', 'evidence/f22')); mkdirSync(out, { recursive: true });
const PDF = resolve('sample-data/pdf');
const tab = await openTab();
const cons = [], dialogs = [];
await tab.send('Page.enable'); await tab.send('Runtime.enable'); await tab.send('Log.enable'); await tab.send('DOM.enable');
await tab.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
const log = []; const ok = (n, c, x) => { log.push({ n, ok: !!c, x }); console.log((c ? 'LULUS ' : 'GAGAL ') + n + (x ? ' :: ' + x : '')); };
const shot = async (n) => { const s = await tab.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(out, `f22_${n}.png`), Buffer.from(s.data, 'base64')); };
const drain = () => { for (const e of tab.events.splice(0)) {
  if (e.method === 'Log.entryAdded') cons.push(`[${e.params.entry.level}] ${e.params.entry.source}: ${e.params.entry.text} ${e.params.entry.url || ''}`);
  if (e.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(e.params.type)) cons.push(`[console.${e.params.type}] ` + e.params.args.map((a) => a.value ?? a.description).join(' '));
  if (e.method === 'Runtime.exceptionThrown') cons.push('[exception] ' + JSON.stringify(e.params.exceptionDetails).slice(0, 300));
  if (e.method === 'Page.javascriptDialogOpening') dialogs.push(e.params);
} };
const uploadTo = async (sel, files) => { const { root } = await tab.send('DOM.getDocument'); const { nodeId } = await tab.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel }); await tab.send('DOM.setFileInputFiles', { files, nodeId }); };
const click = async (x, y) => { for (const type of ['mousePressed', 'mouseReleased']) await tab.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };

await tab.goto(base + '/studio-app'); await tab.sleep(1500); drain();
const libs = await tab.ev(`JSON.stringify({pdfjs: typeof pdfjsLib, jspdf: typeof (window.jspdf && window.jspdf.jsPDF), autotable: typeof (window.jspdf && window.jspdf.jsPDF.API.autoTable)})`);
ok('Pustaka lokal termuat dengan CSP penuh', /"pdfjs":"object"/.test(libs) && /"jspdf":"function"/.test(libs) && /"autotable":"function"/.test(libs), libs);
const res = await tab.ev(`JSON.stringify(performance.getEntriesByType('resource').map(r => r.name).filter(n => /vendor|cdnjs|google/.test(n)))`);
ok('Tak ada permintaan ke host luar; /vendor/ dari asal sendiri', !/cdnjs|google/.test(res) && /vendor\/pdf\.min/.test(res), res);

// 3. gerbang: tanpa data, buka Langkah 2 dan 5 ditolak
await tab.ev(`window.__udt.go(2)`); await tab.sleep(200);
let st = JSON.parse(await tab.ev(`JSON.stringify({step: window.__udt.S.step, gate: document.getElementById('f22Gate').textContent, vis: !document.getElementById('f22Gate').hidden})`));
ok('Lanjut ke Verifikasi ditolak tanpa data, alasan tampil', st.step === 1 && st.vis && /Langkah 1 belum selesai/.test(st.gate), st.gate);
await shot('01_gerbang_tanpa_data');
await tab.ev(`document.querySelectorAll('#steps button')[4].click()`); await tab.sleep(200);
ok('Tab Langkah 5 tidak terbuka tanpa data', (await tab.ev(`window.__udt.S.step`)) === 1);
const doneTabs0 = await tab.ev(`document.querySelectorAll('#steps button.done').length`);
ok('Tidak ada centang selesai', doneTabs0 === 0);

// 4. unggah PDF kromatogram nyata (readPdf + pdf.worker dari /vendor/)
const test = ['1.2', '4.5', '6.8', 'Air'].map((m) => join(PDF, `Empagliflozin_Test_pH_${m}.pdf`));
const ref = ['1.2', '4.5', '6.8', 'Air'].map((m) => join(PDF, `Jardiance_Ref_pH_${m}.pdf`));
await uploadTo('#fiTest', test); await uploadTo('#fiRef', ref);
for (let i = 0; i < 60; i++) { await tab.sleep(500); const n = await tab.ev(`(window.__udt.S.testFiles.length) + (window.__udt.S.refFiles.length)`); if (n >= 8) break; }
await tab.sleep(1500); drain();
const rd = JSON.parse(await tab.ev(`JSON.stringify({files: window.__udt.S.testFiles.length + window.__udt.S.refFiles.length, media: window.__udt.S.model ? Object.keys(window.__udt.S.model.media) : [], inj: window.__udt.S.testFiles.map(f => (f.rows || f.injections || []).length)})`));
ok('PDF kromatogram terbaca (8 berkas, medium terbentuk)', rd.files === 8 && rd.media.length > 0, JSON.stringify(rd));
await shot('02_pdf_terbaca');

// 5. alur Langkah 1..5 dengan gerbang
const stepTry = async (n) => { await tab.ev(`window.__udt.go(${n})`); await tab.sleep(400); return JSON.parse(await tab.ev(`JSON.stringify({step: window.__udt.S.step, gate: document.getElementById('f22Gate').hidden ? '' : document.getElementById('f22Gate').textContent})`)); };
let r2 = await stepTry(2); ok('Langkah 2 terbuka setelah data terbaca', r2.step === 2, JSON.stringify(r2));
await shot('03_langkah2');
const r3 = await stepTry(3); ok('Langkah 3: ' + (r3.step === 3 ? 'terbuka (Langkah 2 valid)' : 'ditolak dengan alasan'), true, JSON.stringify(r3));
await shot('04_langkah3_atau_ditolak');
ok('Langkah 4 ditolak selama parameter Langkah 3 kosong, dengan alasan', (await stepTry(4)).step === 3 && /Langkah 3 belum valid/.test((await stepTry(4)).gate), JSON.stringify(await stepTry(4)));
await shot('04b_langkah4_ditolak_parameter_kosong');
const r5 = await stepTry(5); ok('Lompat langsung ke Langkah 5 ditolak', r5.step === 3, JSON.stringify(r5));
await tab.ev(`(() => { const U = window.__udt.S; for (const P of [U.testParams, U.refParams]) Object.assign(P, { lc: 25, dilStd: 100, dilSample: 1, volMedia: 900, volRep: 0, pctWS: 99.5, wsDefault: 25, product: P === U.testParams ? 'Empagliflozin 25 mg Tablet' : 'Jardiance 25 mg Tablet' }); window.__udt.rebuild(); })()`);
await tab.sleep(500);
const r4 = await stepTry(4); ok('Langkah 4 terbuka setelah parameter lengkap', r4.step === 4, JSON.stringify(r4));
await shot('04c_langkah4_hasil');
const doneNow = await tab.ev(`[...document.querySelectorAll('#steps button')].map(b => b.className.trim())`); writeFileSync(join(out, 'f22_alur_langkah.json'), JSON.stringify({ r2, r3, r4, r5, doneTabs0, tabsPadaLangkah4: doneNow }, null, 1));

// 6. Cetak PDF A4 dengan CSP penuh (tangkap hasil jsPDF.save)
const pdfRes = await tab.ev(`(async () => {
  const P = window.jspdf.jsPDF.API, orig = P.save; let got = null;
  P.save = function (name) { const ab = this.output('arraybuffer'); got = { name, bytes: ab.byteLength, head: String.fromCharCode(...new Uint8Array(ab).slice(0, 5)), pages: this.getNumberOfPages(), fmt: this.internal.pageSize.getWidth() + 'x' + this.internal.pageSize.getHeight() }; };
  const al = window.alert; let alerted = null; window.alert = (m) => { alerted = m; };
  try { await exportPDF(); } catch (e) { got = { error: String(e) }; }
  P.save = orig; window.alert = al; return JSON.stringify({ got, alerted });
})()`);
console.log('PDF A4:', pdfRes, 'ERR:', await tab.ev(`String(window.__pdfError || '').slice(0, 600)`)); writeFileSync(join(out, 'f22_cetak_pdf.json'), pdfRes);
const pj = JSON.parse(pdfRes);
ok('Cetak PDF A4: %PDF, 210x297 mm', pj.got && pj.got.head === '%PDF-' && /^210\.?\d*x297/.test(pj.got.fmt), JSON.stringify(pj));

// 7. Langkah 5: panel Sheets tersembunyi, kartu Kirim tampil, indikator belum dikirim
const r5b = await stepTry(5); ok('Langkah 5 terbuka setelah Langkah 1-4 valid; Langkah 1-4 bercentang', r5b.step === 5 && (await tab.ev(`document.querySelectorAll('#steps button.done').length`)) === 4, JSON.stringify(r5b)); await tab.sleep(2800); drain();
const l5 = JSON.parse(await tab.ev(`JSON.stringify({
  hiddenCards: [...document.querySelectorAll('#p5 > .card:not(#udtSendCard), #p5 > .section-header')].map(e => getComputedStyle(e).display),
  testBtnVisible: !!document.getElementById('testBtn').offsetParent, calcVisible: !!document.getElementById('calcBtn').offsetParent,
  sendCardVisible: !!document.getElementById('udtSendCard').offsetParent, note: document.getElementById('udtSendCard').innerText,
  unsent: !document.getElementById('f22Unsent').hidden })`));
ok('Panel Google Sheets + Uji Koneksi disembunyikan', l5.hiddenCards.length >= 4 && l5.hiddenCards.every((d) => d === 'none') && !l5.testBtnVisible && !l5.calcVisible, JSON.stringify(l5.hiddenCards));
ok('Kartu Kirim ke Compiler tampil dengan petunjuk analis', l5.sendCardVisible && /Hasil dikirim ke Compiler\. Unduh Excel\/CSV dari Compiler\./.test(l5.note) && /Kirim ke Compiler/.test(l5.note));
ok('Indikator "Belum dikirim ke Compiler" tampil', l5.unsent);
await shot('05_langkah5_sheets_tersembunyi_belum_dikirim');

// Kirim ke Compiler (stub API): indikator hilang setelah kirim sukses, muncul lagi setelah ada perubahan
await tab.ev(`document.getElementById('udtSendBtn').click()`); await tab.sleep(1500);
const dlg = await tab.ev(`document.querySelector('.udtx-dlg') ? document.querySelector('.udtx-dlg').innerText.slice(0, 300) : 'tanpa dialog'`);
ok('Dialog Kirim ke Compiler terbuka dengan ringkasan run', /Ringkasan data yang akan dikirim/.test(dlg), dlg.replace(/\s+/g, ' ').slice(0, 160));
await tab.ev(`(() => { const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }; set('udtx-n', 'Empagliflozin'); set('udtx-s', '25 mg'); set('udtx-f', 'Tablet'); set('udtx-ana', 'Analis Uji F22'); })()`); await tab.sleep(400);
await shot('06_dialog_kirim');
await tab.ev(`[...document.querySelectorAll('.udtx-dlg button.p')].find(b => b.textContent.trim() === 'Kirim ke Compiler').click()`); await tab.sleep(2500);
const sent = await tab.ev(`document.querySelector('.udtx-dlg [role=status]').textContent`);
ok('Kirim berhasil (stub)', /Terkirim/.test(sent), sent);
await tab.ev(`document.querySelector('.udtx-back').remove()`); await tab.sleep(2600); drain();
ok('Indikator hilang setelah kirim sukses', await tab.ev(`document.getElementById('f22Unsent').hidden`));
await shot('07_setelah_kirim_indikator_hilang');
await tab.ev(`(() => { window.__udt.S.testParams.runDate = '2026-01-02'; })()`); await tab.sleep(2600);
ok('Indikator muncul lagi setelah ada perubahan sejak kirim terakhir', await tab.ev(`!document.getElementById('f22Unsent').hidden`));
await shot('08_perubahan_setelah_kirim');
// 8. beforeunload saat ada data belum terkirim (perlu interaksi pengguna nyata)
await click(600, 400);
const navP = tab.send('Page.reload').catch(() => null); await tab.sleep(1200); drain();
const bu = dialogs.find((d) => d.type === 'beforeunload');
ok('Dialog beforeunload muncul saat refresh dengan data belum terkirim', !!bu, bu ? bu.message : 'tidak muncul');
if (bu) await tab.send('Page.handleJavaScriptDialog', { accept: false });
await navP; await tab.sleep(500);

// -- akhir bagian 1
drain();
const csp = cons.filter((c) => /Content Security Policy|CSP|violat|Refused to/i.test(c));
ok('Konsol bersih dari pelanggaran CSP', csp.length === 0, csp.join(' | ').slice(0, 300));
writeFileSync(join(out, 'f22_konsol.txt'), cons.join('\n') || '(konsol kosong: tanpa error/peringatan)');
writeFileSync(join(out, 'f22_e2e_hasil.json'), JSON.stringify(log, null, 1));
await tab.close();
process.exit(log.some((l) => !l.ok) ? 1 : 0);
