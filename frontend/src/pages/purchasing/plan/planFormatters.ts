/** Normalizacja −0 / wartości bliskich zeru — wspólne dla kolumn ilościowych Planu zakupów. */
export function normalizeNumericZero(n: number): number {
  return Math.abs(n) < 1e-9 ? 0 : n;
}

export function numFmt(n: number | null | undefined, opts?: Intl.NumberFormatOptions): string {
  if (n == null || Number.isNaN(n)) return "—";
  return normalizeNumericZero(n).toLocaleString("pl-PL", opts);
}

/** Średnia dzienna — max 2 miejsca po przecinku, zero jako `0`, nigdy `-0`. */
export function formatAvgDaily(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const x = normalizeNumericZero(n);
  if (x === 0) return "0";
  return x.toLocaleString("pl-PL", { maximumFractionDigits: 2 });
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
