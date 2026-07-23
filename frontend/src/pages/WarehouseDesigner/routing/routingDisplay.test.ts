/**
 * Routing designer display helpers — no forced “Punkt trasy” labels.
 */
import { describe, expect, it } from "vitest";
import {
  confirmDeleteNodeMessage,
  edgesConnectedTo,
  nodeDisplayName,
  nodeKind,
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

describe("routingDisplay", () => {
  it("does not show Punkt trasy for unlabeled junction", () => {
    const n = node({ uuid: "a", label: "Punkt trasy" });
    expect(nodeDisplayName(n)).toBe("Węzeł sieci");
    expect(nodeDisplayName(node({ uuid: "b", label: null }))).toBe("Węzeł sieci");
  });

  it("shows operational role", () => {
    const n = node({ uuid: "a", operational_type: "packing", node_type: "operational" });
    expect(nodeDisplayName(n)).toBe("Pakowanie");
    expect(nodeKind(n, [])).toBe("operational");
  });

  it("marks access nodes", () => {
    const n = node({ uuid: "a" });
    const aps: RoutingAccessPoint[] = [
      { uuid: "ap1", warehouse_id: 1, location_id: 9, node_uuid: "a", label: "Dostęp" },
    ];
    expect(nodeKind(n, aps)).toBe("access");
    expect(nodeDisplayName(n, aps, [{ id: 9, name: "R-01" }])).toContain("R-01");
  });

  it("lists connected edges and delete message", () => {
    const n = node({ uuid: "a", label: "X" });
    const edges: RoutingEdge[] = [
      {
        uuid: "e1",
        warehouse_id: 1,
        from_node_uuid: "a",
        to_node_uuid: "b",
        distance_m: 1,
        direction: "BOTH",
        enabled: true,
        allowed_processes: [],
        allowed_transport_types: [],
        cost_multiplier: 1,
      },
    ];
    expect(edgesConnectedTo("a", edges)).toHaveLength(1);
    expect(confirmDeleteNodeMessage(n, edges, [])).toMatch(/odcinek/i);
  });
});
