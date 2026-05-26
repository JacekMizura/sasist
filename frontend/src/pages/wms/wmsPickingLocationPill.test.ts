import { describe, expect, it } from "vitest";
import { formatWmsPickingLocationPillLabel } from "./wmsPickingLocationPill";

describe("formatWmsPickingLocationPillLabel", () => {
  it("splits first hyphen into zone: rest with stock", () => {
    expect(formatWmsPickingLocationPillLabel("A11-1-1", 12)).toBe("A11: 1-1 (12)");
    expect(formatWmsPickingLocationPillLabel("B2-B-1", 1)).toBe("B2: B-1 (1)");
  });
  it("single token with stock uses IMPORT style", () => {
    expect(formatWmsPickingLocationPillLabel("IMPORT", 88)).toBe("IMPORT (88)");
  });
  it("omits stock when zero or omitted", () => {
    expect(formatWmsPickingLocationPillLabel("A11-1-1", 0)).toBe("A11: 1-1");
    expect(formatWmsPickingLocationPillLabel("A11-1-1", undefined)).toBe("A11: 1-1");
  });
});
