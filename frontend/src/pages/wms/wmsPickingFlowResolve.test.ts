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
  it("shows single+multi+all when both modes share cart gate", () => {
    expect(visibleOrderTypeChoices("cart_scan", "baskets")).toEqual(["single", "multi", "all"]);
    expect(canOfferAllOrderTypes("cart_scan", "baskets")).toBe(true);
    expect(visibleOrderTypeChoices("cart_no_scan", "mobile")).toEqual(["single", "multi", "all"]);
  });

  it("hides all when cart gates differ", () => {
    expect(canOfferAllOrderTypes("cart_scan", "cart_no_scan")).toBe(false);
    expect(visibleOrderTypeChoices("cart_scan", "cart_no_scan")).toEqual(["single", "multi"]);
  });
});

describe("resolveAfterStatusWithConfig", () => {
  it("always routes to order-type when modes are configured", () => {
    const s = baseSession();
    s.singleMode = "cart_scan";
    s.multiMode = "cart_scan";
    const t = resolveAfterStatusWithConfig(s);
    expect(t.path).toBe(WMS_ROUTES.pickingOrderType);
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

  it("all with baskets+cart_scan → cart BASKETS", () => {
    expect(needsCartAfterOrderTypeChoice("cart_scan", "baskets", "all")).toBe(true);
    expect(cartTypeHintForOrderTypeChoice("cart_scan", "baskets", "all")).toBe("BASKETS");
    expect(modeRequiresCartScan("mobile")).toBe(false);
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
    expect(t.path).toBe(WMS_ROUTES.pickingCart);
  });
});
