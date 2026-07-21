/**
 * Presentation helpers for PZ receiving qty semantics (existing SSOT):
 * - document: ordered_quantity (>0 = known expectation; 0 = unknown / manual)
 * - actual: received_quantity (saleable + damaged lines)
 * - difference: actual − document (API StockDocumentItemRead.difference)
 * - defects: REJECTED_* disposition lines (see receivingAcceptedBreakdown)
 */

const EPS = 1e-6;

export function hasDocumentExpectedQuantity(ordered: number | null | undefined): boolean {
  return Math.abs(Number(ordered) || 0) > EPS;
}

/** Max ordered across siblings (lot splits keep expectation on one row). null = brak ilości dokumentowej. */
export function documentQuantityFromLines(
  lines: ReadonlyArray<{ ordered_quantity?: number | null }>,
): number | null {
  let maxOrd = 0;
  let any = false;
  for (const ln of lines) {
    const o = Number(ln.ordered_quantity) || 0;
    if (Math.abs(o) > EPS) {
      any = true;
      if (o > maxOrd) maxOrd = o;
    }
  }
  return any ? maxOrd : null;
}

/** SSOT formula: actual − document. null when document qty unknown (legacy ordered=0). */
export function receivingQuantityDifference(
  documentQty: number | null | undefined,
  actualQty: number,
): number | null {
  if (documentQty == null || !hasDocumentExpectedQuantity(documentQty)) return null;
  return Number(actualQty) - Number(documentQty);
}

export function receivingDifferenceToneClass(diff: number | null | undefined): string {
  if (diff == null || !Number.isFinite(diff)) return "text-slate-500";
  if (Math.abs(diff) < EPS) return "text-slate-500";
  if (diff < 0) return "text-red-600";
  return "text-emerald-600";
}

export function formatReceivingSignedDiff(diff: number | null | undefined, fmt: (n: number) => string): string {
  if (diff == null || !Number.isFinite(diff)) return "—";
  if (Math.abs(diff) < EPS) return fmt(0);
  const sign = diff > 0 ? "+" : "";
  return `${sign}${fmt(diff)}`;
}
