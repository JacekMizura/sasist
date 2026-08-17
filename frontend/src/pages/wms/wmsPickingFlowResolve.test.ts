import { describe, expect, it } from "vitest";
import {
  AFTER_BATCH_NO_ORDERS_MESSAGE,
  canOfferAllOrderTypes,
  canResumePickingSession,
  cartTypeHintForOrderTypeChoice,
  modeRequiresCartScan,
  needsCartAfterOrderTypeChoice,
  resolveAfterBatchComplete,
  resolveAfterOrderTypeChoice,
  resolveAfterStatusWithConfig,
  visibleOrderTypeChoices,
} from "./wmsPickingFlowResolve";
import type { WmsPickingSessionState } from "./wmsPickingFlowTypes";
import { WMS_ROUTES } from "./wmsRoutes";

const baseSession = (): WmsPickingSessionState => ({
  orderUiStatusId: 6,
  orderUiStatusName: "Wózki",
  orderUiStatusColor: "#3366ff",
  mainGroup: "IN_PROGRESS",
  singleMode: "cart_scan",
  multiMode: "baskets",
  allMode: "cart_scan",
  allOrderSort: "location",
});

describe("visibleOrderTypeChoices / canOfferAll", () => {
  it("always shows single+multi+all when both modes are configured", () => {
    expect(visibleOrderTypeChoices("cart_scan", "cart_scan", "cart_scan")).toEqual([
      "single",
      "multi",
      "all",
    ]);
    expect(canOfferAllOrderTypes("cart_scan", "cart_scan")).toBe(true);
    expect(visibleOrderTypeChoices("cart_no_scan", "mobile", "cart_no_scan")).toEqual([
      "single",
      "multi",
      "all",
    ]);
    // Mixed cart families — all still offered; uses dedicated allMode
    expect(visibleOrderTypeChoices("cart_scan", "baskets", "baskets")).toEqual([
      "single",
      "multi",
      "all",
    ]);
    expect(visibleOrderTypeChoices("cart_scan", "cart_no_scan")).toEqual(["single", "multi", "all"]);
  });
});

describe("resolveAfterStatusWithConfig", () => {
  it("routes to order-type for new tour even when modes require cart", () => {
    const s = baseSession();
    s.singleMode = "cart_scan";
    s.multiMode = "cart_scan";
    s.requireCart = true;
    s.cartType = "BULK";
    const t = resolveAfterStatusWithConfig(s);
    expect(t.path).toBe(WMS_ROUTES.pickingOrderType);
    expect(t.state.pickingSession.cartId).toBeNull();
    expect(t.state.pickingSession.orderTypeChoice).toBeUndefined();
  });

  it("does not skip order-type because a free/stale cart id is present without order_type", () => {
    const s = baseSession();
    s.singleMode = "cart_scan";
    s.multiMode = "cart_scan";
    s.cartId = 99;
    s.cartCode = "FREE";
    const t = resolveAfterStatusWithConfig(s);
    expect(t.path).toBe(WMS_ROUTES.pickingOrderType);
    expect(t.state.pickingSession.cartId).toBeNull();
  });

  it("resumes directly to products when active cart + order_type are set", () => {
    const s = baseSession();
    s.singleMode = "cart_scan";
    s.multiMode = "cart_scan";
    s.cartId = 123;
    s.cartCode = "120X80";
    s.physicalCartType = "bulk";
    s.orderTypeChoice = "all";
    expect(canResumePickingSession(s)).toBe(true);
    const t = resolveAfterStatusWithConfig(s);
    expect(t.path).toBe(WMS_ROUTES.pickingProducts);
    expect(t.state.pickingSession.cartId).toBe(123);
    expect(t.state.pickingSession.orderTypeChoice).toBe("all");
  });

  it("resumes cartless session with order_type to products", () => {
    const s = baseSession();
    s.singleMode = "cart_no_scan";
    s.multiMode = "cart_no_scan";
    s.cartless = true;
    s.pickingSessionId = 55;
    s.orderTypeChoice = "single";
    const t = resolveAfterStatusWithConfig(s);
    expect(t.path).toBe(WMS_ROUTES.pickingProducts);
    expect(t.state.pickingSession.orderTypeChoice).toBe("single");
  });
});

