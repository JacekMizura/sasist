import { describe, expect, it } from "vitest";
import { isPackingRoute, isWarehouseExecutionRoute } from "./executionRoutes";

describe("isPackingRoute", () => {
  it("matches all packing paths", () => {
    expect(isPackingRoute("/wms/packing")).toBe(true);
    expect(isPackingRoute("/wms/packing/orders")).toBe(true);
    expect(isPackingRoute("/wms/packing/order/42")).toBe(true);
  });

  it("does not match picking or braki", () => {
    expect(isPackingRoute("/wms/picking/products")).toBe(false);
    expect(isPackingRoute("/wms/braki")).toBe(false);
  });
});

describe("isWarehouseExecutionRoute", () => {
  it("excludes packing — uses WmsTopBar only", () => {
    expect(isWarehouseExecutionRoute("/wms/packing/order/99")).toBe(false);
    expect(isWarehouseExecutionRoute("/wms/packing/orders")).toBe(false);
  });

  it("includes picking detail and recovery flows", () => {
    expect(isWarehouseExecutionRoute("/wms/picking/products/12")).toBe(true);
    expect(isWarehouseExecutionRoute("/wms/picking/recovery/1196")).toBe(true);
    expect(isWarehouseExecutionRoute("/wms/picking/recovery/batch/3")).toBe(true);
  });

  it("excludes picking hub and product list", () => {
    expect(isWarehouseExecutionRoute("/wms/picking")).toBe(false);
    expect(isWarehouseExecutionRoute("/wms/picking/products")).toBe(false);
  });
});
