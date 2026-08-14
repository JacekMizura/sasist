/** Pure helpers for Production Materials → Braki list (testable). */

export function isTrueMaterialShortage(missingQty: number | null | undefined): boolean {
  return Number(missingQty ?? 0) > 1e-6;
}

export function coveredQtyFromStock(required: number | null | undefined, available: number | null | undefined): number {
  const req = Math.max(0, Number(required ?? 0));
  const avail = Math.max(0, Number(available ?? 0));
  return Math.min(req, avail);
}

export function filterShortageQueueRows<T extends { missing_qty: number }>(rows: T[]): T[] {
  return rows.filter((r) => isTrueMaterialShortage(r.missing_qty));
}
