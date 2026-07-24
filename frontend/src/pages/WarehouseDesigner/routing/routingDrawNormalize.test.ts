/**
 * Draw-time topology: crossings, T-junctions, collinear normalize, snap, route.
 */
import { describe, expect, it } from "vitest";
import {
  applyDrawStep,
  type InteractionGraph,
} from "./routingCanvasInteraction";
import {
  collapseCollinearOverlaps,
  materializeIntersections,
  normalizeDrawnGraph,
  segmentsOverlapCollinear,
} from "./routingDrawNormalize";
import { nodeDisplayName } from "./routingDisplay";
import type { RoutingNode } from "../../../api/warehouseRoutingApi";

function seqUuid(prefix = "id") {
  let i = 0;
  return () => `${prefix}${++i}`;
}

function undirectedAdj(graph: InteractionGraph): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (const e of graph.edges) {
    if (!e.enabled) continue;
    add(e.from_node_uuid, e.to_node_uuid);
    add(e.to_node_uuid, e.from_node_uuid);
  }
  return adj;
}

function hasPath(graph: InteractionGraph, start: string, goal: string): boolean {
  if (start === goal) return true;
  const adj = undirectedAdj(graph);
  const seen = new Set<string>([start]);
  const q = [start];
  while (q.length) {
    const u = q.shift()!;
    for (const v of adj.get(u) ?? []) {
      if (seen.has(v)) continue;
      if (v === goal) return true;
      seen.add(v);
      q.push(v);
    }
  }
  return false;
}

function degree(graph: InteractionGraph, uuid: string): number {
  return graph.edges.filter(
    (e) => e.enabled && (e.from_node_uuid === uuid || e.to_node_uuid === uuid)
  ).length;
}

function draw(
  graph: InteractionGraph,
  draft: string | null,
  x: number,
  y: number,
  id: () => string,
  opts?: { preferEdgeUuid?: string; preferNodeUuid?: string }
) {
  return applyDrawStep(graph, draft, { x, y, ...opts }, id);
}

