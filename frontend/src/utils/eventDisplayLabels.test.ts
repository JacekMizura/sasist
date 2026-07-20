import { describe, expect, it } from "vitest";
import {
  EVENT_DISPLAY_LABELS,
  UNKNOWN_EVENT_LABEL,
  getEventDisplayLabel,
  resolveEventDisplayLabel,
} from "./eventDisplayLabels";
import { formatOrderEventKeyFallback, getOrderEventLabel } from "./orderEventLabels";

/** Screen: Historia czynności — must never show these English raw forms. */
const HISTORY_SCREEN_CODES = [
  "cart_released",
  "order_packed",
  "first_product_confirmed",
  "orders_assigned",
  "admin_orders_detached",
  "admin_cart_released",
  "cart_auto_released_idle",
] as const;

const FORBIDDEN_UI_SNIPPETS = [
  "CART RELEASED",
  "ORDER PACKED",
  "FIRST PRODUCT CONFIRMED",
  "ORDERS ASSIGNED",
  "ADMIN ORDERS DETACHED",
  "ADMIN CART RELEASED",
  "CART AUTO RELEASED IDLE",
  "Cart Released",
  "Order Packed",
];

describe("eventDisplayLabels SSOT", () => {
  it("maps Historia czynności cart events to Polish (not English title-case)", () => {
    for (const code of HISTORY_SCREEN_CODES) {
      const label = getEventDisplayLabel(code);
      expect(label).not.toBe(UNKNOWN_EVENT_LABEL);
      expect(label).toMatch(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻa-zą]/);
      const upper = label.toUpperCase();
      for (const bad of FORBIDDEN_UI_SNIPPETS) {
        expect(upper).not.toBe(bad);
        expect(label).not.toBe(bad);
      }
    }
  });

  it("specific labels match warehouse Polish", () => {
    expect(getEventDisplayLabel("CART_RELEASED")).toBe("Zwolniono wózek");
    expect(getEventDisplayLabel("order_packed")).toBe("Spakowano zamówienie");
    expect(getEventDisplayLabel("first_product_confirmed")).toBe("Potwierdzono pierwszy produkt");
    expect(getEventDisplayLabel("ORDERS_ASSIGNED")).toBe("Przypisano zamówienia");
    expect(getEventDisplayLabel("admin_orders_detached")).toBe("Odłączono zamówienia");
    expect(getEventDisplayLabel("ADMIN_CART_RELEASED")).toBe(
      "Zwolniono wózek przez administratora",
    );
    expect(getEventDisplayLabel("cart_auto_released_idle")).toBe(
      "Automatycznie zwolniono nieaktywny wózek",
    );
  });

  it("unknown event never shows raw English code", () => {
    expect(getEventDisplayLabel("SOME_NEW_INTERNAL_EVENT")).toBe(UNKNOWN_EVENT_LABEL);
    expect(formatOrderEventKeyFallback("SOME_NEW_INTERNAL_EVENT")).toBe(UNKNOWN_EVENT_LABEL);
    expect(getOrderEventLabel("CUSTOM_FUTURE_EVENT")).toBe(UNKNOWN_EVENT_LABEL);
  });

  it("resolve prefers API Polish label", () => {
    expect(
      resolveEventDisplayLabel({
        eventCode: "cart_released",
        eventDisplayLabel: "Zwolniono wózek",
      }),
    ).toBe("Zwolniono wózek");
  });

  it("every catalog entry is non-empty Polish (no underscore codes as values)", () => {
    for (const [key, label] of Object.entries(EVENT_DISPLAY_LABELS)) {
      expect(label.trim().length).toBeGreaterThan(2);
      expect(label).not.toMatch(/^[A-Z0-9_]+$/);
      expect(key).toMatch(/^[A-Z0-9_]+$/);
    }
  });
});
