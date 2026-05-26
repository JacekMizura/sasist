/** Plain string for react-pdf <Text> — avoids undefined/null leaking into layout. */
export function pdfStr(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (s === "undefined" || s === "null") return "";
  return s;
}

export function pdfNumFixed(v: number, digits: number): string {
  if (!Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

export function pdfInt(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return String(Math.trunc(v));
}
