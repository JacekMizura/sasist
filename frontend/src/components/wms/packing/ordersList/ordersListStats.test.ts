import { describe, expect, it } from "vitest";
import type { WmsPackingOrderCardApi } from "../../../../api/wmsPackingApi";
import { computeOrdersListStats, isPackingOrderCardPacked } from "./ordersListStats";

function card(partial: Partial<WmsPackingOrderCardApi> & { order_id: number }): WmsPackingOrderCardApi {
  return {
    order_id: partial.order_id,
    number: partial.number ?? String(partial.order_id),
    total_quantity: partial.total_quantity ?? 1,
    packed_quantity: partial.packed_quantity ?? 0,
    is_completed: partial.is_completed ?? false,
    lines: partial.lines ?? [],
    order_ui_status: null,
    shipping_method: null,
    ...partial,
  } as WmsPackingOrderCardApi;
}

describe("computeOrdersListStats", () => {
  it("uses exclusive buckets that sum to the source list", () => {
    const orders = [
      card({ order_id: 1, packed_quantity: 2, total_quantity: 2 }),
      card({ order_id: 2, packed_quantity: 0, total_quantity: 3 }),
      card({ order_id: 3, packed_quantity: 1, total_quantity: 3 }),
      card({
        order_id: 4,
        packed_quantity: 0,
        total_quantity: 2,
        lines: [{ missing_quantity: 1, quantity: 2, stock_quantity: 0 } as never],
      }),
      card({ order_id: 5, packed_quantity: 0, total_quantity: 0 }),
    ];
    const stats = computeOrdersListStats(orders);
    expect(stats).toEqual({
      spakowane: 1,
      doSpakowania: 1,
      wTrakcie: 1,
      braki: 1,
    });
    expect(stats.spakowane + stats.doSpakowania + stats.wTrakcie + stats.braki).toBe(4);
    expect(isPackingOrderCardPacked(orders[0]!)).toBe(true);
    expect(isPackingOrderCardPacked(orders[2]!)).toBe(false);
  });
});
