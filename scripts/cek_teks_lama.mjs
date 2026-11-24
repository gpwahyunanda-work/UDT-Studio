// F19: pemeriksaan BACA-SAJA data yang sudah ada: kolom teks yang memuat Cc/Cf/TAB/U+2028-9 atau spasi ganda/tepi. Tidak mengubah apa pun.
// Pakai: DATABASE_URL=postgres://... node scripts/cek_teks_lama.mjs   (hanya SELECT; sebaiknya peran udt_app). Keluaran: laporan JSON ke stdout; exit 0.
import pg from 'pg';

export const TEXT_COLS = {
  compile: ['product_name', 'strength', 'dosage_form', 'api', 'project_code', 'title'],
  medium: ['full_name', 'volume_text', 'apparatus', 'rpm_text', 'method', 'method_ref'],
  batch: ['batch_no', 'brand_name'],
  compile_alias: ['alias'],
  run: ['variant', 'manufacturer_site', 'note', 'invalid_reason'],
  analyst: ['name'],
  run_removal: ['reason'],
};
const BAD = "[\\u0000-\\u001f\\u007f-\\u009f\\u00ad\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u2064\\ufeff]";

export async function scanBadText(query) {
  const out = [];
  for (const [t, cols] of Object.entries(TEXT_COLS)) for (const c of cols) {
    // catatan/alasan boleh memuat LF; selain itu setiap karakter kendali dihitung. Spasi ganda/tepi dilaporkan terpisah.
    const multi = ['note', 'invalid_reason', 'reason'].includes(c);
    const badRe = multi ? "[\\u0000-\\u0009\\u000b-\\u001f\\u007f-\\u009f\\u00ad\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u2064\\ufeff]" : BAD;
    const r = await query(`SELECT count(*) FILTER (WHERE "${c}" ~ $1)::int AS bad, count(*) FILTER (WHERE "${c}" ~ '(^\\s|\\s$|\\s\\s)' AND "${c}" !~ $1)::int AS spasi, count(*)::int AS n FROM "${t}"`, [badRe]);
    const { bad, spasi, n } = r.rows[0];
    if (bad || spasi) {
      const ids = (await query(`SELECT ctid::text AS id, left("${c}", 80) AS contoh FROM "${t}" WHERE "${c}" ~ $1 LIMIT 5`, [badRe])).rows;
      out.push({ tabel: t, kolom: c, baris_total: n, baris_karakter_terlarang: bad, baris_spasi_tak_normal: spasi, contoh: ids.map((x) => JSON.stringify(x.contoh)) });
    }
  }
  return out;
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('cek_teks_lama.mjs')) {
  const url = process.env.DATABASE_URL; if (!url) { console.error('DATABASE_URL wajib'); process.exit(2); }
  const c = new pg.Client({ connectionString: url }); await c.connect();
  await c.query('SET default_transaction_read_only = on');
  const rep = await scanBadText((s, p) => c.query(s, p));
  console.log(JSON.stringify({ catatan: 'Hanya laporan; tidak ada baris diubah.', temuan: rep }, null, 2));
  await c.end();
}
