import { describe, expect, it } from "vitest";
import {
  formatOrderEventKeyFallback,
  getOrderEventDisplay,
  getOrderEventLabel,
} from "./orderEventLabels";
import { UNKNOWN_EVENT_LABEL } from "./eventDisplayLabels";

describe("orderEventLabels", () => {
  it("maps known WMS codes to Polish", () => {
    expect(getOrderEventLabel("PICKED_ITEM")).toBe("Zebrano produkt");
    expect(getOrderEventLabel("ORDER_LINE_SHORTAGE_REPORTED")).toBe("Zgłoszono brak");
    expect(getOrderEventLabel("OMS_DECISION_ACCEPTED")).toBe("Zaakceptowano decyzję OMS");
  });

  it("fallback never uses English title-case", () => {
    expect(formatOrderEventKeyFallback("ORDER_LINE_SHORTAGE_REPORTED")).toBe(UNKNOWN_EVENT_LABEL);
    expect(getOrderEventLabel("CUSTOM_FUTURE_EVENT")).toBe(UNKNOWN_EVENT_LABEL);
  });

  it("display includes icon and category", () => {
    const d = getOrderEventDisplay("ORDER_ITEM_REMOVED");
    expect(d.label).toBe("Usunięto pozycję");
    expect(d.icon).toBe("🔴");
    expect(d.category).toBe("order_change");
  });
});
