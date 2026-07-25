import { describe, expect, it } from "vitest";
import {
  buildRemovalImpact,
  countPassageVoidLevels,
  getPassageVoidHeightCm,
  planBinRebuild,
  rackStructureDiffers,
  storageLevelConfigAfterVoid,
} from "./passageStorage";
import { createBinsForRack } from "./warehouseUtils";
import type { BinState } from "../../types/warehouse";

describe("passageStorage void → levels (variant A)", () => {
  it("takes clearance from the single structural (first enabled) passage", () => {
    expect(
      getPassageVoidHeightCm([
        { enabled: true, clearance_height_cm: 40 },
        { enabled: true, clearance_height_cm: 80 },
        { enabled: false, clearance_height_cm: 200 },
      ])
    ).toBe(40);
    expect(getPassageVoidHeightCm([{ enabled: true, clearance_height_cm: null }])).toBe(0);
  });

  it("skips bottom levels intersecting void height", () => {
    // 5 × 40 cm = 200; void 80 → levels [0,50) and [50,100) wait equal split floor(200/5)=40
    expect(countPassageVoidLevels(200, 5, 80)).toBe(2);
    expect(countPassageVoidLevels(200, 5, 40)).toBe(1);
    expect(countPassageVoidLevels(200, 5, 0)).toBe(0);
    expect(countPassageVoidLevels(200, 5, 200)).toBe(5);
  });

  it("renumbers storage levels 1..N only", () => {
    const structural = [
      { level: 1, locations: 1 },
      { level: 2, locations: 1 },
      { level: 3, locations: 1 },
      { level: 4, locations: 1 },
      { level: 5, locations: 1 },
    ];
    expect(storageLevelConfigAfterVoid(structural, 2).map((r) => r.level)).toEqual([1, 2, 3]);
  });
});

describe("createBinsForRack with passages", () => {
  it("does not create locations in void; numbers storage from 1", () => {
    const bins = createBinsForRack(
      "A",
      1,
      5,
      1,
      100,
      "M1",
      undefined,
      100,
      80,
      200,
      undefined,
      "{Row}{Section}-{Bin}-{Level}",
      "A1",
      1,
      "alpha",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      [{ enabled: true, clearance_height_cm: 80 }]
    );
    expect(bins).toHaveLength(3);
    expect(bins.map((b) => b.level_index)).toEqual([0, 1, 2]);
    // address pattern Level is 1-based storage index
    expect(bins.map((b) => b.label)).toEqual(["A11-A-1", "A11-A-2", "A11-A-3"]);
  });

  it("without clearance keeps full structural grid", () => {
    const bins = createBinsForRack("A", 1, 5, 1, 100, "M1", undefined, 100, 80, 200);
    expect(bins).toHaveLength(5);
  });
});

describe("planBinRebuild identity", () => {
  const mk = (level: number, seg: number, uuid: string, label: string): BinState => ({
    label,
    level_index: level,
    segment_index: seg,
    volume_dm3: 10,
    locationUUID: uuid,
    current_load_dm3: 0,
  });

  it("preserves UUIDs when applying void to structural bins", () => {
    const existing = [
      mk(0, 0, "u0", "A1-A-1"),
      mk(1, 0, "u1", "A1-A-2"),
      mk(2, 0, "u2", "A1-A-3"),
      mk(3, 0, "u3", "A1-A-4"),
      mk(4, 0, "u4", "A1-A-5"),
    ];
    const next = [
      mk(0, 0, "n0", "A1-A-1"),
      mk(1, 0, "n1", "A1-A-2"),
      mk(2, 0, "n2", "A1-A-3"),
    ];
    const plan = planBinRebuild(existing, next, 5, 2);
    expect(plan.merged.map((b) => b.locationUUID)).toEqual(["u2", "u3", "u4"]);
    expect(plan.removed.map((b) => b.locationUUID)).toEqual(["u0", "u1"]);
    expect(rackStructureDiffers(existing, plan.merged)).toBe(true);
  });

  it("no removals when already storage-indexed for same void", () => {
    const existing = [mk(0, 0, "u2", "A1-A-1"), mk(1, 0, "u3", "A1-A-2"), mk(2, 0, "u4", "A1-A-3")];
    const next = [mk(0, 0, "n0", "A1-A-1"), mk(1, 0, "n1", "A1-A-2"), mk(2, 0, "n2", "A1-A-3")];
    const plan = planBinRebuild(existing, next, 5, 2);
    expect(plan.removed).toHaveLength(0);
    expect(plan.merged.map((b) => b.locationUUID)).toEqual(["u2", "u3", "u4"]);
    expect(rackStructureDiffers(existing, plan.merged)).toBe(false);
  });

  it("buildRemovalImpact flags stock from load", () => {
    const removed = [{ ...mk(0, 0, "u0", "OLD-1"), current_load_dm3: 5 }];
    const impact = buildRemovalImpact("A1", "a1", removed);
    expect(impact.removedCount).toBe(1);
    expect(impact.hasStock).toBe(true);
    expect(impact.removed[0]!.hasStock).toBe(true);
  });
});
