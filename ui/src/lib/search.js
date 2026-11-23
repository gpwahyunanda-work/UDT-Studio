// Kotak cari daftar compile.
export function filterCompiles(list, q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return list;
  return list.filter((c) => [c.title, c.product_name, c.strength, c.dosage_form, c.api].some((x) => String(x || '').toLowerCase().includes(s)));
}