describe("draw-time intersections & normalize", () => {
  it("TEST1 CROSS: A→B then C→D crossing creates 1 junction, 4 arms, A↔D path", () => {
    const id = seqUuid("t1");
    let graph: InteractionGraph = { nodes: [], edges: [] };
    let draft: string | null = null;

    let step = draw(graph, draft, 0, 0, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    const A = draft;
    step = draw(graph, draft, 200, 0, id);
    graph = step.graph;
    draft = null;
    const B = step.draftFromUuid;

    step = draw(graph, draft, 100, -100, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    const C = draft;
    step = draw(graph, draft, 100, 100, id);
    graph = step.graph;
    const D = step.draftFromUuid;

    const junctions = graph.nodes.filter(
      (n) => (n.meta as { auto_intersection?: boolean } | null)?.auto_intersection
    );
    expect(junctions.length).toBeGreaterThanOrEqual(1);
    const X = junctions[0]!;
    expect(degree(graph, X.uuid)).toBe(4);
    expect(hasPath(graph, A, D)).toBe(true);
    expect(hasPath(graph, B, C)).toBe(true);
    expect(graph.nodes.filter((n) => Math.abs(n.x - 100) < 1 && Math.abs(n.y) < 1)).toHaveLength(1);
  });

  it("TEST2 T-JUNCTION: start mid A—B → C splits and connects", () => {
    const id = seqUuid("t2");
    let graph: InteractionGraph = { nodes: [], edges: [] };
    let draft: string | null = null;
    let step = draw(graph, draft, 0, 0, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    const A = draft;
    step = draw(graph, draft, 200, 0, id);
    graph = step.graph;
    const B = step.draftFromUuid;
    const ab = graph.edges[0]!;

    draft = null;
    step = draw(graph, draft, 100, 0, id, { preferEdgeUuid: ab.uuid });
    graph = step.graph;
    draft = step.draftFromUuid;
    const X = draft;
    step = draw(graph, draft, 100, 100, id);
    graph = step.graph;
    const C = step.draftFromUuid;

    expect(hasPath(graph, A, C)).toBe(true);
    expect(hasPath(graph, B, C)).toBe(true);
    expect(degree(graph, X)).toBeGreaterThanOrEqual(3);
  });

  it("TEST3 BRANCH: A→B→C then B→D reuses B, no duplicate", () => {
    const id = seqUuid("t3");
    let graph: InteractionGraph = { nodes: [], edges: [] };
    let draft: string | null = null;
    let step = draw(graph, draft, 0, 0, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    step = draw(graph, draft, 100, 0, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    const B = draft;
    step = draw(graph, draft, 200, 0, id);
    graph = step.graph;
    expect(graph.nodes).toHaveLength(3);

    draft = null;
    step = draw(graph, draft, 100, 0, id, { preferNodeUuid: B });
    graph = step.graph;
    draft = step.draftFromUuid;
    expect(draft).toBe(B);
    expect(graph.nodes).toHaveLength(3);
    step = draw(graph, draft, 100, 100, id);
    graph = step.graph;
    expect(graph.nodes).toHaveLength(4);
    expect(graph.nodes.filter((n) => n.uuid === B)).toHaveLength(1);
  });

  it("TEST4 COLLINEAR CONTINUATION: A→B then B→C — no overlap", () => {
    const id = seqUuid("t4");
    let graph: InteractionGraph = { nodes: [], edges: [] };
    let draft: string | null = null;
    let step = draw(graph, draft, 0, 0, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    step = draw(graph, draft, 100, 0, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    const B = draft;
    step = draw(graph, draft, 200, 0, id);
    graph = step.graph;
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
    const by = new Map(graph.nodes.map((n) => [n.uuid, n]));
    for (let i = 0; i < graph.edges.length; i++) {
      for (let j = i + 1; j < graph.edges.length; j++) {
        const e1 = graph.edges[i]!;
        const e2 = graph.edges[j]!;
        const a = by.get(e1.from_node_uuid)!;
        const b = by.get(e1.to_node_uuid)!;
        const c = by.get(e2.from_node_uuid)!;
        const d = by.get(e2.to_node_uuid)!;
        expect(
          segmentsOverlapCollinear([a.x, a.y], [b.x, b.y], [c.x, c.y], [d.x, d.y])
        ).toBe(false);
      }
    }
    expect(hasPath(graph, graph.nodes[0]!.uuid, graph.nodes[2]!.uuid)).toBe(true);
    expect(B).toBeTruthy();
  });

  it("TEST5 COLLINEAR OVERLAP: A—C over A—B collapses to chain without duplicate stack", () => {
    const id = seqUuid("t5");
    // Manual overlapping edges then normalize
    let graph: InteractionGraph = {
      nodes: [
        { uuid: "a", x: 0, y: 0, node_type: "junction" },
        { uuid: "b", x: 100, y: 0, node_type: "junction" },
        { uuid: "c", x: 200, y: 0, node_type: "junction" },
      ],
      edges: [
        {
          uuid: "e1",
          from_node_uuid: "a",
          to_node_uuid: "b",
          distance_m: 1,
          direction: "BOTH",
          enabled: true,
          allowed_processes: [],
          allowed_transport_types: [],
          cost_multiplier: 1,
        },
        {
          uuid: "e2",
          from_node_uuid: "a",
          to_node_uuid: "c",
          distance_m: 2,
          direction: "BOTH",
          enabled: true,
          allowed_processes: [],
          allowed_transport_types: [],
          cost_multiplier: 1,
        },
      ],
    };
    graph = collapseCollinearOverlaps(graph, id) as InteractionGraph;
    const by = new Map(graph.nodes.map((n) => [n.uuid, n]));
    for (let i = 0; i < graph.edges.length; i++) {
      for (let j = i + 1; j < graph.edges.length; j++) {
        const e1 = graph.edges[i]!;
        const e2 = graph.edges[j]!;
        const a = by.get(e1.from_node_uuid)!;
        const b = by.get(e1.to_node_uuid)!;
        const c = by.get(e2.from_node_uuid)!;
        const d = by.get(e2.to_node_uuid)!;
        expect(
          segmentsOverlapCollinear([a.x, a.y], [b.x, b.y], [c.x, c.y], [d.x, d.y])
        ).toBe(false);
      }
    }
    expect(hasPath(graph, "a", "c")).toBe(true);
    expect(hasPath(graph, "a", "b")).toBe(true);
  });

  it("TEST6/7 IDEMPOTENT: normalize twice does not multiply junctions/edges", () => {
    const id = seqUuid("t67");
    let graph: InteractionGraph = { nodes: [], edges: [] };
    let draft: string | null = null;
    let step = draw(graph, draft, 0, 0, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    step = draw(graph, draft, 200, 0, id);
    graph = step.graph;
    draft = null;
    step = draw(graph, draft, 100, -100, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    step = draw(graph, draft, 100, 100, id);
    graph = step.graph;

    const once = {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      junctions: graph.nodes.filter(
        (n) => (n.meta as { auto_intersection?: boolean } | null)?.auto_intersection
      ).length,
    };
    const again = normalizeDrawnGraph(graph, id) as InteractionGraph;
    const twice = normalizeDrawnGraph(again, id) as InteractionGraph;
    expect(twice.nodes.length).toBe(once.nodes);
    expect(twice.edges.length).toBe(once.edges);
    expect(
      twice.nodes.filter(
        (n) => (n.meta as { auto_intersection?: boolean } | null)?.auto_intersection
      ).length
    ).toBe(once.junctions);
  });

  it("TEST8 ROUTE through auto junction", () => {
    const id = seqUuid("t8");
    let graph: InteractionGraph = { nodes: [], edges: [] };
    let draft: string | null = null;
    let step = draw(graph, draft, 0, 0, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    const A = draft;
    step = draw(graph, draft, 200, 0, id);
    graph = step.graph;
    draft = null;
    step = draw(graph, draft, 100, -80, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    step = draw(graph, draft, 100, 80, id);
    graph = step.graph;
    const D = step.draftFromUuid;
    expect(hasPath(graph, A, D)).toBe(true);
  });

  it("SNAP: empty click near node reuses it", () => {
    const id = seqUuid("snap");
    let graph: InteractionGraph = { nodes: [], edges: [] };
    let step = draw(graph, null, 0, 0, id);
    graph = step.graph;
    const A = step.draftFromUuid;
    step = draw(graph, null, 8, 4, id); // within DRAW_NODE_SNAP_CM of A
    graph = step.graph;
    expect(step.draftFromUuid).toBe(A);
    expect(graph.nodes).toHaveLength(1);
  });

  it("display: plain junction = Punkt trasy; auto = Skrzyżowanie (never Punkt N)", () => {
    const plain: RoutingNode = {
      uuid: "p1",
      warehouse_id: 1,
      x: 0,
      y: 0,
      node_type: "junction",
    };
    const cross: RoutingNode = {
      uuid: "x1",
      warehouse_id: 1,
      x: 0,
      y: 0,
      node_type: "junction",
      label: "Skrzyżowanie",
      meta: { auto_intersection: true },
    };
    expect(nodeDisplayName(plain)).toBe("Punkt trasy");
    expect(nodeDisplayName(cross)).toBe("Skrzyżowanie");
    expect(nodeDisplayName(plain)).not.toMatch(/Punkt \d/);
  });

  it("materializeIntersections alone creates connectivity on visual cross", () => {
    const id = seqUuid("mat");
    let graph: InteractionGraph = {
      nodes: [
        { uuid: "a", x: 0, y: 0, node_type: "junction" },
        { uuid: "b", x: 100, y: 0, node_type: "junction" },
        { uuid: "c", x: 50, y: -50, node_type: "junction" },
        { uuid: "d", x: 50, y: 50, node_type: "junction" },
      ],
      edges: [
        {
          uuid: "e1",
          from_node_uuid: "a",
          to_node_uuid: "b",
          distance_m: 1,
          direction: "BOTH",
          enabled: true,
          allowed_processes: [],
          allowed_transport_types: [],
          cost_multiplier: 1,
        },
        {
          uuid: "e2",
          from_node_uuid: "c",
          to_node_uuid: "d",
          distance_m: 1,
          direction: "BOTH",
          enabled: true,
          allowed_processes: [],
          allowed_transport_types: [],
          cost_multiplier: 1,
        },
      ],
    };
    expect(hasPath(graph, "a", "d")).toBe(false);
    graph = materializeIntersections(graph, id) as InteractionGraph;
    expect(hasPath(graph, "a", "d")).toBe(true);
  });
});
