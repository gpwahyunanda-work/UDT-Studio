// F15: uji ujung-ke-ujung DOM nyata di Chrome agen (CDP 9222): ubah API lewat dialog Record -> "API belum pasti" hilang di Compiler; konflik 409 di dialog; hapus lunak + pulihkan lewat tombol.
// Pakai: F15_PW=... node scripts/f15_e2e.mjs --base http://127.0.0.1:8795 --email penulis.dev@uji.test --out DIR   (menulis ke basis data DEV; bukan produksi)
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openTab, login } from './f14_visual.mjs';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base'), out = arg('out', '.'); mkdirSync(out, { recursive: true });
const sid = await login(base, arg('email'), process.env.F15_PW);
const tab = await openTab(); await tab.send('Page.enable'); await tab.send('Network.enable');
await tab.send('Network.setCookie', { name: 'udt_session', value: sid, url: base, httpOnly: true });
await tab.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 800, deviceScaleFactor: 1, mobile: false });
const shot = async (n) => { const s = await tab.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(out, `e2e_${n}.png`), Buffer.from(s.data, 'base64')); };
const log = []; const ok = (name, cond, extra) => { log.push({ name, ok: !!cond, extra }); console.log((cond ? 'LULUS ' : 'GAGAL ') + name + (extra ? ' :: ' + extra : '')); };
const fill = (id, v) => tab.ev(`(() => { const e = document.getElementById('${id}'); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const clickBtn = (scope, text) => tab.ev(`(() => { const b = [...document.querySelectorAll('${scope} button')].find((x) => x.textContent.trim() === ${JSON.stringify(text)}); if (!b) return false; b.click(); return true; })()`);
const fresh = async (path, ms = 1500) => { await tab.goto('about:blank', 'true'); await tab.goto(base + path); await tab.sleep(ms); };

// 1. Compiler sebelum: Vastrol "API belum pasti"
await fresh('/compiler#dashboard');
const pid = await tab.ev(`fetch('/api/products').then((r) => r.json()).then((j) => j.products.find((p) => /Vastrol/.test(p.name)).id)`);
await fresh('/compiler?p=' + pid + '#dashboard', 2200);
const before = await tab.ev(`document.getElementById('dashApi').textContent`);
ok('Compiler sebelum: API belum pasti tampil', /belum pasti/.test(before), before);
// 2. Record: ubah api lewat dialog
await fresh('/record#t=compile&q=Vastrol');
ok('Record: baris Vastrol tampil', (await tab.ev(`document.querySelectorAll('#recMain tbody tr').length`)) === 1);
await clickBtn('#recMain tbody', 'Ubah'); await tab.sleep(300);
ok('Dialog Ubah terbuka', await tab.ev(`document.getElementById('recDlg').open`));
await fill('rf-api', 'Rosuvastatin Calcium');
await clickBtn('#recForm', 'Simpan'); await tab.sleep(500);
ok('Tanpa nama analis: ditolak di dialog (belum dikirim)', /Nama analis wajib/.test(await tab.ev(`document.getElementById('recErr').textContent`)) && (await tab.ev(`document.getElementById('recDlg').open`)));
await shot('1_dialog_validasi');
await fill('recAna', 'Siti Nurhaliza'); await clickBtn('#recForm', 'Simpan'); await tab.sleep(400);
ok('Tanpa alasan: ditolak', /Alasan perubahan wajib/.test(await tab.ev(`document.getElementById('recErr').textContent`)));
await fill('recWhy', 'Jawaban tim A-24: zat aktif Vastrol = Rosuvastatin Calcium'); await clickBtn('#recForm', 'Simpan'); await tab.sleep(1200);
const stat = await tab.ev(`document.getElementById('recStatus').textContent`);
ok('Dialog tertutup, status Tersimpan', !(await tab.ev(`document.getElementById('recDlg').open`)) && /Tersimpan/.test(stat), stat);
const apiCell = await tab.ev(`[...document.querySelectorAll('#recMain tbody tr:first-child td')].map((t) => t.textContent.trim()).join(' | ')`);
ok('Baris menampilkan API baru dan api_uncertain Tidak', /Rosuvastatin Calcium/.test(apiCell) && /Tidak/.test(apiCell), apiCell);
await shot('2_sesudah_simpan');
// 3. Compiler sesudah
await fresh('/compiler?p=' + pid + '#dashboard', 2200);
const after = await tab.ev(`document.getElementById('dashApi').textContent`);
const finds = await tab.ev(`document.body.innerText.includes('Zat aktif belum pasti')`);
ok('Compiler sesudah: "API belum pasti" hilang, API baru tampil', !/belum pasti/.test(after) && /Rosuvastatin/.test(after) && !finds, after);
await shot('3_compiler_sesudah');
// 4. Konflik 409 di dialog
await fresh('/record#t=compile&q=Vastrol');
await clickBtn('#recMain tbody', 'Ubah'); await tab.sleep(300);
const cur = await tab.ev(`fetch('/api/record/tables/compile?q=Vastrol').then((r) => r.json()).then((j) => ({ t: j.rows[0].token, id: j.rows[0].pk.compile_id }))`);
const other = await tab.ev(`fetch('/api/record/tables/compile/rows/${cur.id}', { method: 'PATCH', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ analyst_name: 'Orang Lain', reason: 'ubah paralel', row_token: ${JSON.stringify(cur.t)}, changes: { project_code: 'VAS-20' } }) }).then((r) => r.status)`);
ok('Pengguna lain mengubah baris lebih dulu (200)', other === 200);
await fill('rf-title', 'Development of Vastrol 20 mg Tablet (revisi)'); await fill('recAna', 'Siti Nurhaliza'); await fill('recWhy', 'uji konflik'); await clickBtn('#recForm', 'Simpan'); await tab.sleep(900);
const errTxt = await tab.ev(`document.getElementById('recErr').textContent`);
ok('Dialog tetap terbuka dengan pesan konflik 409 dan nilai terbaru dimuat', (await tab.ev(`document.getElementById('recDlg').open`)) && /berubah sejak dibuka/.test(errTxt) && (await tab.ev(`document.getElementById('rf-project_code').value`)) === 'VAS-20', errTxt);
await shot('4_konflik_409'); await tab.ev(`document.getElementById('recCancel').click()`);
// 5. Hapus lunak dan pulihkan lewat tombol
await fresh('/record#t=run&s=run_id&d=asc');
const rid = await tab.ev(`document.querySelector('#recMain tbody tr:first-child td:nth-child(2)').textContent.trim()`);
await clickBtn('#recMain tbody tr:first-child', 'Hapus'); await tab.sleep(300);
await fill('recAna', 'Siti Nurhaliza'); await fill('recWhy', 'Salah unggah (uji E2E)'); await clickBtn('#recForm', 'Hapus (lunak)'); await tab.sleep(1200);
const st1 = await tab.ev(`document.querySelector('#recMain tbody tr:first-child .st')?.textContent`);
ok('Run ' + rid + ' bertanda Dihapus (baris tetap ada)', st1 === 'Dihapus', st1);
await shot('5_dihapus_lunak');
await clickBtn('#recMain tbody tr:first-child', 'Pulihkan'); await tab.sleep(300);
await fill('recAna', 'Siti Nurhaliza'); await fill('recWhy', 'Pulihkan (uji E2E)'); await clickBtn('#recForm', 'Pulihkan'); await tab.sleep(1200);
const st2 = await tab.ev(`document.querySelector('#recMain tbody tr:first-child .st')?.textContent`);
ok('Run dipulihkan: Terlihat', st2 === 'Terlihat', st2);
const aud = await tab.ev(`fetch('/api/runs/${rid}/audit').then((r) => r.json()).then((j) => j.events.map((e) => e.action + ':' + e.analyst + ':' + (e.reason || '')).join(' ; '))`);
ok('Jejak run memuat nama dan alasan', /run_delete:Siti Nurhaliza:Salah unggah/.test(aud) && /run_restore:Siti Nurhaliza:Pulihkan/.test(aud), aud);
// 6. Tabel hanya baca
await fresh('/record#t=run_value', 1200);
ok('run_value: tanpa tombol aksi, ada tombol Perbaiki lewat Studio/Timpa ke /studio', (await tab.ev(`document.querySelectorAll('#recMain tbody button').length`)) === 0 && (await tab.ev(`!![...document.querySelectorAll('#recMain a')].find((a) => a.textContent === 'Perbaiki lewat Studio/Timpa' && a.getAttribute('href') === '/studio')`)));
writeFileSync(join(out, 'e2e_hasil.json'), JSON.stringify(log, null, 1)); await tab.close();
process.exit(log.every((x) => x.ok) ? 0 : 1);
