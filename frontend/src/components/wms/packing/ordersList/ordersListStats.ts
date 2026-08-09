import type { WmsPackingOrderCardApi } from "../../../../api/wmsPackingApi";

/** Spakowane wg stanu pakowania (API / ilości), nie wyglądu kafelka. */
export function isPackingOrderCardPacked(order: WmsPackingOrderCardApi): boolean {
  if (order.is_completed === true) return true;
  const total = Number(order.total_quantity || 0);
  const packed = Number(order.packed_quantity || 0);
  return total > 0 && packed >= total;
}

/** Liczniki do badge'y nagłówka (rozłączne kategorie). */
export function computeOrdersListStats(orders: WmsPackingOrderCardApi[]): {
  spakowane: number;
  doSpakowania: number;
  wTrakcie: number;
  /** Zamówienia z brakiem na którejkolwiek linii (do czerwonego badge). */
  braki: number;
} {
  let spakowane = 0;
  let doSpakowania = 0;
  let wTrakcie = 0;
  let braki = 0;
  for (const o of orders) {
    const total = o.total_quantity;
    const packed = o.packed_quantity;
    const hasShortage = o.lines.some(
      (l) =>
        (typeof l.missing_quantity === "number" && l.missing_quantity > 0) ||
        (l.stock_quantity != null && l.stock_quantity < l.quantity),
    );
    if (hasShortage) braki++;
    if (total <= 0) continue;
    if (packed >= total || o.is_completed === true) {
      spakowane++;
      continue;
    }
    if (hasShortage) {
      doSpakowania++;
      continue;
    }
    if (packed === 0) doSpakowania++;
    else wTrakcie++;
  }
  return { spakowane, doSpakowania, wTrakcie, braki };
}
