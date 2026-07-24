import { describe, expect, it } from "vitest";
import type { LayoutState, RackState } from "../../../types/warehouse";
import {
  applyPassagePlacements,
  deletePassageGroup,
  findCorridorMembers,
  moveCorridorByDelta,
  resizeCorridorWidth,
  worldCorridorToPassages,
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

function emptyLayout(racks: RackState[]): LayoutState {
  return {
    layout_id: null,
    warehouse_id: null,
    warehouse_name: "T",
    name: "T",
    grid_cols: 80,
    grid_rows: 60,
    racks,
    aisles: [],
    visual_elements: [],
    row_containers: [],
  };
}

describe("passage corridor group UX", () => {
  it("create through 1 rack assigns corridor_uuid", () => {
    const rack = verticalRack({ uuid: "r1", x: 10, y: 10, height: 20 });
    const placements = worldCorridorToPassages([rack], "x", 150, 90, 100, 180);
    expect(placements).toHaveLength(1);
    const next = applyPassagePlacements(emptyLayout([rack]), placements);
    const p = next.racks[0].passages?.[0];
    expect(p).toBeDefined();
    expect(p!.corridor_uuid).toBeTruthy();
  });

  it("one gesture through B4+C4 shares corridor_uuid", () => {
    const b4 = verticalRack({ uuid: "b4", name: "B4", x: 10, y: 10, height: 20 });
    const c4 = verticalRack({ uuid: "c4", name: "C4", x: 10, y: 35, height: 20 });
    const placements = worldCorridorToPassages([b4, c4], "x", 325, 90, 100, 200);
    expect(placements).toHaveLength(2);
    const next = applyPassagePlacements(emptyLayout([b4, c4]), placements);
    const pb = next.racks.find((r) => r.uuid === "b4")!.passages![0];
    const pc = next.racks.find((r) => r.uuid === "c4")!.passages![0];
    expect(pb.corridor_uuid).toBeTruthy();
    expect(pb.corridor_uuid).toBe(pc.corridor_uuid);
    expect(findCorridorMembers(next, pb.corridor_uuid!)).toHaveLength(2);
  });

  it("move group shifts both offsets together", () => {
    const b4 = verticalRack({ uuid: "b4", x: 10, y: 10, height: 40 });
    const c4 = verticalRack({ uuid: "c4", x: 10, y: 55, height: 40 });
    const corridor = "corr-move-1";
    let layout = emptyLayout([
      {
        ...b4,
        passages: [
          {
            uuid: "pb",
            offset_along_cm: 50,
            width_cm: 40,
            enabled: true,
            corridor_uuid: corridor,
          },
        ],
      },
      {
        ...c4,
        passages: [
          {
            uuid: "pc",
            offset_along_cm: 50,
            width_cm: 40,
            enabled: true,
            corridor_uuid: corridor,
          },
        ],
      },
    ]);
    const before = findCorridorMembers(layout, corridor).map((m) => m.passage.offset_along_cm);
    layout = moveCorridorByDelta(layout, corridor, 15);
    const after = findCorridorMembers(layout, corridor).map((m) => m.passage.offset_along_cm);
    expect(after[0] - before[0]).toBeCloseTo(15, 5);
    expect(after[1] - before[1]).toBeCloseTo(15, 5);
  });

  it("resize group sets equal width", () => {
    const b4 = verticalRack({ uuid: "b4", x: 10, y: 10, height: 20 });
    const c4 = verticalRack({ uuid: "c4", x: 10, y: 35, height: 20 });
    let layout = applyPassagePlacements(
      emptyLayout([b4, c4]),
      worldCorridorToPassages([b4, c4], "x", 325, 90, 100, 200)
    );
    const cu = layout.racks[0].passages![0].corridor_uuid!;
    layout = resizeCorridorWidth(layout, cu, 120);
    const widths = findCorridorMembers(layout, cu).map((m) => m.passage.width_cm);
    expect(widths[0]).toBe(120);
    expect(widths[1]).toBe(120);
  });

  it("delete group removes both passages", () => {
    const b4 = verticalRack({ uuid: "b4", x: 10, y: 10, height: 20 });
    const c4 = verticalRack({ uuid: "c4", x: 10, y: 35, height: 20 });
    let layout = applyPassagePlacements(
      emptyLayout([b4, c4]),
      worldCorridorToPassages([b4, c4], "x", 325, 90, 100, 200)
    );
    const pb = layout.racks.find((r) => r.uuid === "b4")!.passages![0];
    layout = deletePassageGroup(layout, "b4", pb.uuid);
    expect(layout.racks.find((r) => r.uuid === "b4")!.passages ?? []).toHaveLength(0);
    expect(layout.racks.find((r) => r.uuid === "c4")!.passages ?? []).toHaveLength(0);
  });
});
