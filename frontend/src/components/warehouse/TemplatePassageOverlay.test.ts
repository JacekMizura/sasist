import { describe, expect, it } from "vitest";
import { clampTemplatePassage } from "./TemplatePassageOverlay";

describe("clampTemplatePassage", () => {
  it("keeps width within along axis", () => {
    expect(clampTemplatePassage(200, -10, 50)).toEqual({ offset_along_cm: 0, width_cm: 50 });
    expect(clampTemplatePassage(200, 180, 50)).toEqual({ offset_along_cm: 150, width_cm: 50 });
    expect(clampTemplatePassage(100, 0, 500)).toEqual({ offset_along_cm: 0, width_cm: 100 });
  });

  it("supports multi-passage offsets independently", () => {
    const a = clampTemplatePassage(300, 20, 80);
    const b = clampTemplatePassage(300, 150, 60);
    expect(a.offset_along_cm).toBe(20);
    expect(b.offset_along_cm).toBe(150);
    expect(a.width_cm + b.width_cm).toBe(140);
  });
});
