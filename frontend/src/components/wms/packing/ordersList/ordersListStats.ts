import type { WmsPackingOrderCardApi } from "../../../../api/wmsPackingApi";

/** Liczniki do badge'y nagłówka (rozłączne kategorie). */
export function computeOrdersListStats(orders: WmsPackingOrderCardApi[]): {
  spakowane: number;
  doSpakowania: number;
  wTrakcie: number;
} {
  let spakowane = 0;
  let doSpakowania = 0;
  let wTrakcie = 0;
  for (const o of orders) {
    const total = o.total_quantity;
    const packed = o.packed_quantity;
    if (total <= 0) continue;
    if (packed >= total) {
      spakowane++;
      continue;
    }
    const hasShortage = o.lines.some(
      (l) => l.stock_quantity != null && l.stock_quantity < l.quantity,
    );
    if (hasShortage) {
      doSpakowania++;
      continue;
    }
    if (packed === 0) doSpakowania++;
    else wTrakcie++;
  }
  return { spakowane, doSpakowania, wTrakcie };
}
