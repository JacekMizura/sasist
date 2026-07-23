import { describe, expect, it } from "vitest";

import { CartStatus } from "../../../types/cartStatus";

/** Mirror CartCard sectional detection — type MULTI is SSOT. */
function isSectionalCart(type: string | null | undefined, totalBaskets?: number | null) {
  return (
    String(type ?? "")
      .trim()
      .toUpperCase() === "MULTI" ||
    (type == null && totalBaskets != null && totalBaskets > 0)
  );
}

function ordersHeaderLabel(count: number) {
  if (count === 1) return "1 zamówienie";
  if (count >= 2 && count <= 4) return `${count} zamówienia`;
  return `${count} zamówień`;
}

function pickPercent(picked: number, total: number) {
  return total > 0 ? Math.min(100, (picked / total) * 100) : 0;
}

describe("ordinary vs sectional cart UI semantics", () => {
  it("BULK is never sectional even when total_baskets was historically 1", () => {
    expect(isSectionalCart("BULK", 1)).toBe(false);
    expect(isSectionalCart("BULK", 0)).toBe(false);
  });

  it("MULTI is sectional", () => {
    expect(isSectionalCart("MULTI", 24)).toBe(true);
  });

  it("orders label pluralization", () => {
    expect(ordersHeaderLabel(0)).toBe("0 zamówień");
    expect(ordersHeaderLabel(1)).toBe("1 zamówienie");
    expect(ordersHeaderLabel(3)).toBe("3 zamówienia");
    expect(ordersHeaderLabel(5)).toBe("5 zamówień");
  });

  it("pick progress percent without Math.max inflation", () => {
    expect(Math.round(pickPercent(0, 3))).toBe(0);
    expect(Math.round(pickPercent(1, 3))).toBe(33);
    expect(Math.round(pickPercent(2, 3))).toBe(67);
    expect(Math.round(pickPercent(3, 3))).toBe(100);
    // Must not become 4/4 when picked wrongly exceeds total
    expect(pickPercent(4, 3)).toBe(100);
  });

  it("AVAILABLE status still distinct from assignment", () => {
    expect(CartStatus.AVAILABLE).toBe("AVAILABLE");
  });
});
