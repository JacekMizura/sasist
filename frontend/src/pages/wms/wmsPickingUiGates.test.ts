import { describe, expect, it } from "vitest";
import type { WmsPickingProductLineApi } from "../../api/wmsPickingProductsApi";
import {
  applyWmsPickingShortageToDetail,
  cannotReportPickingShortage,
  computeWmsPickingProductLineSessionStats,
  pickingFinalizeHasShortageSignals,
  polishOrdersWithShortagesLabel,
  polishProductShortageModalSkuLine,
  polishSkuWithShortagesLabel,
  sortWmsPickingProductLinesPickFlow,
  wmsPickingEffectivePickedQuantity,
  wmsPickingDisplayProgressParts,
  wmsPickingLineResolutionStatus,
  wmsPickingRemainingQty,
  wmsPickingRowScanEligible,
  wmsPickingShortageDefaultQty,
} from "./wmsPickingUiGates";

describe("applyWmsPickingShortageToDetail", () => {
  it("sets missing and clears remaining after full shortage on first save", () => {
    const before = {
      product_id: 1,
      name: "SKU",
      ean: null,
      image_url: null,
      total_quantity: 1,
      picked_quantity: 0,
      missing_quantity: 0,
      remaining_to_pick: 1,
      locations: [],
      orders: [{ order_id: 10, order_number: "A", quantity: 1, picked_quantity: 0, missing_quantity: 0, line_value: null, basket_slot: null }],
      active_fifo_order_id: 10,
      put_to_basket_label: null,
      put_to_basket_color_index: 0,
    };
    const after = applyWmsPickingShortageToDetail(before, 1);
    expect(after.missing_quantity).toBe(1);
    expect(wmsPickingRemainingQty(after)).toBe(0);
    expect(after.orders[0].missing_quantity).toBe(1);
    expect(after.resolution_status).toBe("SHORTAGE");
    expect(wmsPickingLineResolutionStatus(after)).toBe("SHORTAGE");
  });
});

describe("wmsPickingRemainingQty", () => {
  it("returns ordered minus picked minus missing", () => {
    expect(
      wmsPickingRemainingQty({ total_quantity: 5, picked_quantity: 3, missing_quantity: 0 }),
    ).toBe(2);
  });
  it("returns 0 when picked plus missing equals ordered", () => {
    expect(
      wmsPickingRemainingQty({ total_quantity: 5, picked_quantity: 3, missing_quantity: 2 }),
    ).toBe(0);
  });
  it("shortage default uses remaining not picked", () => {
    expect(
      wmsPickingShortageDefaultQty({ total_quantity: 5, picked_quantity: 3, missing_quantity: 0 }),
    ).toBe(2);
  });
});

describe("wmsPickingEffectivePickedQuantity", () => {
  it("caps picked when missing covers order (no 2/1 display)", () => {
    const row = { total_quantity: 1, picked_quantity: 2, missing_quantity: 1 };
    expect(wmsPickingEffectivePickedQuantity(row)).toBe(0);
    expect(wmsPickingDisplayProgressParts(row as WmsPickingProductLineApi)).toEqual({
      pickedShown: 0,
      total: 1,
      miss: 1,
      remaining: 0,
    });
  });
});

describe("cannotReportPickingShortage", () => {
  it("allows shortage when cart ok and remaining > 0", () => {
    expect(cannotReportPickingShortage({ remaining: 3, cartId: 1 })).toBe(false);
  });
  it("blocks when no cart", () => {
    expect(cannotReportPickingShortage({ remaining: 5, cartId: null })).toBe(true);
    expect(cannotReportPickingShortage({ remaining: 5, cartId: undefined })).toBe(true);
  });
  it("blocks first-line edge: remaining 0 and no picks", () => {
    expect(cannotReportPickingShortage({ remaining: 0, cartId: 1 })).toBe(true);
  });
  it("allows shortage after completed pick (remaining 0, picked > 0)", () => {
    expect(cannotReportPickingShortage({ remaining: 0, cartId: 1, pickedQuantity: 1 })).toBe(false);
  });
});

