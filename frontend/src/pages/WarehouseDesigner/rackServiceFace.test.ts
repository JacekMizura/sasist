import { describe, expect, it } from "vitest";
import { normalizeRotation, worldServiceNormal } from "./rackServiceFace";

describe("rotationDegrees round-trip contract", () => {
  it("preserves 0/90/180/270 exactly", () => {
    for (const r of [0, 90, 180, 270] as const) {
      expect(normalizeRotation(r)).toBe(r);
      expect(normalizeRotation(String(r))).toBe(r);
    }
  });

  it("never maps 270 to 0 (legacy FE bug)", () => {
    expect(normalizeRotation(270)).toBe(270);
    expect(normalizeRotation(270.0)).toBe(270);
    expect(normalizeRotation("270")).toBe(270);
  });

  it("SOUTH encoding FRONT+270 survives normalize", () => {
    const n = worldServiceNormal("vertical", normalizeRotation(270), "FRONT");
    expect(n.x).toBeCloseTo(0);
    expect(n.y).toBeCloseTo(1);
  });
});
