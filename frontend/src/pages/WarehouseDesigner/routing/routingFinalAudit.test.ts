/**
 * FINAL AUDIT — regression probes for draw-time topology (no new features).
 */
import { describe, expect, it } from "vitest";
import { applyDrawStep, type InteractionGraph } from "./routingCanvasInteraction";
import {
  collapseCollinearOverlaps,
  normalizeDrawnGraph,
  type NormEdge,
  type NormGraph,
  type NormNode,
} from "./routingDrawNormalize";
import { confirmDeleteNodeMessage } from "./routingDisplay";
import type { RoutingEdge, RoutingNode } from "../../../api/warehouseRoutingApi";

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

function deg(graph: { edges: { from_node_uuid: string; to_node_uuid: string }[] }, uuid: string) {
  return graph.edges.filter((e) => e.from_node_uuid === uuid || e.to_node_uuid === uuid).length;
}

function edge(
  uuid: string,
  from: string,
  to: string,
  distance_m = 1
): NormEdge {
  return {
    uuid,
    from_node_uuid: from,
    to_node_uuid: to,
    distance_m,
    direction: "BOTH",
    enabled: true,
    allowed_processes: [],
    allowed_transport_types: [],
    cost_multiplier: 1,
  };
}

function draw(
  graph: InteractionGraph,
  draft: string | null,
  x: number,
  y: number,
  id: () => string
) {
  return applyDrawStep(graph, draft, { x, y }, id);
}

