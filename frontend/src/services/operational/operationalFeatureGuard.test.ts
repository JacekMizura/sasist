import { afterEach, describe, expect, it } from "vitest";
import axios from "axios";

import {
  loadOperationalFeatures,
  resetOperationalFeatureCache,
} from "./operationalFeatureGuard";

describe("loadOperationalFeatures auth handling", () => {
  afterEach(() => {
    resetOperationalFeatureCache();
  });

  it("does not mask 401 as feature OFF / DEFAULT_FEATURES", async () => {
    const err = new axios.AxiosError("Unauthorized");
    err.response = { status: 401, data: {}, statusText: "Unauthorized", headers: {}, config: {} as never };

    const state = await loadOperationalFeatures(1, 1, async () => {
      throw err;
    });

    expect(state.unavailableReason).toBe("auth");
    expect(state.rawPayload).toBeNull();
    expect(state.directSalesFlag).toBe(false);
    expect(state.directSalesEnabled).toBe(false);
    expect(state.backendReachable).toBe(false);
  });

  it("applies real payload when probe succeeds", async () => {
    const state = await loadOperationalFeatures(1, 1, async () => ({
      direct_sales: true,
      runtime: false,
      replenishment: false,
    }));

    expect(state.unavailableReason).toBeNull();
    expect(state.directSalesFlag).toBe(true);
    expect(state.directSalesEnabled).toBe(true);
    expect(state.rawPayload?.direct_sales).toBe(true);
  });
});