describe("pickingFinalizeHasShortageSignals", () => {
  it("false when zeros", () => {
    expect(pickingFinalizeHasShortageSignals({})).toBe(false);
    expect(pickingFinalizeHasShortageSignals({ cohort_shortage_product_count: 0, cohort_shortage_unit_total: 0 })).toBe(
      false,
    );
  });
  it("true when products count", () => {
    expect(pickingFinalizeHasShortageSignals({ cohort_shortage_product_count: 1, cohort_shortage_unit_total: 0 })).toBe(
      true,
    );
  });
  it("true when units only", () => {
    expect(pickingFinalizeHasShortageSignals({ cohort_shortage_product_count: 0, cohort_shortage_unit_total: 0.5 })).toBe(
      true,
    );
  });
});

describe("polishSkuWithShortagesLabel", () => {
  it("plural forms", () => {
    expect(polishSkuWithShortagesLabel(0)).toMatch(/0/);
    expect(polishSkuWithShortagesLabel(1)).toContain("1 produkt");
    expect(polishSkuWithShortagesLabel(2)).toContain("2 produkty");
    expect(polishSkuWithShortagesLabel(5)).toContain("5 produktów");
  });
});

describe("polishOrdersWithShortagesLabel", () => {
  it("mentions zamówien", () => {
    expect(polishOrdersWithShortagesLabel(1)).toContain("zamówien");
  });
});

describe("polishProductShortageModalSkuLine", () => {
  it("uses z brakiem wording", () => {
    expect(polishProductShortageModalSkuLine(1)).toContain("z brakiem");
    expect(polishProductShortageModalSkuLine(3)).toContain("produkt");
  });
});

describe("wmsPickingRowScanEligible", () => {
  it("full shortage with scanner_active false still eligible (session queue)", () => {
    expect(
      wmsPickingRowScanEligible({
        scanner_active: false,
        remaining_to_pick: 0,
        total_quantity: 1,
        picked_quantity: 0,
        missing_quantity: 1,
      }),
    ).toBe(true);
  });
  it("no missing and no remaining not eligible when scanner false", () => {
    expect(
      wmsPickingRowScanEligible({
        scanner_active: false,
        remaining_to_pick: 0,
        total_quantity: 1,
        picked_quantity: 1,
        missing_quantity: 0,
      }),
    ).toBe(false);
  });
});

function line(partial: Partial<WmsPickingProductLineApi> & Pick<WmsPickingProductLineApi, "product_id">): WmsPickingProductLineApi {
  return {
    product_id: partial.product_id,
    name: partial.name ?? "P",
    ean: partial.ean ?? null,
    image_url: partial.image_url ?? null,
    total_quantity: partial.total_quantity ?? 1,
    picked_quantity: partial.picked_quantity ?? 0,
    missing_quantity: partial.missing_quantity,
    remaining_to_pick: partial.remaining_to_pick,
    primary_location_code: partial.primary_location_code ?? "",
    route_sort_key: partial.route_sort_key ?? "",
    ...partial,
  };
}

