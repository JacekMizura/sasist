import type { WmsPackingOrderCardApi } from "../../../../api/wmsPackingApi";

/** Spakowane wg stanu pakowania (API / ilości), nie wyglądu kafelka. */
export function isPackingOrderCardPacked(order: WmsPackingOrderCardApi): boolean {
  if (order.is_completed === true) return true;
  const total = Number(order.total_quantity || 0);
  const packed = Number(order.packed_quantity || 0);
  return total > 0 && packed >= total;
}

function orderHasShortage(order: WmsPackingOrderCardApi): boolean {
  return order.lines.some(
    (l) =>
      (typeof l.missing_quantity === "number" && l.missing_quantity > 0) ||
      (l.stock_quantity != null && l.stock_quantity < l.quantity),
  );
}

/**
 * Liczniki nagłówka — rozłączne kategorie z tej samej listy zamówień.
 * spakowane + doSpakowania + wTrakcie + braki === liczba kart z total_quantity > 0.
 */
export function computeOrdersListStats(orders: WmsPackingOrderCardApi[]): {
  spakowane: number;
  doSpakowania: number;
  wTrakcie: number;
  braki: number;
} {
  let spakowane = 0;
  let doSpakowania = 0;
  let wTrakcie = 0;
  let braki = 0;
  for (const o of orders) {
    const total = Number(o.total_quantity || 0);
    const packed = Number(o.packed_quantity || 0);
    if (total <= 0) continue;
    if (packed >= total || o.is_completed === true) {
      spakowane++;
      continue;
    }
    if (orderHasShortage(o)) {
      braki++;
      continue;
    }
    if (packed === 0) doSpakowania++;
    else wTrakcie++;
  }
  return { spakowane, doSpakowania, wTrakcie, braki };
}