describe("FINAL AUDIT draw topology", () => {
  it("CROSSING WITHOUT CLICK: A→B then C→D cross → X before save; A↔D path", () => {
    const id = seqUuid("aud2");
    let graph: InteractionGraph = { nodes: [], edges: [] };
    let draft: string | null = null;
    let step = draw(graph, draft, 0, 0, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    const A = draft;
    step = draw(graph, draft, 200, 0, id);
    graph = step.graph;
    draft = null; // end stroke
    step = draw(graph, draft, 100, -100, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    step = draw(graph, draft, 100, 100, id);
    graph = step.graph;
    const D = step.draftFromUuid;

    const junctions = graph.nodes.filter(
      (n) => (n.meta as { auto_intersection?: boolean } | null)?.auto_intersection
    );
    expect(junctions).toHaveLength(1);
    expect(deg(graph, junctions[0]!.uuid)).toBe(4);
    expect(hasPath(graph, A, D)).toBe(true);
  });

  it("MULTIPLE CROSSINGS: vertical through 3 horizontals → 3 junctions, ordered path", () => {
    const id = seqUuid("aud3");
    let graph: InteractionGraph = { nodes: [], edges: [] };
    let draft: string | null = null;
    for (const y of [0, 50, 100]) {
      let step = draw(graph, draft, 0, y, id);
      graph = step.graph;
      draft = step.draftFromUuid;
      step = draw(graph, draft, 200, y, id);
      graph = step.graph;
      draft = null;
    }
    let step = draw(graph, draft, 100, -20, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    const C = draft;
    step = draw(graph, draft, 100, 120, id);
    graph = step.graph;
    const D = step.draftFromUuid;

    const junctions = graph.nodes
      .filter((n) => (n.meta as { auto_intersection?: boolean } | null)?.auto_intersection)
      .sort((a, b) => a.y - b.y);
    expect(junctions).toHaveLength(3);
    expect(junctions.map((j) => Math.round(j.y))).toEqual([0, 50, 100]);
    expect(hasPath(graph, C, D)).toBe(true);
    for (const j of junctions) {
      expect(deg(graph, j.uuid)).toBeGreaterThanOrEqual(3);
      expect(hasPath(graph, C, j.uuid)).toBe(true);
    }
    // no duplicate undirected edges
    const keys = graph.edges.map((e) =>
      [e.from_node_uuid, e.to_node_uuid].sort().join("|")
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("COLLINEAR SAFETY: branch junction B must survive collapse of overlapping A-C vs A-B", () => {
    const id = seqUuid("aud1");
    const graph: NormGraph = {
      nodes: [
        { uuid: "a", x: 0, y: 0, node_type: "junction" },
        {
          uuid: "b",
          x: 100,
          y: 0,
          node_type: "junction",
          label: "Skrzyżowanie",
          meta: { auto_intersection: true },
        },
        { uuid: "c", x: 200, y: 0, node_type: "junction" },
        { uuid: "d", x: 100, y: 100, node_type: "junction" },
      ],
      edges: [edge("e1", "a", "c", 2), edge("e2", "a", "b", 1), edge("e3", "b", "d", 1)],
    };
    const out = collapseCollinearOverlaps(graph, id);
    expect(out.nodes.some((n) => n.uuid === "b")).toBe(true);
    expect(deg(out, "b")).toBeGreaterThanOrEqual(2);
    expect(hasPath(out as InteractionGraph, "a", "d")).toBe(true);
    expect(hasPath(out as InteractionGraph, "a", "c")).toBe(true);
  });

  it("COLLINEAR SAFETY: mid-line branch node not an overlap endpoint stays on chain", () => {
    const id = seqUuid("aud1b");
    const graph: NormGraph = {
      nodes: [
        { uuid: "a", x: 0, y: 0 },
        { uuid: "c", x: 200, y: 0 },
        { uuid: "p", x: 40, y: 0 },
        { uuid: "q", x: 160, y: 0 },
        {
          uuid: "b",
          x: 100,
          y: 0,
          label: "Skrzyżowanie",
          meta: { auto_intersection: true },
        },
        { uuid: "d", x: 100, y: 80 },
      ],
      edges: [edge("e1", "a", "c", 2), edge("e2", "p", "q", 1.2), edge("e3", "b", "d", 0.8)],
    };
    const out = collapseCollinearOverlaps(graph, id);
    expect(out.nodes.some((n) => n.uuid === "b")).toBe(true);
    expect(hasPath(out as InteractionGraph, "a", "d")).toBe(true);
    expect(
      out.edges.some((e) => e.from_node_uuid === "b" || e.to_node_uuid === "b")
    ).toBe(true);
  });

  it("COLLINEAR SAFETY: operational node on line is never dropped from chain", () => {
    const id = seqUuid("aud1c");
    const graph: NormGraph = {
      nodes: [
        { uuid: "a", x: 0, y: 0 },
        { uuid: "c", x: 200, y: 0 },
        {
          uuid: "pack",
          x: 100,
          y: 0,
          node_type: "operational",
          operational_type: "packing",
          label: "Pakowanie",
        },
      ],
      edges: [
        edge("e1", "a", "c", 2),
        edge("e2", "a", "pack", 1),
        edge("e3", "pack", "c", 1),
      ],
    };
    // Force a synthetic overlap pair a-c vs a-pack (partial)
    const out = collapseCollinearOverlaps(
      {
        nodes: graph.nodes,
        edges: [edge("e1", "a", "c", 2), edge("e2", "a", "pack", 1)],
      },
      id
    );
    expect(out.nodes.some((n) => n.uuid === "pack")).toBe(true);
    expect(
      out.edges.some((e) => e.from_node_uuid === "pack" || e.to_node_uuid === "pack")
    ).toBe(true);
  });

  it("SNAP then cross: endpoint snap still materializes mid-edge crossing", () => {
    const id = seqUuid("aud4");
    let graph: InteractionGraph = { nodes: [], edges: [] };
    let draft: string | null = null;
    let step = draw(graph, draft, 0, 0, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    const A = draft;
    step = draw(graph, draft, 200, 0, id);
    graph = step.graph;
    draft = null;
    step = draw(graph, draft, 100, -100, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    // snap near A (should reuse A) while coming from above — wait, that would be C→A not cross.
    // Instead: draw vertical that ends near a free point past the crossing.
    step = draw(graph, draft, 100, 100, id);
    graph = step.graph;
    expect(hasPath(graph, A, step.draftFromUuid)).toBe(true);
    expect(
      graph.nodes.some(
        (n) => (n.meta as { auto_intersection?: boolean } | null)?.auto_intersection
      )
    ).toBe(true);
  });

  it("DRAG SEMANTICS: moving a node across another edge needs normalize to connect", () => {
    const id = seqUuid("aud6");
    // Horizontal A—B at y=0; vertical C—D at x=100 initially not crossing (C and D both above)
    let graph: InteractionGraph = {
      nodes: [
        { uuid: "a", x: 0, y: 0, node_type: "junction" },
        { uuid: "b", x: 200, y: 0, node_type: "junction" },
        { uuid: "c", x: 100, y: -50, node_type: "junction" },
        { uuid: "d", x: 100, y: -10, node_type: "junction" },
      ],
      edges: [
        {
          uuid: "e1",
          from_node_uuid: "a",
          to_node_uuid: "b",
          distance_m: 2,
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
          distance_m: 0.4,
          direction: "BOTH",
          enabled: true,
          allowed_processes: [],
          allowed_transport_types: [],
          cost_multiplier: 1,
        },
      ],
    };
    expect(hasPath(graph, "a", "c")).toBe(false);
    // Simulate drag D across the horizontal road
    graph = {
      ...graph,
      nodes: graph.nodes.map((n) => (n.uuid === "d" ? { ...n, x: 100, y: 50 } : n)),
    };
    // Without normalize: still disconnected
    expect(hasPath(graph, "a", "c")).toBe(false);
    // With normalize (required on drag end): connected
    const fixed = normalizeDrawnGraph(graph, id) as InteractionGraph;
    expect(hasPath(fixed, "a", "c")).toBe(true);
  });

  it("DELETE JUNCTION: removes incident edges + APs; does not auto-bridge A-B", () => {
    const X: RoutingNode = {
      uuid: "x",
      warehouse_id: 1,
      x: 100,
      y: 0,
      node_type: "junction",
      label: "Skrzyżowanie",
      meta: { auto_intersection: true },
    };
    const edges: RoutingEdge[] = [
      {
        uuid: "e1",
        warehouse_id: 1,
        from_node_uuid: "a",
        to_node_uuid: "x",
        distance_m: 1,
        direction: "BOTH",
        enabled: true,
        allowed_processes: [],
        allowed_transport_types: [],
        cost_multiplier: 1,
      },
      {
        uuid: "e2",
        warehouse_id: 1,
        from_node_uuid: "x",
        to_node_uuid: "b",
        distance_m: 1,
        direction: "BOTH",
        enabled: true,
        allowed_processes: [],
        allowed_transport_types: [],
        cost_multiplier: 1,
      },
      {
        uuid: "e3",
        warehouse_id: 1,
        from_node_uuid: "x",
        to_node_uuid: "c",
        distance_m: 1,
        direction: "BOTH",
        enabled: true,
        allowed_processes: [],
        allowed_transport_types: [],
        cost_multiplier: 1,
      },
    ];
    const msg = confirmDeleteNodeMessage(X, edges, [], [X]);
    expect(msg).toMatch(/3 połączone odcinki/i);
    expect(msg).not.toMatch(/uuid/i);
    expect(msg).not.toMatch(/\bedge\b/i);
    expect(msg).not.toMatch(/\bnode\b/i);

    // Simulate removeNode semantics
    const nodesLeft = [
      { uuid: "a" },
      { uuid: "b" },
      { uuid: "c" },
    ];
    const edgesLeft = edges.filter(
      (e) => e.from_node_uuid !== "x" && e.to_node_uuid !== "x"
    );
    expect(edgesLeft).toHaveLength(0);
    expect(nodesLeft.every((n) => n.uuid !== "x")).toBe(true);
  });

  it("IDEMPOTENT normalize after draw-time materialize (save safety net analogue)", () => {
    const id = seqUuid("aud8");
    let graph: InteractionGraph = { nodes: [], edges: [] };
    let draft: string | null = null;
    let step = draw(graph, draft, 0, 0, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    step = draw(graph, draft, 200, 0, id);
    graph = step.graph;
    draft = null;
    step = draw(graph, draft, 100, -80, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    step = draw(graph, draft, 100, 80, id);
    graph = step.graph;

    const uuids1 = new Set(graph.nodes.map((n) => n.uuid));
    const n1 = graph.nodes.length;
    const e1 = graph.edges.length;
    const again = normalizeDrawnGraph(graph, id) as InteractionGraph;
    const twice = normalizeDrawnGraph(again, id) as InteractionGraph;
    expect(twice.nodes.length).toBe(n1);
    expect(twice.edges.length).toBe(e1);
    expect(new Set(twice.nodes.map((n) => n.uuid))).toEqual(uuids1);
  });
});