describe("sortWmsPickingProductLinesPickFlow", () => {
  it("keeps unfinished first and completed last after scan", () => {
    const rows = [
      line({ product_id: 1, total_quantity: 1, picked_quantity: 1, remaining_to_pick: 0, completed: true, route_sort_key: "A" }),
      line({ product_id: 2, total_quantity: 1, picked_quantity: 0, remaining_to_pick: 1, route_sort_key: "B" }),
      line({ product_id: 3, total_quantity: 5, picked_quantity: 1, remaining_to_pick: 4, route_sort_key: "C" }),
    ];
    const sorted = sortWmsPickingProductLinesPickFlow(rows);
    expect(sorted.map((r) => r.product_id)).toEqual([2, 3, 1]);
    expect(computeWmsPickingProductLineSessionStats(sorted)).toEqual({
      zebrane: 1,
      doZebrania: 1,
      wTrakcie: 1,
      braki: 0,
      brakiSzt: 0,
      zamowieniaZBrakami: 0,
    });
  });

  it("places SHORTAGE after COMPLETED_PICK, never as DO POBRANIA", () => {
    const rows = [
      line({
        product_id: 10,
        total_quantity: 1,
        picked_quantity: 0,
        missing_quantity: 1,
        remaining_to_pick: 0,
        completed: true,
        resolution_status: "SHORTAGE",
        route_sort_key: "A",
      }),
      line({
        product_id: 11,
        total_quantity: 1,
        picked_quantity: 1,
        missing_quantity: 0,
        remaining_to_pick: 0,
        completed: true,
        resolution_status: "COMPLETED_PICK",
        route_sort_key: "B",
      }),
      line({
        product_id: 12,
        total_quantity: 1,
        picked_quantity: 0,
        missing_quantity: 0,
        remaining_to_pick: 1,
        resolution_status: "ACTIVE",
        route_sort_key: "C",
      }),
    ];
    const sorted = sortWmsPickingProductLinesPickFlow(rows);
    expect(sorted.map((r) => r.product_id)).toEqual([12, 11, 10]);
    expect(wmsPickingLineResolutionStatus(rows[0])).toBe("SHORTAGE");
    expect(wmsPickingDisplayProgressParts(rows[0]).remaining).toBe(0);
  });

  it("partial with shortage stays PARTIAL until remaining=0", () => {
    expect(
      wmsPickingLineResolutionStatus({
        total_quantity: 5,
        picked_quantity: 2,
        missing_quantity: 1,
        remaining_to_pick: 2,
      }),
    ).toBe("PARTIAL");
    expect(
      wmsPickingLineResolutionStatus({
        total_quantity: 5,
        picked_quantity: 0,
        missing_quantity: 1,
        remaining_to_pick: 4,
      }),
    ).toBe("PARTIAL");
    expect(
      wmsPickingLineResolutionStatus({
        total_quantity: 5,
        picked_quantity: 2,
        missing_quantity: 3,
        remaining_to_pick: 0,
      }),
    ).toBe("SHORTAGE");
  });
});

describe("computeWmsPickingProductLineSessionStats", () => {
  it("partitions SKU lines into zebrane / doZebrania / wTrakcie", () => {
    const rows = [
      line({ product_id: 1, total_quantity: 3, picked_quantity: 3, remaining_to_pick: 0 }),
      line({ product_id: 2, total_quantity: 2, picked_quantity: 0, remaining_to_pick: 2 }),
      line({ product_id: 3, total_quantity: 4, picked_quantity: 1, remaining_to_pick: 3 }),
    ];
    expect(computeWmsPickingProductLineSessionStats(rows)).toEqual({
      zebrane: 1,
      doZebrania: 1,
      wTrakcie: 1,
      braki: 0,
      brakiSzt: 0,
      zamowieniaZBrakami: 0,
    });
  });

  it("counts SHORTAGE as braki, never zebrane", () => {
    const rows = [
      line({
        product_id: 1,
        total_quantity: 1,
        picked_quantity: 0,
        missing_quantity: 1,
        remaining_to_pick: 0,
        resolution_status: "SHORTAGE",
      }),
      line({ product_id: 2, total_quantity: 1, picked_quantity: 0, remaining_to_pick: 1 }),
      line({ product_id: 3, total_quantity: 1, picked_quantity: 0, remaining_to_pick: 1 }),
      line({ product_id: 4, total_quantity: 1, picked_quantity: 0, remaining_to_pick: 1 }),
    ];
    expect(computeWmsPickingProductLineSessionStats(rows)).toEqual({
      zebrane: 0,
      doZebrania: 3,
      wTrakcie: 0,
      braki: 1,
      brakiSzt: 1,
      zamowieniaZBrakami: 0,
    });
  });
});
