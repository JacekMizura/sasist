import { describe, expect, it } from "vitest";
import type { WmsPackingOrderLineApi } from "../../../api/wmsPackingApi";
import { packingLocationBadge } from "./packingProductCardParts";

function line(partial: Partial<WmsPackingOrderLineApi>): WmsPackingOrderLineApi {
  return {
    order_item_id: 1,
    product_id: 1,
    product_name: "P",
    quantity: 1,
    quantity_packed: 0,
    location_label: null,
    location_bin_qty: null,
    ...partial,
  } as WmsPackingOrderLineApi;
}

describe("packingLocationBadge", () => {
  it("formats qty without leading x", () => {
    expect(packingLocationBadge(line({ location_label: "C2-A-1", location_bin_qty: 97 }))).toBe(
      "C2-A-1 (97)",
    );
  });

  it("returns bare location when qty missing", () => {
    expect(packingLocationBadge(line({ location_label: "B6-A-1" }))).toBe("B6-A-1");
  });
});
