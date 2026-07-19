/**
 * Integration: REAL Scanner Helper entry → global dispatch → list workflow.
 * MUST NOT start by calling the list handler in isolation.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  isWmsPickingProductsScanPath,
  normalizeScanHandlerResult,
  SCAN_CONSUMED,
  SCAN_NOT_CONSUMED,
} from "./wmsScanDispatch";
import { resolveMultiPickingDetailScan, resolveMultiPickingListScan } from "./multiPickingScanRoute";
import { performScannerHelperScan } from "./scannerHelperDispatch";
import {
  assertPhysicalScanNavigateAllowed,
  preparePickingProductDetailNavigation,
} from "./pickingProductDetailNav";
import type { WmsPickingSessionState } from "../pages/wms/wmsPickingFlowTypes";

const EAN = "5905450181208";
const BASKET = "brck1-B02";
const LIST_PATH = "/wms/picking/products";

const session: WmsPickingSessionState = {
  orderUiStatusId: 1,
  orderUiStatusName: "Zbieranie",
  orderUiStatusColor: "#000",
  mainGroup: "IN_PROGRESS",
  cartId: 2,
  orderTypeChoice: "all",
};

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
  });
});

describe("PHYSICAL_SCAN hard contract", () => {
  it("blocks navigate when source=physical_scan without quick-pick pending", () => {
    expect(
      assertPhysicalScanNavigateAllowed({
        productId: 192,
        source: "physical_scan",
        caller: "test",
        quickPickCalled: false,
        pendingCreated: false,
      }),
    ).toBe(false);
    expect(
      preparePickingProductDetailNavigation(session, {
        productId: 192,
        source: "physical_scan",
        caller: "test",
        quickPickCalled: true,
        pendingCreated: false,
        basketPutPendingSeed: { product_id: 192, quantity: 1 },
      }),
    ).toBeNull();
  });

  it("allows click without quick-pick", () => {
    const state = preparePickingProductDetailNavigation(session, {
      productId: 192,
      source: "click",
      caller: "list_row_click",
      quickPickCalled: false,
      pendingCreated: false,
    });
    expect(state).not.toBeNull();
    expect(state!.navigationSource).toBe("click");
    expect(state!.basketPutPendingSeed).toBeUndefined();
  });
});

describe("Scanner Helper entry → list PRODUCT_SCAN → navigate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Mirrors list page workflow registered via registerScanHandler —
   * invoked ONLY through performScannerHelperScan (Enter / SKANUJ).
   */
  function buildListWorkflowHandler(deps: {
    quickPick: ReturnType<typeof vi.fn>;
    navigate: ReturnType<typeof vi.fn>;
  }) {
    return async (raw: string) => {
      const decision = resolveMultiPickingListScan(raw, {
        hasPending: false,
        pendingProductMatchesScan: false,
        productHitEligible: raw === EAN,
        productHitComplete: false,
        requiresBasketPut: true,
      });
      if (decision.kind === "reject") return SCAN_CONSUMED;
      if (decision.kind !== "product_quick_pick") return SCAN_NOT_CONSUMED;

      const res = await deps.quickPick({ product_id: 192, ean: raw });
      if (res.phase === "AWAITING_BASKET_CONFIRMATION") {
        const seed = {
          product_id: res.pending.product_id,
          quantity: res.pending.quantity,
          idempotency_key: res.pending.idempotency_key,
          eligible_baskets: res.pending.eligible_baskets,
        };
        const state = preparePickingProductDetailNavigation(session, {
          productId: 192,
          source: "physical_scan",
          caller: "list_product_scan_awaiting_basket",
          rawCode: raw,
          quickPickCalled: true,
          quickPickResponse: res.phase,
          pendingCreated: true,
          listProductScanToken: seed.idempotency_key,
          basketPutPendingSeed: seed,
        });
        if (state) {
          deps.navigate(`/wms/picking/products/192`, { state });
        }
      }
      return SCAN_CONSUMED;
    };
  }

  it("Enter EAN: quick-pick EXACTLY ONCE before navigate; catalog blocked", async () => {
    const callOrder: string[] = [];
    const quickPick = vi.fn(async () => {
      callOrder.push("quick_pick");
      return {
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
      };
    });
    const navigate = vi.fn((_path: string, _opts?: { state?: unknown }) => {
      callOrder.push("navigate");
    });
    const catalogLookup = vi.fn();

    const handler = buildListWorkflowHandler({ quickPick, navigate });

    // REAL entry: Scanner Helper submit/Enter → global dispatch → list handler
    const result = await performScannerHelperScan({
      rawCode: EAN,
      pathname: LIST_PATH,
      handler,
      pickingProductsPath: true,
      onGenericCatalogLookup: catalogLookup,
    });

    expect(result.consumed).toBe(true);
    expect(result.allowGenericCatalog).toBe(false);
    expect(quickPick).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(["quick_pick", "navigate"]);
    expect(catalogLookup).not.toHaveBeenCalled();

    const navState = navigate.mock.calls[0][1].state as {
      navigationSource: string;
      basketPutPendingSeed: { product_id: number };
    };
    expect(navState.navigationSource).toBe("physical_scan");
    expect(navState.basketPutPendingSeed.product_id).toBe(192);
  });

  it("consumed=true blocks independent catalog navigation channel", async () => {
    const navigate = vi.fn();
    const catalogNavigate = vi.fn();
    const quickPick = vi.fn(async () => ({
      phase: "AWAITING_BASKET_CONFIRMATION",
      pending: { product_id: 192, quantity: 1, idempotency_key: "k1", eligible_baskets: [] },
    }));

    const handler = buildListWorkflowHandler({ quickPick, navigate });

    const result = await performScannerHelperScan({
      rawCode: EAN,
      pathname: LIST_PATH,
      handler,
      pickingProductsPath: true,
      onGenericCatalogLookup: (code) => {
        // Second channel must NOT open picking detail independently
        catalogNavigate(`/wms/picking/products/192`, { via: "catalog", code });
      },
    });

    expect(result.consumed).toBe(true);
    expect(catalogNavigate).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("click path: navigate without quick-pick; pending not invented", () => {
    const quickPick = vi.fn();
    const state = preparePickingProductDetailNavigation(session, {
      productId: 192,
      source: "click",
      caller: "list_row_click",
      quickPickCalled: false,
      pendingCreated: false,
    });
    expect(quickPick).toHaveBeenCalledTimes(0);
    expect(state!.navigationSource).toBe("click");
    expect(state!.basketPutPendingSeed).toBeUndefined();
    expect(state!.listProductScanToken).toBeUndefined();
  });

  it("physical_scan without awaiting pending cannot navigate", async () => {
    const navigate = vi.fn();
    const quickPick = vi.fn(async () => ({
      phase: "PUT_CONFIRMED",
      picked: true,
      pending: null,
    }));

    const handler = async (raw: string) => {
      const decision = resolveMultiPickingListScan(raw, {
        hasPending: false,
        pendingProductMatchesScan: false,
        productHitEligible: raw === EAN,
        productHitComplete: false,
        requiresBasketPut: true,
      });
      if (decision.kind === "reject") return SCAN_CONSUMED;
      if (decision.kind !== "product_quick_pick") return SCAN_NOT_CONSUMED;
      const res = await quickPick();
      // Attempt illegal physical_scan navigate without pending
      const state = preparePickingProductDetailNavigation(session, {
        productId: 192,
        source: "physical_scan",
        caller: "illegal",
        rawCode: raw,
        quickPickCalled: true,
        quickPickResponse: res.phase,
        pendingCreated: false,
      });
      if (state) navigate(`/wms/picking/products/192`, { state });
      return SCAN_CONSUMED;
    };

    await performScannerHelperScan({
      rawCode: EAN,
      pathname: LIST_PATH,
      handler,
      pickingProductsPath: true,
    });

    expect(quickPick).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("detail basket after physical_scan pending", () => {
  it("STATE B: basket confirm; generic=0", async () => {
    const confirmBasket = vi.fn(async () => ({
      phase: "PUT_CONFIRMED",
      quantity_put: 1,
      order_id: 1235,
    }));
    const catalogLookup = vi.fn();

    const detailHandler = async (raw: string) => {
      const d = resolveMultiPickingDetailScan(raw, {
        requiresBasketPut: true,
        hasPending: true,
        hasActiveSeries: false,
        productEan: EAN,
      });
      if (d.kind === "reject") return SCAN_CONSUMED;
      if (d.kind === "confirm_basket") {
        await confirmBasket(raw);
        return SCAN_CONSUMED;
      }
      return SCAN_CONSUMED;
    };

    await performScannerHelperScan({
      rawCode: BASKET,
      pathname: "/wms/picking/products/192",
      handler: detailHandler,
      pickingProductsPath: true,
      onGenericCatalogLookup: catalogLookup,
    });

    expect(confirmBasket).toHaveBeenCalledTimes(1);
    expect(catalogLookup).not.toHaveBeenCalled();
  });
});
