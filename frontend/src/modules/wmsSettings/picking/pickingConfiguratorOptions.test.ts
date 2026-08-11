import { describe, expect, it } from "vitest";
import {
  BY_PRODUCTS_ALL_CONTAINER_OPTIONS,
  BY_PRODUCTS_MULTI_CONTAINER_OPTIONS,
  BY_PRODUCTS_SINGLE_CONTAINER_OPTIONS,
  coerceConsolidationOrderSort,
  containerListLabel,
  ensureContainerInOptions,
  isLocationOrderSortDisabledForMultiContainer,
  orderSortListLabel,
  showsByOrdersOrderSort,
  showsByProductsOrderSort,
  showsConsolidationOrderSort,
  showsSingleItemOrderSort,
  singleItemOrderSortOptions,
} from "./pickingConfiguratorOptions";

describe("pickingConfiguratorOptions visibility", () => {
  it("shows by-orders sort only for by_orders mode", () => {
    expect(showsByOrdersOrderSort("by_orders")).toBe(true);
    expect(showsByOrdersOrderSort("by_products")).toBe(false);
  });

  it("shows by-products order-sort sections for any container method", () => {
    expect(showsByProductsOrderSort("by_products")).toBe(true);
    expect(showsByProductsOrderSort("by_orders")).toBe(false);
    expect(showsConsolidationOrderSort("by_products", "baskets")).toBe(true);
    expect(showsConsolidationOrderSort("by_products", "consolidation_rack")).toBe(true);
    expect(showsSingleItemOrderSort("by_products", "mobile_cart", "baskets")).toBe(true);
    expect(showsSingleItemOrderSort("by_products", "cart_scan", "consolidation_rack")).toBe(true);
  });

  it("disables location sort only for consolidation rack multi container", () => {
    expect(isLocationOrderSortDisabledForMultiContainer("consolidation_rack")).toBe(true);
    expect(isLocationOrderSortDisabledForMultiContainer("baskets")).toBe(false);
    const withRack = singleItemOrderSortOptions("consolidation_rack");
    expect(withRack.find((o) => o.value === "location")?.disabled).toBe(true);
    const withBaskets = singleItemOrderSortOptions("baskets");
    expect(withBaskets.find((o) => o.value === "location")?.disabled).toBeFalsy();
  });

  it("Sellasist all options are intersection of single∩multi (no mobile, no consolidation)", () => {
    const values = BY_PRODUCTS_ALL_CONTAINER_OPTIONS.map((o) => o.value);
    expect(values).toEqual(["cart_scan", "cart_no_scan", "baskets"]);
  });

  it("Sellasist multi options include bulk and consolidation, not mobile", () => {
    const values = BY_PRODUCTS_MULTI_CONTAINER_OPTIONS.map((o) => o.value);
    expect(values).toEqual(["baskets", "cart_scan", "cart_no_scan", "consolidation_rack"]);
  });

  it("Sellasist single options include mobile and baskets, not consolidation", () => {
    const values = BY_PRODUCTS_SINGLE_CONTAINER_OPTIONS.map((o) => o.value);
    expect(values).toEqual(["cart_scan", "cart_no_scan", "mobile_cart", "baskets"]);
  });

  it("coerces consolidation sort away from location", () => {
    expect(coerceConsolidationOrderSort("location")).toBe("date");
    expect(coerceConsolidationOrderSort("courier")).toBe("courier");
    expect(coerceConsolidationOrderSort("date")).toBe("date");
  });

  it("ensureContainerInOptions falls back when legacy mode not in tree", () => {
    expect(
      ensureContainerInOptions("mobile_cart", BY_PRODUCTS_MULTI_CONTAINER_OPTIONS, "baskets"),
    ).toBe("baskets");
    expect(
      ensureContainerInOptions("baskets", BY_PRODUCTS_MULTI_CONTAINER_OPTIONS, "cart_scan"),
    ).toBe("baskets");
  });

  it("list labels avoid technical 1-el/Multi shortcuts", () => {
    expect(containerListLabel("baskets", "multi_item")).toBe("Do wózka z koszykami");
    expect(containerListLabel("cart_no_scan", "single_item")).toBe("Bez skanowania kodu kreskowego");
    expect(orderSortListLabel("date")).toBe("Po dacie (najstarsze)");
    expect(orderSortListLabel("location")).toBe("Po lokalizacjach");
  });
});
