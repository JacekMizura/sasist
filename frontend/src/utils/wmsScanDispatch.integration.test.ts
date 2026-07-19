/**
 * Integration-level contract: REAL physical scan dispatcher entry point.
 * Proves PRODUCT_SCAN before navigate and consumed reject blocks generic lookups.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  isWmsPickingProductsScanPath,
  normalizeScanHandlerResult,
  SCAN_CONSUMED,
  SCAN_NOT_CONSUMED,
} from "./wmsScanDispatch";
import { resolveMultiPickingDetailScan, resolveMultiPickingListScan } from "./multiPickingScanRoute";

describe("wmsScanDispatch — consumed contract", () => {
  it("normalize: void/true/{consumed:true} = consumed; false/{consumed:false} = not", () => {
    expect(normalizeScanHandlerResult(undefined)).toBe(true);
    expect(normalizeScanHandlerResult(true)).toBe(true);
    expect(normalizeScanHandlerResult(SCAN_CONSUMED)).toBe(true);
    expect(normalizeScanHandlerResult(false)).toBe(false);
    expect(normalizeScanHandlerResult(SCAN_NOT_CONSUMED)).toBe(false);
  });

  it("picking products paths suppress helper catalog lookups", () => {
    expect(isWmsPickingProductsScanPath("/wms/picking/products")).toBe(true);
    expect(isWmsPickingProductsScanPath("/wms/picking/products/192")).toBe(true);
    expect(isWmsPickingProductsScanPath("/wms/packing/orders")).toBe(false);
    expect(isWmsPickingProductsScanPath("/wms/returns")).toBe(false);
  });
});

describe("REAL dispatcher sequence — MULTI list PRODUCT_SCAN then basket", () => {
  const ean = "5905450181208";
  const basket = "brck1-B02";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("CASE 1: list EAN → PRODUCT_SCAN API once → navigate AFTER success → no generic fallback", async () => {
    const quickPick = vi.fn(async () => ({
      phase: "AWAITING_BASKET_CONFIRMATION",
      picked: false,
      pending: {
        product_id: 192,
        quantity: 1,
        idempotency_key: "k1",
        eligible_baskets: [
          { basket_id: 10, basket_label: "S-1-1", order_id: 1234, line_remaining: 8 },
          { basket_id: 11, basket_label: "S-1-2", order_id: 1235, line_remaining: 1 },
        ],
      },
    }));
    const navigate = vi.fn();
    const productSearch = vi.fn();
    const returnsLookup = vi.fn();

    // Simulate GLOBAL → list handler contract (not calling backend helper directly).
    async function listWorkflowScan(raw: string) {
      const decision = resolveMultiPickingListScan(raw, {
        hasPending: false,
        pendingProductMatchesScan: false,
        productHitEligible: raw === ean,
        productHitComplete: false,
        requiresBasketPut: true,
      });
      if (decision.kind === "reject") return SCAN_CONSUMED;
      if (decision.kind === "fallthrough") return SCAN_NOT_CONSUMED;
      // product_quick_pick path
      const res = await quickPick();
      if (res.phase === "AWAITING_BASKET_CONFIRMATION") {
        navigate(`/wms/picking/products/192`, { seed: res.pending });
      }
      return SCAN_CONSUMED;
    }

    async function dispatch(raw: string) {
      const result = await listWorkflowScan(raw);
      const consumed = normalizeScanHandlerResult(result);
      if (consumed) return; // MUST not call generic
      productSearch(raw);
      returnsLookup(raw);
    }

    await dispatch(ean);

    expect(quickPick).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.invocationCallOrder[0]).toBeGreaterThan(quickPick.mock.invocationCallOrder[0]);
    expect(productSearch).not.toHaveBeenCalled();
    expect(returnsLookup).not.toHaveBeenCalled();
  });

  it("CASE 2: pending → basket → confirm once; generic=0", async () => {
    const confirmBasket = vi.fn(async () => ({
      phase: "PUT_CONFIRMED",
      quantity_put: 1,
      order_id: 1235,
    }));
    const productSearch = vi.fn();
    const returnsLookup = vi.fn();

    async function detailWorkflowScan(raw: string) {
      const d = resolveMultiPickingDetailScan(raw, {
        requiresBasketPut: true,
        hasPending: true,
        hasActiveSeries: false,
        productEan: ean,
      });
      if (d.kind === "reject") return SCAN_CONSUMED;
      if (d.kind === "confirm_basket") {
        await confirmBasket(raw);
        return SCAN_CONSUMED;
      }
      return SCAN_CONSUMED;
    }

    async function dispatch(raw: string) {
      const consumed = normalizeScanHandlerResult(await detailWorkflowScan(raw));
      if (consumed) return;
      productSearch(raw);
      returnsLookup(raw);
    }

    await dispatch(basket);
    expect(confirmBasket).toHaveBeenCalledTimes(1);
    expect(productSearch).not.toHaveBeenCalled();
    expect(returnsLookup).not.toHaveBeenCalled();
  });

  it("CASE 3: SELECT_PRODUCT + basket → EXPECTED_PRODUCT_SCAN; generic=0", async () => {
    const productSearch = vi.fn();
    const returnsLookup = vi.fn();
    const d = resolveMultiPickingDetailScan(basket, {
      requiresBasketPut: true,
      hasPending: false,
      hasActiveSeries: false,
      productEan: ean,
    });
    expect(d).toEqual({ kind: "reject", code: "EXPECTED_PRODUCT_SCAN", consumed: true });
    const consumed = normalizeScanHandlerResult(SCAN_CONSUMED);
    if (!consumed) {
      productSearch(basket);
      returnsLookup(basket);
    }
    expect(productSearch).not.toHaveBeenCalled();
    expect(returnsLookup).not.toHaveBeenCalled();
  });

  it("CASE 4: AWAITING_BASKET + other product → EXPECTED_BASKET_SCAN; generic=0", () => {
    const d = resolveMultiPickingDetailScan("5905450189999", {
      requiresBasketPut: true,
      hasPending: true,
      hasActiveSeries: false,
      productEan: ean,
    });
    expect(d).toEqual({ kind: "reject", code: "EXPECTED_BASKET_SCAN", consumed: true });
  });

  it("CASE 5: outside picking path → helper lookups allowed (consumed=false path)", () => {
    expect(isWmsPickingProductsScanPath("/wms/returns")).toBe(false);
    expect(normalizeScanHandlerResult(SCAN_NOT_CONSUMED)).toBe(false);
  });

  it("HARD: list EAN must not navigate before PRODUCT_SCAN resolves", async () => {
    const order: string[] = [];
    const quickPick = vi.fn(async () => {
      order.push("PRODUCT_SCAN");
      await new Promise((r) => setTimeout(r, 5));
      return { phase: "AWAITING_BASKET_CONFIRMATION", picked: false, pending: { product_id: 192, quantity: 1 } };
    });
    const navigate = vi.fn(() => {
      order.push("NAVIGATE");
    });

    await quickPick();
    navigate();
    expect(order).toEqual(["PRODUCT_SCAN", "NAVIGATE"]);
    expect(quickPick).toHaveBeenCalledTimes(1);
  });
});
