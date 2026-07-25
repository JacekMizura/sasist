import { describe, expect, it } from "vitest";
import type { RoutingEdge, RoutingNode } from "../../../api/warehouseRoutingApi";

/** Pure merge preview helper mirroring useRoutingGraph.previewMergeDegree2. */
function previewMerge(
  nodeUuid: string,
  nodes: RoutingNode[],
  edges: RoutingEdge[]
): { fromUuid: string; toUuid: string; lengthM: number } | null {
  const connected = edges.filter((e) => e.from_node_uuid === nodeUuid || e.to_node_uuid === nodeUuid);
  if (connected.length !== 2) return null;
  const neighbors = connected.map((e) =>
    e.from_node_uuid === nodeUuid ? e.to_node_uuid : e.from_node_uuid
  );
  if (neighbors[0] === neighbors[1]) return null;
  const a = nodes.find((n) => n.uuid === neighbors[0]);
  const b = nodes.find((n) => n.uuid === neighbors[1]);
  if (!a || !b) return null;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return { fromUuid: neighbors[0], toUuid: neighbors[1], lengthM: Math.hypot(dx, dy) / 100 };
}

describe("merge degree 2 preview", () => {
  const nodes: RoutingNode[] = [
    { uuid: "a", warehouse_id: 1, x: 0, y: 0, node_type: "junction" },
    { uuid: "b", warehouse_id: 1, x: 100, y: 0, node_type: "junction" },
    { uuid: "c", warehouse_id: 1, x: 200, y: 0, node_type: "junction" },
  ];
  const edges: RoutingEdge[] = [
    {
      uuid: "e1",
      warehouse_id: 1,
      layout_id: null,
      from_node_uuid: "a",
      to_node_uuid: "b",
      distance_m: 1,
      direction: "BOTH",
      enabled: true,
      allowed_processes: [],
      allowed_transport_types: [],
      cost_multiplier: 1,
      label: null,
    },
    {
      uuid: "e2",
      warehouse_id: 1,
      layout_id: null,
      from_node_uuid: "b",
      to_node_uuid: "c",
      distance_m: 1,
      direction: "BOTH",
      enabled: true,
      allowed_processes: [],
      allowed_transport_types: [],
      cost_multiplier: 1,
      label: null,
    },
  ];

  it("previews A—C length when removing middle B", () => {
    const p = previewMerge("b", nodes, edges);
    expect(p).not.toBeNull();
    expect(p!.fromUuid).toBe("a");
    expect(p!.toUuid).toBe("c");
    expect(p!.lengthM).toBeCloseTo(2, 5);
  });

  it("rejects degree 1", () => {
    expect(previewMerge("a", nodes, edges)).toBeNull();
  });
});
