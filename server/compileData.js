// Pembaca data compile (satu sumber untuk GET /data dan ekspor). Hanya run terlihat; Tidak valid ikut (UI/ekspor yang menandai).
export async function loadCompileData(query, id, { withPoints = false } = {}) {
  const c1 = (await query('SELECT compile_id, product_name, strength, dosage_form, api, api_uncertain, project_code, title FROM compile WHERE compile_id=$1', [id])).rows[0];
  if (!c1) return null;
  const med = await query(`SELECT m.medium_id, m.code, mc.label, m.full_name, m.volume_text, m.apparatus, m.rpm_text, m.method, m.method_ref, mc.sort_no FROM medium m JOIN medium_code mc ON mc.code=m.code WHERE m.compile_id=$1 ORDER BY mc.sort_no, m.full_name`, [id]);
  const runs = await query(`SELECT r.run_id, r.medium_id, r.variant, to_char(r.test_date,'YYYY-MM-DD') AS test_date, r.manufacturer_site, r.note, r.is_valid, r.invalid_reason, r.source,
      b.brand_name, b.batch_no,
      concat_ws(' + ', CASE WHEN EXISTS (SELECT 1 FROM comparison ct WHERE ct.test_run_id=r.run_id) THEN 'uji' END, CASE WHEN EXISTS (SELECT 1 FROM comparison cr WHERE cr.ref_run_id=r.run_id) THEN 'pembanding' END) AS role_context,
      CASE WHEN EXISTS (SELECT 1 FROM comparison ct WHERE ct.test_run_id=r.run_id) THEN 'uji' ELSE 'reference' END AS role,
      (SELECT json_agg(json_build_object('tab',s.tab_name,'avg_row',s.avg_row,'block_date',to_char(s.block_date,'YYYY-MM-DD'),'product_printed',s.product_printed,'role_raw',s.role_raw,'import_outcome',s.import_outcome,'hold_reason',s.hold_reason) ORDER BY s.source_block_id) FROM run_source_block s WHERE s.run_id=r.run_id) AS source_blocks,
      (SELECT json_agg(t.minute::float8 ORDER BY t.seq) FROM run_timepoint t WHERE t.run_id=r.run_id) AS minutes
    FROM run_visible r JOIN batch b ON b.batch_id=r.batch_id WHERE r.compile_id=$1 ORDER BY r.medium_id, b.batch_no, r.test_date NULLS LAST, r.run_id`, [id]);
  const vals = await query(`SELECT v.run_id, v.vessel_no, json_agg(v.pct::float8 ORDER BY v.seq) AS pct, json_agg(v.seq ORDER BY v.seq) AS seqs
    FROM run_value v JOIN run_visible r ON r.run_id=v.run_id WHERE r.compile_id=$1 GROUP BY v.run_id, v.vessel_no ORDER BY v.run_id, v.vessel_no`, [id]);
  const tps = await query(`SELECT t.run_id, json_agg(t.seq ORDER BY t.seq) AS seqs FROM run_timepoint t JOIN run_visible r ON r.run_id=t.run_id WHERE r.compile_id=$1 GROUP BY t.run_id`, [id]);
  const cmp = await query(`SELECT c.total_sq::float8 AS total_sq, c.comparison_id, c.medium_id, c.test_run_id, c.ref_run_id, c.f2::float8 AS f2, c.n_points, c.conclusion_code, c.conclusion_printed, c.f2_source
    FROM comparison c JOIN run_visible a ON a.run_id=c.test_run_id JOIN run_visible b ON b.run_id=c.ref_run_id WHERE a.compile_id=$1 ORDER BY c.comparison_id`, [id]);
  const seqMap = new Map(tps.rows.map(x => [Number(x.run_id), x.seqs]));
  const byRun = new Map();
  for (const v of vals.rows) {   // nilai disusun mengikuti urutan titik waktu; sel yang tidak ada = null (bukan 0)
    const rid = Number(v.run_id), seqs = seqMap.get(rid) || [];
    const arr = seqs.map(() => null); v.seqs.forEach((s, i) => { const k = seqs.indexOf(s); if (k >= 0) arr[k] = v.pct[i]; });
    (byRun.get(rid) || byRun.set(rid, {}).get(rid))[v.vessel_no] = arr;
  }
  const apiNotes = (await query("SELECT DISTINCT n.sheet_tab, n.message FROM import_note n JOIN import_run i ON i.import_id=n.import_id WHERE n.kind='api_mismatch' AND EXISTS (SELECT 1 FROM run r WHERE r.import_id=i.import_id AND r.compile_id=$1)", [id])).rows;
  let pts = new Map();
  if (withPoints) {
    const r = await query(`SELECT p.comparison_id, json_agg(json_build_object('seq',p.seq,'sq',p.sq_diff::float8) ORDER BY p.seq) AS pts FROM comparison_point p JOIN comparison c ON c.comparison_id=p.comparison_id JOIN run_visible a ON a.run_id=c.test_run_id WHERE a.compile_id=$1 GROUP BY p.comparison_id`, [id]);
    pts = new Map(r.rows.map((x) => [Number(x.comparison_id), x.pts]));
  }
  return {
    compile: { ...c1, compile_id: Number(c1.compile_id) },
    api_notes: apiNotes,
    mediums: med.rows.map(x => ({ medium_id: Number(x.medium_id), code: x.code, label: x.label, full_name: x.full_name, volume_text: x.volume_text, apparatus: x.apparatus, rpm_text: x.rpm_text, method: x.method, method_ref: x.method_ref })),
    runs: runs.rows.map(x => ({ run_id: Number(x.run_id), medium_id: Number(x.medium_id), brand_name: x.brand_name, batch_no: x.batch_no, role: x.role, role_context: x.role_context, source_blocks: x.source_blocks || [], variant: x.variant, test_date: x.test_date, manufacturer_site: x.manufacturer_site, note: x.note, is_valid: x.is_valid, invalid_reason: x.invalid_reason, source: x.source, minutes: x.minutes || [], vessels: byRun.get(Number(x.run_id)) || {} })),
    comparisons: cmp.rows.map(x => ({ comparison_id: Number(x.comparison_id), medium_id: Number(x.medium_id), test_run_id: Number(x.test_run_id), ref_run_id: Number(x.ref_run_id), f2: x.f2, n_points: x.n_points, conclusion_code: x.conclusion_code, conclusion_printed: x.conclusion_printed, f2_source: x.f2_source, ...(withPoints ? { total_sq: x.total_sq, points: pts.get(Number(x.comparison_id)) || [] } : {}) })),
  };
}
