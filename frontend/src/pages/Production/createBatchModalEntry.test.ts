import { describe, expect, it } from "vitest";

import { isFocusedRecommendationEntry, shouldShowProductCatalog } from "./createBatchModalEntry";

describe("CreateBatchModal focused entry", () => {
  it("hides catalog when opened from a single recommendation", () => {
    expect(
      shouldShowProductCatalog({
        fromSingleRecommendation: true,
        productCatalogOpen: false,
        lineCount: 1,
      }),
    ).toBe(false);
    expect(
      isFocusedRecommendationEntry({
        fromSingleRecommendation: true,
        productCatalogOpen: false,
        lineCount: 1,
      }),
    ).toBe(true);
  });

  it("shows catalog for manual / mass batch create", () => {
    expect(
      shouldShowProductCatalog({
        fromSingleRecommendation: false,
        productCatalogOpen: true,
        lineCount: 0,
      }),
    ).toBe(true);
    expect(
      shouldShowProductCatalog({
        fromSingleRecommendation: false,
        productCatalogOpen: true,
        lineCount: 2,
      }),
    ).toBe(true);
  });

  it("shows catalog after Zmień produkt while still in recommendation session", () => {
    expect(
      shouldShowProductCatalog({
        fromSingleRecommendation: true,
        productCatalogOpen: true,
        lineCount: 1,
      }),
    ).toBe(true);
    expect(
      isFocusedRecommendationEntry({
        fromSingleRecommendation: true,
        productCatalogOpen: true,
        lineCount: 1,
      }),
    ).toBe(false);
  });
});
