import { describe, expect, it } from "vitest";

import {
  WMS_WAREHOUSE_REFRESH_DOMAINS,
  buildWmsWarehouseChangedDetail,
} from "./wmsWarehouseChange";

describe("buildWmsWarehouseChangedDetail", () => {
  it("includes all WMS workload domains for invalidation subscribers", () => {
    const detail = buildWmsWarehouseChangedDetail(42);
    expect(detail.warehouseId).toBe(42);
    expect([...detail.domains]).toEqual([...WMS_WAREHOUSE_REFRESH_DOMAINS]);
    expect(detail.domains).toContain("receiving");
    expect(detail.domains).toContain("shortages");
    expect(detail.domains).toContain("production");
  });
});
