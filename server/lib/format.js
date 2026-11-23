// Format Indonesia: koma desimal, tanggal '20 Apr 2025'. Hanya tampilan; tidak mengubah angka.
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export function fmtNum(x, d = 1) {
  if (x === null || x === undefined || !Number.isFinite(x)) return '–';
  return x.toFixed(d).replace('.', ',');
}
export function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return 'Tanggal kosong';
  return `${Number(m[3])} ${BULAN[Number(m[2]) - 1]} ${m[1]}`;
}
