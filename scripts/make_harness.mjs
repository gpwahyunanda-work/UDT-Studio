// Bangun harness tampilan Compiler untuk tangkapan layar (peramban agen menolak 127.0.0.1, jadi snapshot API disematkan di file).
// Pemakaian: UDT_FIXTURE_DIR=../data/sheets/csv node scripts/make_harness.mjs <keluaran.html> <Awalan> ...   (awalan: Vastrol20 Gionix16 Zemyc150 Empagliflozin25)
import { writeFileSync } from 'node:fs';
import { createTestDb } from '../tests/helpers/db.js';
import { loggedIn } from '../tests/helpers/http.js';
import { loadWorkbook } from '../tests/helpers/fixtures.js';
import { readWorkbook } from '../server/import/sheetReader.js';

const SHEETS = {
  Zemyc150: ['Zemyc150', 'Development of Zemyc 150 mg Kapsul.xlsx'],
  Gionix16: ['Gionix16', 'Development of Gionix 16 mg Tab.xlsx'],
  Vastrol20: ['Vastrol20', 'Development of Vastrol 20 mg Tablet.xlsx', ['pH_1_2', 'pH_4_5', 'pH_6_8']],
  Empagliflozin25: ['Empagliflozin25', 'Development of Empagliflozin 25 mg Tablet.xlsx', ['UDT_Release', 'UDT_pH_1_2', 'UDT_pH_4_5', 'UDT_pH_6_8']],
};
const [out, ...names] = process.argv.slice(2);
const db = await createTestDb('harness');
try {
  const c = await loggedIn('Analis Uji');
  for (const n of names) { const r = await c.post('/api/imports', readWorkbook(loadWorkbook(...SHEETS[n]))); if (r.status !== 201) throw new Error(n + ' ' + JSON.stringify(r.json)); }
  const list = (await c.get('/api/compiles')).json;
  const data = {};
  for (const x of list.compiles) data[x.compile_id] = (await c.get(`/api/compiles/${x.compile_id}/data`)).json;
  const me = (await c.get('/api/me')).json;
  const snap = JSON.stringify({ list, data, me }).replace(/</g, '\\u003c');
  const html = `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UDT Compiler (harness)</title><link rel="stylesheet" href="compiler/island.css"></head><body style="margin:0;padding:12px;background:#F4F6F8"><main><div id="udt-compile"></div></main>
<script src="compiler/step4.js"></script><script src="compiler/island.js"></script>
<script>var SNAP=${snap};
function api(method,path,body){return new Promise(function(ok){var m;
 if(path==='/api/compiles')return ok({status:200,body:SNAP.list});
 if(m=/^\\/api\\/compiles\\/(\\d+)\\/data$/.exec(path))return ok({status:200,body:SNAP.data[m[1]]});
 if(/\\/audit$/.test(path))return ok({status:200,body:{events:[]}});
 if(/\\/removed$/.test(path))return ok({status:200,body:{runs:[]}});
 ok({status:404,body:{error:'harness: tidak tersedia'}});});}
var me=Object.assign({},SNAP.me,{role:(location.search.indexOf('pembaca')>=0?'pembaca':'penulis')});
window.UDTCompile.mount(document.getElementById('udt-compile'),{api:api,me:me});</script></body></html>`;
  writeFileSync(out, html);
  console.log(JSON.stringify({ out, compiles: list.compiles.map((x) => [x.compile_id, x.title, x.run_count]) }));
} finally { await db.drop(); }
