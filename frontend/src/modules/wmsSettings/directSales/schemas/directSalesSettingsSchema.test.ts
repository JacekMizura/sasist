import { describe, expect, it } from "vitest";

import {
  DEFAULT_DIRECT_SALES_SETTINGS,
  normalizeDirectSalesSettings,
} from "./directSalesSettingsSchema";

describe("normalizeDirectSalesSettings stock section", () => {
  it("maps legacy allocation_strategy on read without leaving old values", () => {
    const out = normalizeDirectSalesSettings({
      allocation_strategy: "store_first",
      prefer_store_locations: true,
    });
    expect(out.allocation_strategy).toBe("auto_split");
    expect(out).not.toHaveProperty("allow_oversell");
  });

  it("does not mark dirty against defaults when legacy normalizes to canonical value", () => {
    const fromApi = normalizeDirectSalesSettings({ allocation_strategy: "pick_face" });
    expect(fromApi.allocation_strategy).toBe("single_location");
    expect(fromApi.allocation_strategy).not.toBe("pick_face");
  });

  it("strips legacy allow_oversell from live config", () => {
    const out = normalizeDirectSalesSettings({
      allow_oversell: true,
      allocation_strategy: "auto",
    });
    expect(out).not.toHaveProperty("allow_oversell");
    expect(out.allocation_strategy).toBe("auto_split");
  });

  it("canonical defaults match normalized legacy store_first", () => {
    const legacy = normalizeDirectSalesSettings({ allocation_strategy: "store_first" });
    expect(legacy.allocation_strategy).toBe(DEFAULT_DIRECT_SALES_SETTINGS.allocation_strategy);
  });
});
