/** Wyświetlanie numerów magazynowych — bez wiodących zer w ostatnim segmencie liczbowym. */
export function displayWarehouseDocumentNumber(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  const parts = s.split(/([\/\-])/);
  let lastNumIdx = -1;
  for (let i = 0; i < parts.length; i += 1) {
    if (/^\d+$/.test(parts[i])) lastNumIdx = i;
  }
  if (lastNumIdx < 0) return s;
  return parts
    .map((part, i) => {
      if (i !== lastNumIdx || !/^\d+$/.test(part)) return part;
      const n = parseInt(part, 10);
      return Number.isFinite(n) ? String(n) : part;
    })
    .join("");
}
