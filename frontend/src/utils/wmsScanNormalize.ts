/** Normalize barcode / EAN string for scan matching. */
export function normalizeScanEan(raw: string | null | undefined): string {
  return String(raw ?? "")
    .replace(/\s+/g, "")
    .trim();
}
