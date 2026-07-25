import { describe, expect, it } from "vitest";
import type { RackState } from "../../../types/warehouse";
import { PassageSource } from "../../../types/warehouse";
import {
  corridorSpecFromDrag,
  defaultPassageForRack,
  layoutCellCenterCm,
  materializeInheritedPassages,
  rematerializeInheritedPassages,
  worldCorridorToPassages,
  worldCorridorToPassagesFromSpec,
} from "./rackPassageGeometry";

function verticalRack(overrides: Partial<RackState> = {}): RackState {
  return {
    uuid: overrides.uuid ?? "rack-a",
    rack_type: "warehouse",
    x: 10,
    y: 20,
    width: 8,
    height: 30,
    orientation: "vertical",
    levels: 4,
    bins_per_level: 4,
    length_cm: 300,
    width_cm: 80,
    height_cm: 200,
    aisle_letter: "A",
    rack_index: 1,
    bins: [],
    ...overrides,
  };
}

describe("layoutCellCenterCm", () => {
  it("converts grid cell to center cm", () => {
    expect(layoutCellCenterCm({ x: 0, y: 0 })).toEqual({ x: 5, y: 5 });
    expect(layoutCellCenterCm({ x: 10, y: 20 })).toEqual({ x: 105, y: 205 });
  });
});

describe("worldCorridorToPassages", () => {
  it("horizontal band cuts two stacked vertical racks (B4+C4 style)", () => {
    const b4 = verticalRack({ uuid: "b4", x: 10, y: 10, height: 20 });
    const c4 = verticalRack({ uuid: "c4", x: 10, y: 35, height: 20 });
    // Band at Y=325cm (between racks), width 90cm
    const centerY = 325;
    const placements = worldCorridorToPassages([b4, c4], "x", centerY, 90, 100, 200);
    expect(placements).toHaveLength(2);
    const byUuid = Object.fromEntries(placements.map((p) => [p.rackUuid, p]));
    expect(byUuid.b4).toBeDefined();
    expect(byUuid.c4).toBeDefined();
    expect(byUuid.b4.width_cm).toBeGreaterThanOrEqual(10);
    expect(byUuid.c4.width_cm).toBeGreaterThanOrEqual(10);
  });

  it("vertical band cuts horizontal rack along X", () => {
    const rack = verticalRack({
      uuid: "h1",
      orientation: "horizontal",
      x: 5,
      y: 5,
      width: 40,
      height: 8,
    });
    const centerX = 150;
    const placements = worldCorridorToPassages([rack], "y", centerX, 80, 50, 250);
    expect(placements).toHaveLength(1);
    expect(placements[0].rackUuid).toBe("h1");
    expect(placements[0].offset_along_cm).toBeGreaterThanOrEqual(0);
    expect(placements[0].width_cm).toBeGreaterThanOrEqual(10);
  });

  it("skips racks that do not intersect corridor extent", () => {
    const rack = verticalRack({ uuid: "far", x: 100, y: 100, height: 10 });
    const placements = worldCorridorToPassages([rack], "x", 500, 90, 0, 50);
    expect(placements).toHaveLength(0);
  });
});

describe("corridorSpecFromDrag", () => {
  it("snaps near-horizontal drag to axis x", () => {
    const spec = corridorSpecFromDrag({ x: 100, y: 200 }, { x: 400, y: 210 }, 90);
    expect(spec.axis).toBe("x");
    expect(spec.extentMinCm).toBe(100);
    expect(spec.extentMaxCm).toBe(400);
  });

  it("uses free angle when shift held", () => {
    const spec = corridorSpecFromDrag({ x: 100, y: 200 }, { x: 130, y: 500 }, 90, { freeAngle: true });
    expect(spec.axis).toBe("y");
  });
});

describe("worldCorridorToPassagesFromSpec", () => {
  it("delegates to worldCorridorToPassages", () => {
    const rack = verticalRack({ uuid: "r1" });
    const spec = corridorSpecFromDrag({ x: 100, y: 200 }, { x: 300, y: 200 }, 90);
    const direct = worldCorridorToPassages(
      [rack],
      spec.axis,
      spec.centerCm,
      spec.widthCm,
      spec.extentMinCm,
      spec.extentMaxCm
    );
    expect(worldCorridorToPassagesFromSpec([rack], spec)).toEqual(direct);
  });
});

describe("passage source materialize", () => {
  it("defaultPassageForRack is LOCAL", () => {
    const p = defaultPassageForRack(verticalRack());
    expect(p.passage_source).toBe(PassageSource.LOCAL);
  });

  it("materializeInheritedPassages keeps only one structural passage", () => {
    const many = materializeInheritedPassages([
      { offset_along_cm: 10, width_cm: 40, clearance_height_cm: 80 },
      { offset_along_cm: 50, width_cm: 40, clearance_height_cm: 120 },
    ]);
    expect(many).toHaveLength(1);
    expect(many[0].clearance_height_cm).toBe(80);
  });

  it("rematerializeInheritedPassages keeps LOCAL and replaces INHERITED", () => {
    const existing = [
      {
        uuid: "local-1",
        offset_along_cm: 5,
        width_cm: 20,
        enabled: true,
        passage_source: PassageSource.LOCAL,
      },
      {
        uuid: "inh-old",
        offset_along_cm: 50,
        width_cm: 30,
        enabled: true,
        passage_source: PassageSource.INHERITED,
      },
      {
        uuid: "legacy-no-source",
        offset_along_cm: 90,
        width_cm: 25,
        enabled: true,
      },
    ];
    const next = rematerializeInheritedPassages(existing, [
      { offset_along_cm: 100, width_cm: 60 },
    ]);
    expect(next).toHaveLength(3);
    expect(next.filter((p) => p.passage_source === PassageSource.LOCAL).map((p) => p.uuid).sort()).toEqual([
      "legacy-no-source",
      "local-1",
    ]);
    const inherited = next.filter((p) => p.passage_source === PassageSource.INHERITED);
    expect(inherited).toHaveLength(1);
    expect(inherited[0].uuid).not.toBe("inh-old");
    expect(inherited[0].offset_along_cm).toBe(100);
    expect(inherited[0].width_cm).toBe(60);
  });
});
