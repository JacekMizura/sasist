import { describe, expect, it } from "vitest";
import {
  endpointSnapToDropTarget,
  resolveEndpointRewireSnap,
} from "./routingEndpointDrag";
import { DRAW_NODE_SNAP_CM } from "./routingCanvasInteraction";

describe("resolveEndpointRewireSnap", () => {
  const nodes = [
    { uuid: "A", x: 0, y: 0 },
    { uuid: "B", x: 100, y: 0 },
    { uuid: "C", x: 200, y: 100 },
  ];

  it("snaps to nearest existing node within radius", () => {
    const snap = resolveEndpointRewireSnap(nodes, { x: 8, y: 4 }, { excludeNodeUuid: "B" });
    expect(snap).toEqual({ kind: "node", uuid: "A", x: 0, y: 0 });
  });

  it("excludes the fixed opposite endpoint", () => {
    const snap = resolveEndpointRewireSnap(
      nodes,
      { x: 2, y: 2 },
      { excludeNodeUuid: "A", nodeSnapCm: DRAW_NODE_SNAP_CM }
    );
    expect(snap.kind).toBe("ghost");
    if (snap.kind === "ghost") {
      expect(snap.x).toBe(2);
      expect(snap.y).toBe(2);
    }
  });

  it("ghosts on empty canvas with optional grid snap", () => {
    const snap = resolveEndpointRewireSnap(
      nodes,
      { x: 55, y: 55 },
      {
        excludeNodeUuid: "A",
        gridSnap: (x, y) => ({ x: Math.round(x / 50) * 50, y: Math.round(y / 50) * 50 }),
      }
    );
    expect(snap).toEqual({ kind: "ghost", x: 50, y: 50 });
  });

  it("maps snap preview to drop target", () => {
    expect(endpointSnapToDropTarget({ kind: "node", uuid: "C", x: 1, y: 2 })).toEqual({
      kind: "node",
      uuid: "C",
    });
    expect(endpointSnapToDropTarget({ kind: "ghost", x: 10, y: 20 })).toEqual({
      kind: "new",
      x: 10,
      y: 20,
    });
  });
});
