import { describe, expect, it } from "vitest";

import { getProductDetailsPath, productDetailsNavState } from "./productPaths";

describe("getProductDetailsPath", () => {
  it("builds canonical Assortment edit path from local product id", () => {
    expect(getProductDetailsPath(42)).toBe("/products/42/edit");
    expect(getProductDetailsPath("99")).toBe("/products/99/edit");
  });

  it("falls back to list for invalid ids", () => {
    expect(getProductDetailsPath(null)).toBe("/products/list");
    expect(getProductDetailsPath(undefined)).toBe("/products/list");
    expect(getProductDetailsPath(0)).toBe("/products/list");
    expect(getProductDetailsPath("abc")).toBe("/products/list");
  });

  it("supports tenant_id and tab query params", () => {
    expect(getProductDetailsPath(7, { tenantId: 3 })).toBe("/products/7/edit?tenant_id=3");
    expect(getProductDetailsPath(7, { tab: "wms-validation" })).toBe(
      "/products/7/edit?tab=wms-validation",
    );
    expect(getProductDetailsPath(7, { tenantId: 1, tab: "settings" })).toBe(
      "/products/7/edit?tenant_id=1&tab=settings",
    );
  });
});

describe("productDetailsNavState", () => {
  it("keeps only defined navigation state fields", () => {
    expect(productDetailsNavState(null)).toBeUndefined();
    expect(productDetailsNavState({})).toBeUndefined();
    expect(
      productDetailsNavState({
        tenantId: 2,
        warehouseId: 5,
        returnTo: "/carts/1",
        listStockQuantity: 10,
      }),
    ).toEqual({
      tenantId: 2,
      warehouseId: 5,
      returnTo: "/carts/1",
      listStockQuantity: 10,
    });
  });
});
