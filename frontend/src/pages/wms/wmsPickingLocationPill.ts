const qtyFmt = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 });

/**
 * Etykieta do kompaktowej „pill” lokalizacji zbierania:
 * `[ZONE]: [LOCATION] ([stock])` lub bez części stockowej / bez dwukropka dla pojedynczej strefy.
 *
 * Przykłady: `A11: 1-1 (12)`, `B2: B-1 (1)`, `IMPORT (88)`, `A11: 1-1` (brak stocku).
 */
export function formatWmsPickingLocationPillLabel(code: string, stock: number | undefined): string {
  const c = String(code ?? "").trim();
  if (!c) return "";
  const hasStock = typeof stock === "number" && Number.isFinite(stock) && stock > 1e-9;
  const stockPart = hasStock ? ` (${qtyFmt.format(stock)})` : "";
  const dash = c.indexOf("-");
  if (dash < 0) {
    return `${c}${stockPart}`;
  }
  const zone = c.slice(0, dash).trim();
  const rest = c.slice(dash + 1).trim();
  if (!zone) return `${c}${stockPart}`;
  if (!rest) return `${zone}${stockPart}`;
  return `${zone}: ${rest}${stockPart}`;
}
