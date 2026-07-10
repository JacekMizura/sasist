export function numFmt(n: number | null | undefined, opts?: Intl.NumberFormatOptions): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("pl-PL", opts);
}

export function fmtShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" });
  } catch {
    return iso;
  }
}
