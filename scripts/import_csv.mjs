// Skrip impor lokal (DS-09): baca fixture CSV per tab, kirim ke POST /api/imports, cetak laporan pencocokan.
// Pemakaian: UDT_PASSWORD=... node scripts/import_csv.mjs <baseUrl> "<Analis>" <prefixCSV> "<Development of ... .xlsx>" [dirCSV]
// Contoh:    node scripts/import_csv.mjs http://127.0.0.1:8787 Wahyu Zemyc150 "Development of Zemyc 150 mg Kapsul.xlsx"
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCSV, readWorkbook } from '../server/import/sheetReader.js';
import { CSV_DIR } from '../tests/helpers/fixtures.js';

const [base, analyst, prefix, fileName, dir = CSV_DIR] = process.argv.slice(2);
if (!base || !analyst || !prefix || !fileName || !process.env.UDT_PASSWORD) { console.error('Argumen: <baseUrl> <analis> <prefixCSV> <namaBerkas.xlsx> [dirCSV]; env UDT_PASSWORD wajib'); process.exit(2); }
const tabs = [['Release', 'Release'], ['pH_1_2', 'pH 1,2'], ['pH_4_5', 'pH 4,5'], ['pH_6_8', 'pH 6,8']].map(([f, name]) => ({
  name, values: parseCSV(readFileSync(join(dir, `${prefix}__${f}__nilai.csv`), 'utf8')), formulas: parseCSV(readFileSync(join(dir, `${prefix}__${f}__rumus.csv`), 'utf8')),
}));
const pkg = readWorkbook({ fileName, tabs });
let cookie = '';
const call = async (method, path, body) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', origin: base, cookie }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.getSetCookie?.()[0]; if (sc) cookie = sc.split(';')[0];
  return { status: r.status, json: await r.json() };
};
let r = await call('POST', '/api/auth/login', { password: process.env.UDT_PASSWORD }); if (r.status !== 200) throw new Error('login gagal');
r = await call('PUT', '/api/me/analyst', { name: analyst }); if (r.status !== 200) throw new Error('nama analis ditolak');
r = await call('POST', '/api/imports', pkg); if (r.status !== 201) throw new Error('impor gagal: ' + JSON.stringify(r.json));
const rep = await call('GET', `/api/imports/${r.json.import_id}/report`);
console.log(JSON.stringify({ import_id: r.json.import_id, counts: r.json.counts, laporan: { ...rep.json, notes: Object.fromEntries(Object.entries(rep.json.notes).map(([k, v]) => [k, v.length])) } }, null, 2));
