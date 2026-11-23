// f2 aturan tim (README sheet lama; dikonfirmasi pada HTML Compiler tim v3): TIGA titik pertama setelah menit 0 (biasanya 5', 10', 15'), n = 3,
// f2 = 50 * log10(100 / sqrt(1 + jumlah((Rt - Tt)^2) / 3)). Ini SATU-SATUNYA tempat rumus ini; klien Compiler tidak punya rumus (F6).
// f2 Langkah 4 (aturan pemotongan 85% dan n bervariasi) tetap fungsi asli di server/step4.js (lewat server/lib/udtBridge.js).
// Masukan: rata-rata pembanding dan uji, sejajar menurut menit positif; sel tanpa nilai = null.
const fin = (x) => typeof x === 'number' && Number.isFinite(x);

export function f2Tim(ref, test) {
  const idx = [];
  for (let i = 0; i < Math.min(ref.length, test.length) && idx.length < 3; i++) if (fin(ref[i]) && fin(test[i])) idx.push(i);
  if (idx.length < 3) return { f2: NaN, n: idx.length, idx, sumsq: NaN, a: NaN, kind: 'na' };
  let s = 0;
  for (const i of idx) { const d = ref[i] - test[i]; s += d * d; }
  const f2 = 50 * Math.log(100 / Math.sqrt(1 + s / 3)) / Math.LN10;
  // sangat cepat: kedua rata-rata >= 85% pada titik ke-3 (15 menit pada jadwal baku); f2 hanya informasi
  const rap = ref[idx[2]] >= 85 && test[idx[2]] >= 85;
  return { f2, n: 3, idx, sumsq: s, a: 1 / Math.sqrt(1 + s / 3), kind: rap ? 'rap' : (f2 >= 50 ? 'sim' : 'not') };
}

// Kode kesimpulan Langkah 4 -> kode tampilan tim.
export const KIND_OF_L4 = { very_rapid: 'rap', similar: 'sim', not_similar: 'not', na: 'na' };
