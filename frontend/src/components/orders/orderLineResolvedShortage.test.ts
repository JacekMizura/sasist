import { describe, expect, it } from "vitest";
import {
  findResolvedShortageForOrderLine,
  isResolvedShortageRemovedLine,
  resolvedShortageBadgeLabel,
} from "./orderLineResolvedShortage";

describe("orderLineResolvedShortage", () => {
  it("matches history by order_item_id", () => {
    const meta = findResolvedShortageForOrderLine({
      orderItemId: 42,
      productName: "Widget",
      sku: "W-1",
      history: [
        {
          kind: "order_line_removed",
          at: "2026-05-10T12:00:00Z",
          order_item_id: 42,
          product_name: "Other",
          lines: ["Powód: brak magazynowy", "przez: Jan Kowalski"],
        },
      ],
    });
    expect(meta?.kind).toBe("order_line_removed");
    expect(meta?.reason).toBe("brak magazynowy");
    expect(meta?.resolvedBy).toBe("Jan Kowalski");
    expect(meta?.fullyRemovedFromOrder).toBe(true);
  });

  it("treats zero-qty line with order_line_removed history as resolved removed", () => {
    const meta = findResolvedShortageForOrderLine({
      orderItemId: 7,
      productName: "Cat food",
      history: [{ kind: "order_line_removed", at: "2026-05-01", order_item_id: 7 }],
    });
    expect(
      isResolvedShortageRemovedLine({
        quantity: 0,
        resolved: meta,
        shortageDisplayKind: "resolved",
      }),
    ).toBe(true);
  });

  it("uses removal badge label for fully removed lines", () => {
    expect(
      resolvedShortageBadgeLabel({
        kind: "order_line_removed",
        resolvedAt: "",
        removedQty: 2,
        quantityBefore: 2,
        reason: "brak magazynowy",
        resolvedBy: null,
        fullyRemovedFromOrder: true,
      }),
    ).toBe("USUNIĘTO PRZEZ BRAK MAGAZYNOWY");
  });
});
