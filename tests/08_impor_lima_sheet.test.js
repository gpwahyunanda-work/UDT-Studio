// Impor 5 sheet lewat API (INDRA temuan 1: Gionix ditolak 409 pada DB kosong). [LAPTOP]
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from './helpers/db.js';
import { loggedIn } from './helpers/http.js';
import { loadWorkbook, hasFixtures } from './helpers/fixtures.js';
import { readWorkbook } from '../server/import/sheetReader.js';

const opt = { skip: hasFixtures ? false : 'fixture tidak ada' };
const SHEETS = {
  Zemyc: ['Zemyc150', 'Development of Zemyc 150 mg Kapsul.xlsx'],
  E10: ['Empagliflozin10', 'Development of Empagliflozin 10 mg Tablet.xlsx'],
  Gionix: ['Gionix16', 'Development of Gionix 16 mg Tab.xlsx'],
  Vastrol: ['Vastrol20', 'Development of Vastrol 20 mg Tablet.xlsx', ['pH_1_2', 'pH_4_5', 'pH_6_8']],
  E25: ['Empagliflozin25', 'Development of Empagliflozin 25 mg Tablet.xlsx', ['UDT_Release', 'UDT_pH_1_2', 'UDT_pH_4_5', 'UDT_pH_6_8']],
};
let db, c;
before(async () => { db = await createTestDb('imp5'); c = await loggedIn('Analis Impor'); });
after(async () => { await db.drop(); });

for (const [k, args] of Object.entries(SHEETS)) {
  test(`impor ${k} lolos pada DB kosong dan idempotensi tidak menggandakan`, opt, async () => {
    const pkg = readWorkbook(loadWorkbook(...args));
    const r = await c.post('/api/imports', pkg);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    const rep = await c.get(`/api/imports/${r.json.import_id}/report`);
    assert.equal(rep.status, 200);
    assert.equal(rep.json.runs, new Set(pkg.runs.map(x => x.key)).size);
  });
}
