import { describe, expect, it } from "vitest";
import {
  canOfferAllOrderTypes,
  canResumePickingSession,
  cartTypeHintForOrderTypeChoice,
  modeRequiresCartScan,
  needsCartAfterOrderTypeChoice,
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
});

describe("visibleOrderTypeChoices / canOfferAll", () => {
  it("shows single+multi+all when both modes share cart gate AND cart type", () => {
    expect(visibleOrderTypeChoices("cart_scan", "cart_scan")).toEqual(["single", "multi", "all"]);
    expect(canOfferAllOrderTypes("cart_scan", "cart_scan")).toBe(true);
    expect(visibleOrderTypeChoices("cart_no_scan", "mobile")).toEqual(["single", "multi", "all"]);
  });

  it("hides all when cart gates or cart types differ", () => {
    expect(canOfferAllOrderTypes("cart_scan", "cart_no_scan")).toBe(false);
    expect(visibleOrderTypeChoices("cart_scan", "cart_no_scan")).toEqual(["single", "multi"]);
    expect(canOfferAllOrderTypes("cart_scan", "baskets")).toBe(false);
    expect(visibleOrderTypeChoices("cart_scan", "baskets")).toEqual(["single", "multi"]);
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

  it("all with same cart_scan → cart BULK", () => {
    expect(needsCartAfterOrderTypeChoice("cart_scan", "cart_scan", "all")).toBe(true);
    expect(cartTypeHintForOrderTypeChoice("cart_scan", "cart_scan", "all")).toBe("BULK");
    expect(modeRequiresCartScan("mobile")).toBe(false);
  });

  it("mixed baskets+cart_scan — all hint is null (all not offered)", () => {
    expect(cartTypeHintForOrderTypeChoice("cart_scan", "baskets", "all")).toBeNull();
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
