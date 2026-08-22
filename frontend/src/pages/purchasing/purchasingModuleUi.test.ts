import { describe, expect, it } from "vitest";

import { formatProductEanSkuMeta } from "../../modules/purchasing/ui/purchasingProductDisplayMeta";
import { formatAvgDaily, normalizeNumericZero } from "./plan/planFormatters";

describe("planFormatters", () => {
  it("formatAvgDaily — max 2 decimals, zero as 0", () => {
    expect(formatAvgDaily(0)).toBe("0");
    expect(formatAvgDaily(-0)).toBe("0");
    expect(formatAvgDaily(0.0333)).toBe("0,03");
    expect(formatAvgDaily(1.2)).toBe("1,2");
    expect(formatAvgDaily(1.25)).toBe("1,25");
  });

  it("normalizeNumericZero — never negative zero", () => {
    expect(normalizeNumericZero(-0)).toBe(0);
    expect(Object.is(normalizeNumericZero(-0), -0)).toBe(false);
  });
});

describe("formatProductEanSkuMeta", () => {
  it("shows EAN and SKU when both exist", () => {
    expect(formatProductEanSkuMeta("590123", "ABC-1")).toBe("EAN 590123 · SKU ABC-1");
  });

  it("shows only EAN when SKU missing", () => {
    expect(formatProductEanSkuMeta("590123", null)).toBe("EAN 590123");
    expect(formatProductEanSkuMeta("590123", "")).toBe("EAN 590123");
  });

  it("shows only SKU when EAN missing", () => {
    expect(formatProductEanSkuMeta(null, "ABC-1")).toBe("SKU ABC-1");
  });

  it("returns null when both missing", () => {
    expect(formatProductEanSkuMeta(null, null)).toBeNull();
    expect(formatProductEanSkuMeta("", "")).toBeNull();
  });
});

describe("PurchasingProductCell meta", () => {
  it("does not render SKU: — placeholder pattern", () => {
    expect(formatProductEanSkuMeta(null, null)).toBeNull();
  });
});
