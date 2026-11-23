// GENERATED oleh scripts/build_step4.mjs dari index.html (Langkah 4). JANGAN diedit; ubah sumbernya lewat kontrol perubahan.
const mean = a => a.length ? a.reduce((s,x)=>s+x,0)/a.length : 0;
const sdev = a => { if (a.length<2) return NaN; const m=mean(a); return Math.sqrt(a.reduce((s,x)=>s+(x-m)*(x-m),0)/(a.length-1)); };
const fmt=(n,d=2)=>(typeof n==='number'&&isFinite(n))?n.toFixed(d).replace('.',','):'–';
const fin = a => (a||[]).filter(x => typeof x === 'number' && isFinite(x));
function toNum(s){
  if (s === null || s === undefined) return NaN;
  if (typeof s === 'number') return isFinite(s) ? s : NaN;
  let t = String(s).trim().replace(/\s/g,'');
  if (!t) return NaN;
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(t)) t = t.replace(/\./g,'').replace(',','.');
  else if (/^-?\d{1,3}(,\d{3})+\.\d+$/.test(t)) t = t.replace(/,/g,'');
  else if (/^-?\d+,\d+$/.test(t)) t = t.replace(',','.');
  const n = Number(t); return isFinite(n) ? n : NaN;
}
function formatVesselRanges(vessels){
  const sorted = [...new Set((vessels || []).filter(v => isFinite(v) && v > 0).map(Number))].sort((a,b) => a - b);
  if (!sorted.length) return '';
  const ranges = [];
  let start = sorted[0], prev = sorted[0];
  for (let i = 1; i < sorted.length; i++){
    if (sorted[i] === prev + 1){
      prev = sorted[i];
    } else {
      ranges.push(start === prev ? ('V' + start) : ('V' + start + '–V' + prev));
      start = prev = sorted[i];
    }
  }
  ranges.push(start === prev ? ('V' + start) : ('V' + start + '–V' + prev));
  return ranges.join(', ');
}
function calcBatchProfile(M, B, p, stdSetOrSpec){
  const times = (M && M.times) ? M.times : [];
  const vesselsList = (B && B.vessels && B.vessels.length) ? B.vessels : [];
  const V = vesselsList.length ? Math.max(...vesselsList) : 0;
  const isSpec = Boolean(stdSetOrSpec && stdSetOrSpec.isSpec);

  const T = times.length;
  const fallbackWs = (p && isFinite(toNum(p.ws)) && toNum(p.ws) > 0) ? toNum(p.ws) : NaN;
  const lc = (p && isFinite(toNum(p.lc)) && toNum(p.lc) > 0) ? toNum(p.lc) : NaN;
  const dilStd = (p && isFinite(toNum(p.dilStd)) && toNum(p.dilStd) > 0) ? toNum(p.dilStd) : NaN;
  const dilSample = (p && isFinite(toNum(p.dilSample)) && toNum(p.dilSample) > 0) ? toNum(p.dilSample) : NaN;
  const volMedia = (p && isFinite(toNum(p.volMedia)) && toNum(p.volMedia) > 0) ? toNum(p.volMedia) : NaN;
  const volRep = (p && isFinite(toNum(p.volRep)) && toNum(p.volRep) >= 0) ? toNum(p.volRep) : 0;
  const pctWS = (p && isFinite(toNum(p.pctWS))) ? toNum(p.pctWS) : NaN;
  const mrCa = (p && isFinite(toNum(p.mrCa)) && toNum(p.mrCa) > 0) ? toNum(p.mrCa) : 1;
  const mr = (p && isFinite(toNum(p.mr)) && toNum(p.mr) > 0) ? toNum(p.mr) : 1;

  const getVesselEntry = (v) => {
    if (!isSpec){
      return { stdSet: stdSetOrSpec || null, ws: fallbackWs };
    }
    const ve = stdSetOrSpec.byVessel && stdSetOrSpec.byVessel[v];
    if (ve) return ve;
    return { stdSet: stdSetOrSpec.defaultStd || null, ws: stdSetOrSpec.defaultWs };
  };

  const singleStd = isSpec ? stdSetOrSpec.defaultStd : stdSetOrSpec;
  const checkStdSets = isSpec
    ? Object.values(stdSetOrSpec.byVessel || {}).map(x => x.stdSet).filter(Boolean)
    : (singleStd ? [singleStd] : []);
  if (!checkStdSets.length && singleStd) checkStdSets.push(singleStd);

  if (!checkStdSets.length || checkStdSets.every(s => !s || !s.std || !s.std.length)){
    return {
      V, times,
      res: times.length ? Array.from({length: V}, () => Array(times.length).fill(NaN)) : [],
      stats: times.map(() => ({min:NaN, max:NaN, avg:NaN, sd:NaN, rsd:NaN})),
      stdMean: NaN, stdRSD: NaN, isMultiStd: false, usedStdSets: [], error: 'Larutan standar belum ditentukan'
    };
  }

  const vesselStdInfo = {};
  const stdGroupOrder = [];
  const stdGroupMap = {};
  let validStdCount = 0;

  const res = [];
  for (let v = 1; v <= V; v++){
    if (!vesselsList.includes(v)){ res.push(null); continue; }
    const ve = getVesselEntry(v);
    const sObj = ve.stdSet || null;
    const stV = fin(sObj && sObj.std).slice(0, 5);
    const stdMeanV = mean(stV);
    const stdRsdV = (stV.length >= 2 && stdMeanV > 0) ? (sdev(stV) / stdMeanV * 100) : NaN;
    const wsRaw = isSpec ? ve.ws : fallbackWs;
    const wsNumV = (wsRaw !== null && wsRaw !== undefined && isFinite(toNum(wsRaw)) && toNum(wsRaw) > 0) ? toNum(wsRaw) : NaN;

    if (stV.length && stdMeanV > 0) validStdCount++;

    vesselStdInfo[v] = { stdSet: sObj, wsWeight: wsNumV, stdMean: stdMeanV, stdRSD: stdRsdV, file: ve.file || '' };
    if (sObj){
      if (!stdGroupMap[sObj.id]){
        stdGroupMap[sObj.id] = {
          stdSet: sObj,
          vessels: [],
          wsWeight: wsNumV,
          stdMean: stV.length && stdMeanV > 0 ? stdMeanV : NaN,
          stdRSD: stdRsdV
        };
        stdGroupOrder.push(sObj.id);
      }
      stdGroupMap[sObj.id].vessels.push(v);
    }

    const kV = (!stV.length || stdMeanV <= 0 || !isFinite(wsNumV) || !isFinite(lc) || !isFinite(dilStd) || !isFinite(dilSample) || !isFinite(volMedia) || !isFinite(pctWS))
      ? NaN
      : (wsNumV / lc) * (dilSample / dilStd) * (mr / mrCa) * pctWS / stdMeanV;

    const raw = times.map(t => (B.cells[v+'|'+t] ? B.cells[v+'|'+t].area * kV : NaN));
    const corr = []; let cum = 0;
    for (let i = 0; i < T; i++){
      if (!isFinite(raw[i])){
        corr.push(NaN);
        continue;
      }
      const corrTerm = (volRep > 0 && volMedia > 0) ? (volRep / volMedia) * cum : 0;
      const c = raw[i] + corrTerm;
      corr.push(c);
      cum += c;
    }
    res.push(corr);
  }

  const usedStdSets = stdGroupOrder.map(id => ({
    ...stdGroupMap[id],
    vesselLabel: formatVesselRanges(stdGroupMap[id].vessels)
  }));
  const firstUsed = usedStdSets[0] || null;

  if (vesselsList.length > 0 && validStdCount === 0){
    return {
      V, times,
      res: times.length ? Array.from({length: V}, () => Array(times.length).fill(NaN)) : [],
      stats: times.map(() => ({min:NaN, max:NaN, avg:NaN, sd:NaN, rsd:NaN})),
      stdMean: NaN, stdRSD: NaN, isMultiStd: false, usedStdSets, vesselStdInfo, error: 'Area standar belum valid'
    };
  }

  const used = res.filter(Boolean);
  const stats = times.map((t, i) => {
    const col = used.map(r => r[i]).filter(x => isFinite(x));
    const avg = mean(col);
    const sd = sdev(col);
    const rsd = avg > 0 ? (sd / avg) * 100 : 0;
    return {min: col.length ? Math.min(...col) : NaN, max: col.length ? Math.max(...col) : NaN, avg, sd, rsd};
  });
  return {
    V, times, res, stats,
    stdMean: firstUsed ? firstUsed.stdMean : NaN,
    stdRSD: firstUsed ? firstUsed.stdRSD : NaN,
    isMultiStd: usedStdSets.length > 1,
    usedStdSets,
    vesselStdInfo
  };
}
function evalSimilarityF2(times, refMeans, testMeans, refStats, testStats){
  const T = Math.min((times||[]).length, (refMeans||[]).length, (testMeans||[]).length);
  if (T < 1){
    return {
      f2: NaN, n: 0, usedTimes: [], usedRef: [], usedTest: [],
      cutoffIdx: -1, reason: 'Data titik waktu tidak cukup untuk perhitungan f2',
      both85at15: false, rsdExceeded: false, rsdDetails: [],
      isSimilar: false, minPointsValid: false
    };
  }

  // Very Rapid Dissolution: pelepasan >= 85% dalam 15 menit atau kurang (FDA / EMA / BPOM)
  let both85at15 = false;
  for (let i = 0; i < T; i++){
    if (times[i] <= 15 && refMeans[i] >= 85 && testMeans[i] >= 85){
      both85at15 = true;
      break;
    }
  }

  // Kaidah Cut-off 85% (PerBPOM No. 11/2022, EMA CPMP/EWP/QWP/1401/98, ICH M9):
  // Tidak lebih dari 1 titik sampling dengan rerata pelepasan >= 85% untuk masing-masing formulasi
  // (Not more than one mean value of > 85% dissolved for any/either of the formulations).
  // Titik pertama di mana salah satu atau kedua produk mencapai >= 85% diikutsertakan,
  // dan titik-titik selanjutnya dieksklusi untuk mencegah bias fase plateau.
  let cutoffIdx = T - 1;
  let reason = 'Semua titik waktu diikutsertakan';

  for (let i = 0; i < T; i++){
    const rHigh = refMeans[i] >= 85;
    const tHigh = testMeans[i] >= 85;
    if (rHigh || tHigh){
      cutoffIdx = i;
      if (rHigh && tHigh){
        reason = `Dipotong pada menit ${times[i]}' (kedua produk telah mencapai ≥ 85% — batas maks. 1 titik ≥ 85% per regulasi BPOM/EMA)`;
      } else if (rHigh){
        reason = `Dipotong pada menit ${times[i]}' (produk pembanding mencapai ≥ 85% — batas maks. 1 titik ≥ 85% per regulasi BPOM/EMA)`;
      } else {
        reason = `Dipotong pada menit ${times[i]}' (produk uji mencapai ≥ 85% — batas maks. 1 titik ≥ 85% per regulasi BPOM/EMA)`;
      }
      break;
    }
  }

  const n = cutoffIdx + 1;
  const usedTimes = times.slice(0, n);
  const usedRef = refMeans.slice(0, n);
  const usedTest = testMeans.slice(0, n);

  let sumSq = 0;
  for (let i = 0; i < n; i++){
    sumSq += Math.pow(usedRef[i] - usedTest[i], 2);
  }
  const factor = Math.pow(1 + sumSq / n, -0.5);
  const f2Val = 50 * Math.log10(factor * 100);

  let rsdExceeded = false;
  const rsdDetails = [];
  for (let i = 0; i < n; i++){
    const t = times[i];
    const limit = (i === 0) ? 20 : 10;
    const rRSD = (refStats && refStats[i]) ? refStats[i].rsd : 0;
    const tRSD = (testStats && testStats[i]) ? testStats[i].rsd : 0;
    if (rRSD > limit || tRSD > limit){
      rsdExceeded = true;
      rsdDetails.push(`menit ${t}' (Limit ${limit}%: Ref ${fmt(rRSD,1)}%, Uji ${fmt(tRSD,1)}%)`);
    }
  }

  return {
    f2: f2Val,
    n,
    usedTimes,
    usedRef,
    usedTest,
    cutoffIdx,
    reason,
    both85at15,
    rsdExceeded,
    rsdDetails,
    isSimilar: f2Val >= 50 && f2Val <= 100,
    minPointsValid: n >= 3
  };
}
function classifyF2Outcome(f2Res){
  if (f2Res && f2Res.both85at15){
    return { code:'very_rapid', cls:'ok', label:'SIMILAR', statusText:"Similar (Very Rapid ≥ 85% @ 15')" };
  }
  if (f2Res && isFinite(f2Res.f2)){
    return f2Res.isSimilar
      ? { code:'similar', cls:'ok', label:'SIMILAR', statusText:'50 – 100: Similar' }
      : { code:'not_similar', cls:'warn', label:'NOT SIMILAR', statusText:'< 50: Not Similar' };
  }
  return { code:'na', cls:'info', label:'BELUM DAPAT DIHITUNG', statusText:'Belum dapat dihitung' };
}
