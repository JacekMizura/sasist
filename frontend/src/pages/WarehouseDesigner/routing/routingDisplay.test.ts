/**
 * Routing designer display helpers — warehouse language, never UUID / „węzeł”.
 */
import { describe, expect, it } from "vitest";
import {
  confirmDeleteNodeMessage,
  edgesConnectedTo,
  nodeDisplayName,
  nodeKind,
  orphanNodeUuids,
} from "./routingDisplay";
import type { RoutingAccessPoint, RoutingEdge, RoutingNode } from "../../../api/warehouseRoutingApi";

function node(partial: Partial<RoutingNode> & { uuid: string }): RoutingNode {
  return {
    warehouse_id: 1,
    x: 0,
    y: 0,
    node_type: "junction",
    ...partial,
  };
}

function edge(from: string, to: string, uuid = "e1"): RoutingEdge {
  return {
    uuid,
    warehouse_id: 1,
    from_node_uuid: from,
    to_node_uuid: to,
    distance_m: 1,
    direction: "BOTH",
    enabled: true,
    allowed_processes: [],
    allowed_transport_types: [],
    cost_multiplier: 1,
  };
}

describe("routingDisplay", () => {
  it("uses Punkt N for unlabeled junctions (never UUID / Węzeł)", () => {
    const a = node({ uuid: "a", label: "Punkt trasy" });
    const b = node({ uuid: "b", label: null });
    const all = [a, b];
    expect(nodeDisplayName(a, [], [], all)).toBe("Punkt 1");
    expect(nodeDisplayName(b, [], [], all)).toBe("Punkt 2");
    expect(nodeDisplayName(a)).not.toMatch(/[0-9a-f]{8}/i);
    expect(nodeDisplayName(a)).not.toMatch(/węzeł/i);
  });

  it("shows operational type without redundant Label: Label", () => {
    const n = node({
      uuid: "a",
      operational_type: "packing",
      node_type: "operational",
      label: "Pakowanie",
    });
    expect(nodeDisplayName(n)).toBe("Pakowanie");
    expect(nodeKind(n, [])).toBe("operational");
  });

  it("uses custom name when different from operational type", () => {
    const n = node({
      uuid: "a",
      operational_type: "packing",
      node_type: "operational",
      label: "Pakowanie główne",
    });
    expect(nodeDisplayName(n)).toBe("Pakowanie główne");
  });

  it("marks access nodes by AP presence without exposing Access Point jargon in name", () => {
    const n = node({ uuid: "a" });
    const aps: RoutingAccessPoint[] = [
      { uuid: "ap1", warehouse_id: 1, location_id: 9, node_uuid: "a", label: "A1" },
    ];
    expect(nodeKind(n, aps)).toBe("access");
    expect(nodeDisplayName(n, aps, [{ id: 9, name: "A1" }], [n])).toBe("Punkt 1");
  });

  it("lists connected edges and delete confirm for connected point", () => {
    const n = node({ uuid: "a", label: "X" });
    const edges = [edge("a", "b"), edge("a", "c", "e2")];
    expect(edgesConnectedTo("a", edges)).toHaveLength(2);
    expect(confirmDeleteNodeMessage(n, edges, [], [n])).toMatch(/2 połączone odcinki/i);
  });

  it("orphan delete is simple without edge warning", () => {
    const n = node({ uuid: "a", label: "Samotny" });
    expect(confirmDeleteNodeMessage(n, [], [], [n])).toBe("Usunąć ten punkt?");
  });

  it("aggregates orphan uuids without needing them in UI copy", () => {
    const nodes = [node({ uuid: "a" }), node({ uuid: "b" }), node({ uuid: "c" })];
    const edges = [edge("a", "b")];
    expect(orphanNodeUuids(nodes, edges)).toEqual(["c"]);
  });
});
