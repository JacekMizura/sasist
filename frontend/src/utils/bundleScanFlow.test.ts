import { describe, expect, it } from "vitest";
import type { BundleScanOut, ConsolidationRackBundleRowOut } from "../api/bundlesLogisticsApi";
import {
  appendBulkScanLog,
  buildPickingBundleDisplay,
  bundleDisplayTitle,
  bundleTraceabilityEntries,
  bulkScanLogEntry,
  consolidationRackHeading,
  isBundleBarcodeResolve,
  isStockBundleMode,
  packingBundleVerifiedMessage,
  pickingBundleProgressLabel,
  returnsBundleOrderIds,
  shouldShowBundleVerifiedBadge,
} from "./bundleScanFlow";

function onDemandScan(overrides: Partial<BundleScanOut> = {}): BundleScanOut {
  return {
    found: true,
    domain: "picking",
    barcode: "590111",
    bundle_id: 7,
    bundle_name: "Promo",
    bundle_fulfillment_mode: "ON_DEMAND_ASSEMBLY",
    action: "show_missing_components",
    quantity: 1,
    missing_components: [
      {
        order_item_id: 51,
        product_id: 101,
        product_name: "A",
        quantity_required: 2,
        quantity_picked: 0,
        quantity_to_pick: 2,
        bundle_component_index: 1,
        pick_done: false,
      },
      {
        order_item_id: 52,
        product_id: 102,
        product_name: "B",
        quantity_required: 1,
        quantity_picked: 1,
        quantity_to_pick: 0,
        bundle_component_index: 2,
        pick_done: true,
      },
      {
        order_item_id: 53,
        product_id: 103,
        product_name: "C",
        quantity_required: 1,
        quantity_picked: 0,
        quantity_to_pick: 1,
        bundle_component_index: 3,
        pick_done: false,
      },
    ],
    bundle_verified: false,
    traceability_links: {},
    return_tree_order_ids: [],
    ...overrides,
  };
}

describe("isStockBundleMode", () => {
  it("detects STOCK_PRODUCTION", () => {
    expect(isStockBundleMode("STOCK_PRODUCTION")).toBe(true);
  });
  it("rejects ON_DEMAND", () => {
    expect(isStockBundleMode("ON_DEMAND_ASSEMBLY")).toBe(false);
  });
});

describe("bundleDisplayTitle", () => {
  it("uses bundle name", () => {
    expect(bundleDisplayTitle("Promo X")).toBe("Promo X");
  });
  it("fallback Pakiet promocyjny", () => {
    expect(bundleDisplayTitle("")).toBe("Pakiet promocyjny");
  });
});

describe("buildPickingBundleDisplay", () => {
  it("ON_DEMAND shows components with index", () => {
    const d = buildPickingBundleDisplay(onDemandScan());
    expect(d?.mode).toBe("ON_DEMAND");
    expect(d?.title).toBe("Promo");
    expect(d?.subtitle).toContain("3 składniki");
    expect(d?.components).toHaveLength(3);
    expect(d?.components[0].index).toBe(1);
    expect(d?.doneCount).toBe(1);
    expect(d?.totalCount).toBe(3);
  });

  it("STOCK mode minimal display", () => {
    const d = buildPickingBundleDisplay(
      onDemandScan({
        bundle_fulfillment_mode: "STOCK_PRODUCTION",
        action: "pick_stock_line",
        missing_components: [],
      }),
    );
    expect(d?.mode).toBe("STOCK");
    expect(d?.components).toHaveLength(0);
  });

  it("null when not found", () => {
    expect(buildPickingBundleDisplay(onDemandScan({ found: false }))).toBeNull();
  });
});

describe("pickingBundleProgressLabel", () => {
  it("ON_DEMAND fraction", () => {
    const d = buildPickingBundleDisplay(onDemandScan());
    expect(d && pickingBundleProgressLabel(d)).toBe("1/3");
  });
});

describe("packingBundleVerifiedMessage", () => {
  it("verified bundle", () => {
    expect(
      packingBundleVerifiedMessage(
        onDemandScan({ domain: "packing", action: "verify_bundle", bundle_verified: true }),
      ),
    ).toBe("Bundle zweryfikowany");
  });
  it("stock pack line", () => {
    expect(
      packingBundleVerifiedMessage(
        onDemandScan({ domain: "packing", action: "pack_stock_line", bundle_fulfillment_mode: "STOCK_PRODUCTION" }),
      ),
    ).toBe("Bundle SKU spakowany");
  });
  it("incomplete", () => {
    expect(
      packingBundleVerifiedMessage(onDemandScan({ domain: "packing", action: "components_incomplete" })),
    ).toBe("Nie wszystkie składniki zebrane");
  });
});

describe("shouldShowBundleVerifiedBadge", () => {
  it("true when verified", () => {
    expect(
      shouldShowBundleVerifiedBadge(onDemandScan({ action: "verify_bundle", bundle_verified: true })),
    ).toBe(true);
  });
  it("false when incomplete", () => {
    expect(shouldShowBundleVerifiedBadge(onDemandScan({ action: "components_incomplete" }))).toBe(false);
  });
});

describe("bundleTraceabilityEntries", () => {
  it("maps known keys", () => {
    const rows = bundleTraceabilityEntries({
      bundle_lots: "/lots",
      recall_report: "/recall",
      returns_tree: null,
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].label).toBe("Partie bundle");
  });
});

describe("consolidationRackHeading", () => {
  it("stock finished bundle", () => {
    const rows: ConsolidationRackBundleRowOut[] = [
      {
        order_id: 1,
        order_number: "A",
        bundle_id: 1,
        bundle_name: "P",
        fulfillment_mode: "STOCK_PRODUCTION",
        display_mode: "stock_finished_bundle",
        quantity: 1,
      },
    ];
    expect(consolidationRackHeading(rows)).toBe("Pakiet promocyjny");
  });
  it("on demand components", () => {
    const rows: ConsolidationRackBundleRowOut[] = [
      {
        order_id: 1,
        order_number: "A",
        bundle_id: 1,
        bundle_name: "P",
        fulfillment_mode: "ON_DEMAND_ASSEMBLY",
        display_mode: "on_demand_component",
        quantity: 2,
        product_name: "X",
      },
    ];
    expect(consolidationRackHeading(rows)).toBe("Składniki zestawu");
  });
});

describe("returnsBundleOrderIds", () => {
  it("filters valid ids", () => {
    expect(returnsBundleOrderIds(onDemandScan({ return_tree_order_ids: [1, 0, 2] }))).toEqual([1, 2]);
  });
});

describe("isBundleBarcodeResolve", () => {
  it("bundle id", () => {
    expect(isBundleBarcodeResolve({ found: true, barcode: "x", bundle_id: 5 })).toBe(true);
  });
  it("stock sku flag", () => {
    expect(isBundleBarcodeResolve({ found: true, barcode: "x", is_stock_logistic_sku: true })).toBe(true);
  });
  it("plain product", () => {
    expect(isBundleBarcodeResolve({ found: true, barcode: "x", product_id: 9 })).toBe(false);
  });
});

describe("bulkScanLog", () => {
  it("creates ok entry", () => {
    const e = bulkScanLogEntry("5901", true, "OK");
    expect(e.status).toBe("ok");
    expect(e.barcode).toBe("5901");
  });
  it("append caps list", () => {
    const a = bulkScanLogEntry("1", true, "a");
    const b = bulkScanLogEntry("2", false, "b");
    const merged = appendBulkScanLog([a], b, 10);
    expect(merged[0].barcode).toBe("2");
    expect(merged[1].barcode).toBe("1");
  });
});
