/** Normalize quick discount shortcut values for terminal display (UX only — BE validates). */

export function normalizeQuickDiscountPercents(
  raw: number[] | undefined | null,
  maxDiscountPercent: number,
): number[] {
  const max = Number.isFinite(maxDiscountPercent) ? Math.min(100, Math.max(0, maxDiscountPercent)) : 50;
  const seen = new Set<number>();
  const out: number[] = [];
  for (const value of raw ?? []) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0 || n > 100 || n > max) continue;
    const key = Math.round(n * 100) / 100;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** Parse settings form input into stored quick discount list. */
export function parseQuickDiscountPercentsInput(raw: string): number[] {
  const parts = raw
    .split(/[,;\s]+/)
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= 100);
  const seen = new Set<number>();
  const out: number[] = [];
  for (const n of parts) {
    const key = Math.round(n * 100) / 100;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out.length ? out : [5, 10, 15, 20];
}
