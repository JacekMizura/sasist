import { describe, expect, it } from "vitest";

import { normalizePackingAutomationButtonsPosition } from "../types/wmsPackingExtendedUi";

describe("normalizePackingAutomationButtonsPosition", () => {
  it("keeps top and bottom", () => {
    expect(normalizePackingAutomationButtonsPosition("top")).toBe("top");
    expect(normalizePackingAutomationButtonsPosition("bottom")).toBe("bottom");
  });

  it("maps legacy right/floating (and unknown) to bottom", () => {
    expect(normalizePackingAutomationButtonsPosition("right")).toBe("bottom");
    expect(normalizePackingAutomationButtonsPosition("floating")).toBe("bottom");
    expect(normalizePackingAutomationButtonsPosition(undefined)).toBe("bottom");
    expect(normalizePackingAutomationButtonsPosition("")).toBe("bottom");
  });
});