describe("resolveAfterOrderTypeChoice", () => {
  it("cart_scan single → cart with BULK hint and back to order-type", () => {
    const s = baseSession();
    s.singleMode = "cart_scan";
    s.multiMode = "cart_no_scan";
    const t = resolveAfterOrderTypeChoice(s, "single");
    expect(t.path).toBe(WMS_ROUTES.pickingCart);
    expect(t.state.pickingSession.orderTypeChoice).toBe("single");
    expect(t.state.pickingSession.requireCart).toBe(true);
    expect(t.state.pickingSession.cartType).toBe("BULK");
    expect(t.state.pickingSession.preCartBack).toBe("order-type");
    expect(t.state.pickingSession.cartId).toBeNull();
  });

  it("cart_no_scan multi → products without cart", () => {
    const s = baseSession();
    s.singleMode = "cart_scan";
    s.multiMode = "cart_no_scan";
    const t = resolveAfterOrderTypeChoice(s, "multi");
    expect(t.path).toBe(WMS_ROUTES.pickingProducts);
    expect(t.state.pickingSession.orderTypeChoice).toBe("multi");
    expect(t.state.pickingSession.requireCart).toBe(false);
    expect(t.state.pickingSession.cartId).toBeNull();
  });

  it("all uses dedicated allMode for cart gate and allOrderSort", () => {
    const s = baseSession();
    s.singleMode = "cart_no_scan";
    s.multiMode = "cart_no_scan";
    s.allMode = "baskets";
    s.orderSort = "date";
    s.allOrderSort = "location";
    expect(needsCartAfterOrderTypeChoice("cart_no_scan", "cart_no_scan", "all", "baskets")).toBe(true);
    expect(cartTypeHintForOrderTypeChoice("cart_no_scan", "cart_no_scan", "all", "baskets")).toBe(
      "BASKETS",
    );
    const t = resolveAfterOrderTypeChoice(s, "all");
    expect(t.path).toBe(WMS_ROUTES.pickingCart);
    expect(t.state.pickingSession.cartType).toBe("BASKETS");
    expect(t.state.pickingSession.orderSort).toBe("location");
    expect(modeRequiresCartScan("mobile")).toBe(false);
  });

  it("never skips cart scan just because a cart id was left on session", () => {
    const s = baseSession();
    s.singleMode = "cart_scan";
    s.multiMode = "cart_scan";
    s.cartId = 42;
    s.cartCode = "WZ-03";
    s.physicalCartType = "bulk";
    const t = resolveAfterOrderTypeChoice(s, "single");
    expect(t.path).toBe(WMS_ROUTES.pickingCart);
    expect(t.state.pickingSession.cartId).toBeNull();
  });

  it("baskets multi → cart with BASKETS hint", () => {
    const s = baseSession();
    s.singleMode = "cart_no_scan";
    s.multiMode = "baskets";
    const t = resolveAfterOrderTypeChoice(s, "multi");
    expect(t.path).toBe(WMS_ROUTES.pickingCart);
    expect(t.state.pickingSession.cartType).toBe("BASKETS");
    expect(t.state.pickingSession.orderTypeChoice).toBe("multi");
  });
});

describe("resolveAfterBatchComplete", () => {
  it("B) missing action defaults to back_to_list → order-type", () => {
    const t = resolveAfterBatchComplete({
      action: undefined,
      session: baseSession(),
      orderType: "single",
    });
    expect(t).toEqual({
      kind: "navigate",
      path: WMS_ROUTES.pickingOrderType,
      state: expect.objectContaining({
        pickingSession: expect.objectContaining({ orderTypeChoice: undefined }),
        postTourMessage: null,
      }),
    });
  });

  it("C) back_to_list → /wms/picking/order-type", () => {
    const t = resolveAfterBatchComplete({
      action: "back_to_list",
      session: baseSession(),
      orderType: "multi",
      postTourMessage: "Oznaczono część zamówień jako zebrane.",
    });
    expect(t.kind).toBe("navigate");
    if (t.kind !== "navigate") return;
    expect(t.path).toBe(WMS_ROUTES.pickingOrderType);
    expect(t.state.afterBatchAssign).toBeUndefined();
    expect(t.state.stayHereComplete).toBeUndefined();
    expect(t.state.postTourMessage).toBe("Oznaczono część zamówień jako zebrane.");
  });

  it("D) stay_here → success kind, no navigate", () => {
    const t = resolveAfterBatchComplete({
      action: "stay_here",
      session: baseSession(),
      orderType: "all",
    });
    expect(t).toEqual({ kind: "stay_here" });
  });

  it("E) assign_new_batch cart_no_scan → products + afterBatchAssign", () => {
    const s = baseSession();
    s.singleMode = "cart_no_scan";
    s.multiMode = "cart_no_scan";
    s.allMode = "cart_no_scan";
    const t = resolveAfterBatchComplete({
      action: "assign_new_batch",
      session: s,
      orderType: "single",
    });
    expect(t.kind).toBe("navigate");
    if (t.kind !== "navigate") return;
    expect(t.path).toBe(WMS_ROUTES.pickingProducts);
    expect(t.state.afterBatchAssign).toBe(true);
    expect(t.state.pickingSession.orderTypeChoice).toBe("single");
    expect(t.state.pickingSession.pickingSessionId).toBeNull();
    expect(t.state.pickingSession.cartless).toBe(true);
  });

  it("E2) assign_new_batch cart_scan → cart + afterBatchAssign", () => {
    const s = baseSession();
    s.singleMode = "cart_scan";
    s.multiMode = "baskets";
    const t = resolveAfterBatchComplete({
      action: "assign_new_batch",
      session: s,
      orderType: "single",
    });
    expect(t.kind).toBe("navigate");
    if (t.kind !== "navigate") return;
    expect(t.path).toBe(WMS_ROUTES.pickingCart);
    expect(t.state.afterBatchAssign).toBe(true);
    expect(t.state.pickingSession.requireCart).toBe(true);
  });

  it("keeps the no-orders operator copy", () => {
    expect(AFTER_BATCH_NO_ORDERS_MESSAGE).toBe("Brak kolejnych zamówień do zebrania.");
  });
});
