import { describe, expect, it } from "vitest";

import { normalizeQuickDiscountPercents, parseQuickDiscountPercentsInput } from "../../../directSales/settings/quickDiscountPercents";
import {
  DEAD_DIRECT_SALES_DISCOUNT_SETTING_KEYS,
  normalizeDirectSalesSettings,
} from "./directSalesSettingsSchema";

describe("normalizeQuickDiscountPercents", () => {
  it("filters values above max and deduplicates", () => {
    expect(normalizeQuickDiscountPercents([5, 10, 60, 10, 15], 50)).toEqual([5, 10, 15]);
  });

  it("returns empty when all values exceed max", () => {
    expect(normalizeQuickDiscountPercents([60, 70], 50)).toEqual([]);
  });
});

describe("parseQuickDiscountPercentsInput", () => {
  it("deduplicates parsed values", () => {
    expect(parseQuickDiscountPercentsInput("5, 10, 10, 15")).toEqual([5, 10, 15]);
  });
});

describe("normalizeDirectSalesSettings discounts cleanup", () => {
  it("strips legacy discount keys from live config", () => {
    const out = normalizeDirectSalesSettings({
      discounts: {
        allow_line_discounts: true,
        require_manager_approval: true,
        allow_negative_margin_override: true,
        max_discount_percent: 40,
      },
    });
    for (const key of DEAD_DIRECT_SALES_DISCOUNT_SETTING_KEYS) {
      expect(out.discounts).not.toHaveProperty(key);
    }
    expect(out.discounts.max_discount_percent).toBe(40);
  });
});
