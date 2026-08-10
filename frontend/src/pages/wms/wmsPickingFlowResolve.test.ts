import { describe, expect, it } from "vitest";
import {
  canOfferAllOrderTypes,
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
    // cart_scan (BULK) + baskets (BASKETS) — nie mieszaj pod „Wszystkie”
    expect(canOfferAllOrderTypes("cart_scan", "baskets")).toBe(false);
    expect(visibleOrderTypeChoices("cart_scan", "baskets")).toEqual(["single", "multi"]);
  });
});

describe("resolveAfterStatusWithConfig", () => {
  it("routes to order-type when modes configured and no active cart", () => {
    const s = baseSession();
    s.singleMode = "cart_scan";
    s.multiMode = "cart_scan";
    const t = resolveAfterStatusWithConfig(s);
    expect(t.path).toBe(WMS_ROUTES.pickingOrderType);
  });

  it("resumes directly to products when active cart is on session", () => {
    const s = baseSession();
    s.singleMode = "cart_scan";
    s.multiMode = "cart_scan";
    s.cartId = 123;
    s.cartCode = "120X80";
    s.physicalCartType = "bulk";
    s.orderTypeChoice = "all";
    const t = resolveAfterStatusWithConfig(s);
    expect(t.path).toBe(WMS_ROUTES.pickingProducts);
    expect(t.state.pickingSession.cartId).toBe(123);
    expect(t.state.pickingSession.orderTypeChoice).toBe("all");
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

  it("skips cart scan when matching cart already on session", () => {
    const s = baseSession();
    s.singleMode = "cart_scan";
    s.multiMode = "cart_scan";
    s.cartId = 42;
    s.cartCode = "WZ-03";
    s.physicalCartType = "bulk";
    const t = resolveAfterOrderTypeChoice(s, "single");
    expect(t.path).toBe(WMS_ROUTES.pickingProducts);
    expect(t.state.pickingSession.cartId).toBe(42);
  });

  it("still asks for cart when physical type mismatches tile", () => {
    const s = baseSession();
    s.singleMode = "cart_scan";
    s.multiMode = "cart_scan";
    s.cartId = 42;
    s.cartCode = "WK-07";
    s.physicalCartType = "multi";
    const t = resolveAfterOrderTypeChoice(s, "single");
    // Aktywna sesja ma już cartId — zawsze wznów, bez ponownego skanu.
    expect(t.path).toBe(WMS_ROUTES.pickingProducts);
    expect(t.state.pickingSession.cartId).toBe(42);
  });
});
