import { describe, expect, it } from "vitest";
import {
  clampTemplatePassage,
  isPassageGeometryValid,
} from "./TemplatePassageOverlay";
import { generateLocationLabel } from "./warehouseUtils";
import { countPassageVoidLevels } from "./passageStorage";

describe("clampTemplatePassage (along = rack width)", () => {
  it("keeps opening within rack width", () => {
    expect(clampTemplatePassage(200, -10, 50)).toEqual({ offset_along_cm: 0, width_cm: 50 });
    expect(clampTemplatePassage(200, 180, 50)).toEqual({ offset_along_cm: 150, width_cm: 50 });
    expect(clampTemplatePassage(100, 0, 500)).toEqual({ offset_along_cm: 0, width_cm: 100 });
  });

  it("allows opening wider than depth would allow (width axis only)", () => {
    // Rack 120×60: passage 110 along width is valid — clamp uses width=120, not depth.
    const c = clampTemplatePassage(120, 10, 110);
    expect(c.offset_along_cm).toBe(10);
    expect(c.width_cm).toBe(110);
    expect(isPassageGeometryValid(120, 10, 110)).toBe(true);
  });
});

describe("isPassageGeometryValid", () => {
  it("accepts start+width within rack width", () => {
    expect(isPassageGeometryValid(120, 0, 110)).toBe(true);
    expect(isPassageGeometryValid(120, 10, 110)).toBe(true);
  });

  it("rejects overflow / non-positive width / negative start", () => {
    expect(isPassageGeometryValid(120, 20, 110)).toBe(false);
    expect(isPassageGeometryValid(120, -1, 50)).toBe(false);
    expect(isPassageGeometryValid(120, 0, 0)).toBe(false);
  });
});

describe("template labels keep construction level after void", () => {
  it("level token uses structural index, not renumbered storage index", () => {
    const structuralRows = [
      { level: 1, locations: 1 },
      { level: 2, locations: 1 },
      { level: 3, locations: 1 },
      { level: 4, locations: 1 },
    ];
    const voidN = countPassageVoidLevels(200, 4, 120); // 200/4=50 → void covers 3 levels
    expect(voidN).toBe(3);
    const topStructural = 3; // construction level 4
    const label = generateLocationLabel({
      levelIndex: topStructural,
      segmentIndex: 0,
      levelRows: structuralRows,
      addressPattern: "{Row}{Section}-{Bin}-{Level}",
      rowId: "A",
      sectionStartIndex: 1,
      binNamingType: "alpha",
    });
    expect(label).toBe("A1-A-4");
    // Storage renumber would wrongly yield A1-A-1 — must not happen.
    const wrongStorageIndex = 0;
    const renumbered = generateLocationLabel({
      levelIndex: wrongStorageIndex,
      segmentIndex: 0,
      levelRows: structuralRows.slice(voidN),
      addressPattern: "{Row}{Section}-{Bin}-{Level}",
      rowId: "A",
      sectionStartIndex: 1,
      binNamingType: "alpha",
    });
    expect(renumbered).toBe("A1-A-1");
    expect(label).not.toBe(renumbered);
  });
});
