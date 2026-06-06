import { describe, expect, it } from "vitest";

import { safeIncludes, safeTrim, safeUpper } from "./safeStrings";

describe("safeStrings", () => {
  it("safeTrim handles nullish", () => {
    expect(safeTrim(undefined)).toBe("");
    expect(safeTrim(null)).toBe("");
    expect(safeTrim("  x  ")).toBe("x");
  });

  it("safeUpper handles nullish", () => {
    expect(safeUpper(undefined)).toBe("");
    expect(safeUpper("low")).toBe("LOW");
  });

  it("safeIncludes does not throw on undefined alert_type", () => {
    expect(safeIncludes(undefined, "LOW")).toBe(false);
    expect(safeIncludes("LOW_STOCK", "LOW")).toBe(true);
  });
});
