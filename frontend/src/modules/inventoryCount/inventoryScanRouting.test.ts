import { describe, expect, it, vi } from "vitest";

import { performScannerHelperScan } from "../../utils/scannerHelperDispatch";
import { SCAN_CONSUMED } from "../../utils/wmsScanDispatch";
import { classifyWmsScanCode } from "../../utils/wmsScanClassify";
import {
  INVENTORY_SCAN_NEED_LOCATION,
  inventoryScanReceiverLabel,
  isProductLikeCodeOnLocationStep,
  isWmsInventoryCountPath,
  isWmsInventoryLocationStepPath,
  isWmsInventoryTerminalPath,
  shouldAttemptLocationSwitchOnProductStep,
} from "./inventoryScanRouting";
import { routeInventoryScan } from "./inventoryScanRoute";

const LOC = "A-01-02";
const EAN = "5905450181208";
const SKU_LIKE = "SKU-ABC-99";
const ENTRY_PATH = "/wms/inventory-count/d/42";
const TERM_PATH = "/wms/inventory-count/d/42/count/7";
const PICK_PATH = "/wms/picking/products";

describe("inventory scan routing (A–G)", () => {
  it("A: location-step + location code → confirm_location", () => {
    expect(routeInventoryScan({ step: "location", code: LOC, hasTask: true })).toEqual({
      action: "confirm_location",
    });
    expect(classifyWmsScanCode(LOC)).toBe("location_like");
  });

  it("B: location-step + product EAN → reject need location", () => {
    const r = routeInventoryScan({ step: "location", code: EAN, hasTask: true });
    expect(r).toEqual({
      action: "reject_need_location",
      message: INVENTORY_SCAN_NEED_LOCATION,
    });
    expect(isProductLikeCodeOnLocationStep(EAN)).toBe(true);
  });

  it("C: product-step + EAN → count_product", () => {
    expect(routeInventoryScan({ step: "product", code: EAN, hasTask: true })).toEqual({
      action: "count_product",
    });
  });

  it("D: repeated EAN stays count_product (qty handled by terminal commit)", () => {
    expect(routeInventoryScan({ step: "product", code: EAN, hasTask: true }).action).toBe(
      "count_product",
    );
    expect(routeInventoryScan({ step: "product", code: EAN, hasTask: true }).action).toBe(
      "count_product",
    );
  });

  it("E: SKU-like on product step attempts location switch first (then product fallback)", () => {
    expect(shouldAttemptLocationSwitchOnProductStep(SKU_LIKE)).toBe(true);
    expect(routeInventoryScan({ step: "product", code: SKU_LIKE, hasTask: true })).toEqual({
      action: "try_location_switch",
    });
  });

  it("F: unknown product is count_product path (error contract in barcode resolve)", () => {
    expect(routeInventoryScan({ step: "product", code: "0000000000000", hasTask: true }).action).toBe(
      "count_product",
    );
  });

  it("G: another location on product step → try_location_switch", () => {
    expect(routeInventoryScan({ step: "product", code: "B-12-03", hasTask: true })).toEqual({
      action: "try_location_switch",
    });
  });
});

describe("inventory paths + receiver label (I)", () => {
  it("recognizes inventory paths", () => {
    expect(isWmsInventoryCountPath(ENTRY_PATH)).toBe(true);
    expect(isWmsInventoryLocationStepPath(ENTRY_PATH)).toBe(true);
    expect(isWmsInventoryTerminalPath(TERM_PATH)).toBe(true);
    expect(isWmsInventoryCountPath(PICK_PATH)).toBe(false);
  });

  it("I: with handler → Inwentaryzacja; without → Brak aktywnego odbiorcy", () => {
    expect(inventoryScanReceiverLabel(true)).toBe("Inwentaryzacja");
    expect(inventoryScanReceiverLabel(false)).toBe("Brak aktywnego odbiorcy");
  });
});

describe("Scanner Helper = global dispatch (H, J, K)", () => {
  it("H: Helper dispatch invokes the same registered inventory handler", async () => {
    const calls: string[] = [];
    const handler = vi.fn(async (raw: string) => {
      calls.push(raw);
      return SCAN_CONSUMED;
    });

    const catalog = vi.fn();
    const out = await performScannerHelperScan({
      rawCode: EAN,
      pathname: ENTRY_PATH,
      handler,
      onGenericCatalogLookup: catalog,
    });

    expect(handler).toHaveBeenCalledWith(EAN);
    expect(calls).toEqual([EAN]);
    expect(out.consumed).toBe(true);
    expect(out.allowGenericCatalog).toBe(false);
    expect(catalog).not.toHaveBeenCalled();
  });

  it("J: null handler after unregister → no inventory consume", async () => {
    const catalog = vi.fn();
    const out = await performScannerHelperScan({
      rawCode: LOC,
      pathname: ENTRY_PATH,
      handler: null,
      onGenericCatalogLookup: catalog,
    });
    expect(out.hadHandler).toBe(false);
    expect(out.allowGenericCatalog).toBe(true);
    expect(catalog).toHaveBeenCalledWith(LOC);
  });

  it("K: after switching path, old picking handler must not receive inventory scan", async () => {
    const pickingHandler = vi.fn(async () => SCAN_CONSUMED);
    const inventoryHandler = vi.fn(async () => SCAN_CONSUMED);

    await performScannerHelperScan({
      rawCode: EAN,
      pathname: PICK_PATH,
      handler: pickingHandler,
    });
    expect(pickingHandler).toHaveBeenCalledTimes(1);

    await performScannerHelperScan({
      rawCode: LOC,
      pathname: ENTRY_PATH,
      handler: inventoryHandler,
    });
    expect(inventoryHandler).toHaveBeenCalledWith(LOC);
    expect(pickingHandler).toHaveBeenCalledTimes(1);
  });
});

describe("L: non-inventory paths stay outside inventory helpers", () => {
  it("receiving/picking/putaway are not inventory count paths", () => {
    expect(isWmsInventoryCountPath("/wms/receiving")).toBe(false);
    expect(isWmsInventoryCountPath("/wms/picking/products")).toBe(false);
    expect(isWmsInventoryCountPath("/wms/putaway/12")).toBe(false);
  });
});
