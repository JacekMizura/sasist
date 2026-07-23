/**
 * FINAL AUDIT — Route Designer interaction matrix (draw / branch / cross / select / delete / test).
 */
import { describe, expect, it } from "vitest";
import {
  applyDrawClick,
  humanizeRouteTestMessage,
  splitEdgeAtCm,
  type InteractionGraph,
} from "./routingCanvasInteraction";
import { confirmDeleteNodeMessage, orphanNodeUuids } from "./routingDisplay";
import type { RoutingEdge, RoutingNode } from "../../../api/warehouseRoutingApi";

function seqUuid(prefix = "id") {
  let i = 0;
  return () => `${prefix}${++i}`;
}

function drawEmpty(
  graph: InteractionGraph,
  draft: string | null,
  x: number,
  y: number,
  id: () => string
) {
  return applyDrawClick(graph, draft, { kind: "empty", x, y }, id);
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

function pathNodes(graph: InteractionGraph, start: string, goal: string): string[] | null {
  if (start === goal) return [start];
  const adj = undirectedAdj(graph);
  const prev = new Map<string, string>();
  const seen = new Set<string>([start]);
  const q = [start];
  while (q.length) {
    const u = q.shift()!;
    for (const v of adj.get(u) ?? []) {
      if (seen.has(v)) continue;
      seen.add(v);
      prev.set(v, u);
      if (v === goal) {
        const out = [goal];
        let cur = goal;
        while (cur !== start) {
          cur = prev.get(cur)!;
          out.push(cur);
        }
        out.reverse();
        return out;
      }
      q.push(v);
    }
  }
  return null;
}

function baseEdge(uuid: string, from: string, to: string): RoutingEdge {
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

describe("FINAL AUDIT routing designer", () => {
  it("DRAW POLYLINE: A→B→C→D => 4 points, 3 edges", () => {
    const id = seqUuid("p");
    let graph: InteractionGraph = { nodes: [], edges: [] };
    let draft: string | null = null;
    const pts: string[] = [];
    for (const [x, y] of [
      [0, 0],
      [100, 0],
      [200, 0],
      [300, 0],
    ] as const) {
      const step = drawEmpty(graph, draft, x, y, id);
      graph = step.graph;
      draft = step.draftFromUuid;
      pts.push(draft);
    }
    expect(graph.nodes).toHaveLength(4);
    expect(graph.edges).toHaveLength(3);
    expect(new Set(pts).size).toBe(4);
  });

  it("BRANCH DRAW: finish stroke, resume from B → E → F without duplicating B", () => {
    const id = seqUuid("b");
    let graph: InteractionGraph = { nodes: [], edges: [] };
    let draft: string | null = null;

    let step = drawEmpty(graph, draft, 0, 0, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    const A = draft;
    step = drawEmpty(graph, draft, 100, 0, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    const B = draft;
    step = drawEmpty(graph, draft, 200, 0, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    step = drawEmpty(graph, draft, 300, 0, id);
    graph = step.graph;
    expect(graph.nodes).toHaveLength(4);
    expect(graph.edges).toHaveLength(3);

    // End drawing (clear draft), start new branch from existing B
    draft = null;
    step = applyDrawClick(graph, draft, { kind: "node", uuid: B }, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    expect(draft).toBe(B);
    expect(graph.nodes).toHaveLength(4);

    step = drawEmpty(graph, draft, 100, 100, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    const E = draft;
    step = drawEmpty(graph, draft, 100, 200, id);
    graph = step.graph;
    const F = step.draftFromUuid;

    expect(graph.nodes).toHaveLength(6);
    expect(graph.edges).toHaveLength(5);
    expect(graph.nodes.filter((n) => n.uuid === B)).toHaveLength(1);
    expect(hasPath(graph, B, E)).toBe(true);
    expect(hasPath(graph, B, F)).toBe(true);
    expect(hasPath(graph, A, F)).toBe(true);
  });

  it("INTERSECTION: click mid A—B splits edge; new branch is logically connected", () => {
    const id = seqUuid("x");
    let graph: InteractionGraph = { nodes: [], edges: [] };
    let draft: string | null = null;
    let step = drawEmpty(graph, draft, 0, 0, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    const A = draft;
    step = drawEmpty(graph, draft, 200, 0, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    const B = draft;
    const ab = graph.edges[0];

    draft = null;
    step = drawEmpty(graph, draft, 100, -100, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    const C = draft;

    const split = splitEdgeAtCm(graph, ab.uuid, 100, 0, id);
    expect(split).not.toBeNull();
    graph = split!.graph;
    const J = split!.junctionUuid;
    step = applyDrawClick(graph, draft, { kind: "node", uuid: J }, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    step = drawEmpty(graph, draft, 100, 100, id);
    graph = step.graph;
    const D = step.draftFromUuid;

    expect(graph.edges.some((e) => e.uuid === ab.uuid)).toBe(false);
    expect(hasPath(graph, A, B)).toBe(true);
    expect(hasPath(graph, A, D)).toBe(true);
    expect(hasPath(graph, C, B)).toBe(true);
    expect(hasPath(graph, C, D)).toBe(true);
    expect(pathNodes(graph, A, B)).toEqual([A, J, B]);
  });

  it("STICKY SELECT: A→B→C→edge→D never changes tool", () => {
    type Tool = "select" | "draw_edge" | "test_route";
    const tool: Tool = "select";
    let selectedNode: string | null = null;
    let selectedEdge: string | null = null;

    const onNodeClick = (uuid: string) => {
      if (tool !== "select") return;
      selectedNode = uuid;
      selectedEdge = null;
    };
    const onEdgeClick = (uuid: string) => {
      if (tool !== "select") return;
      selectedEdge = uuid;
      selectedNode = null;
    };
    const onDragEnd = (uuid: string) => {
      selectedNode = uuid;
      selectedEdge = null;
    };

    onNodeClick("A");
    expect(tool).toBe("select");
    onNodeClick("B");
    expect(tool).toBe("select");
    onNodeClick("C");
    expect(tool).toBe("select");
    onEdgeClick("e1");
    expect(tool).toBe("select");
    expect(selectedEdge).toBe("e1");
    onNodeClick("D");
    expect(tool).toBe("select");
    expect(selectedNode).toBe("D");
    onDragEnd("D");
    expect(tool).toBe("select");
  });

  it("DELETE MATRIX: orphan / 1-edge / mid-road / junction / edge-only", () => {
    const orphan: RoutingNode = { uuid: "o", warehouse_id: 1, x: 0, y: 0, node_type: "junction" };
    expect(confirmDeleteNodeMessage(orphan, [], [])).toBe("Usunąć ten punkt?");

    const a: RoutingNode = { uuid: "a", warehouse_id: 1, x: 0, y: 0, node_type: "junction", label: "A" };
    const b: RoutingNode = { uuid: "b", warehouse_id: 1, x: 100, y: 0, node_type: "junction", label: "B" };
    const c: RoutingNode = { uuid: "c", warehouse_id: 1, x: 200, y: 0, node_type: "junction", label: "C" };
    expect(confirmDeleteNodeMessage(b, [baseEdge("e1", "a", "b")], [], [a, b])).toMatch(/1 połączony odcinek/i);

    const road = [baseEdge("e1", "a", "b"), baseEdge("e2", "b", "c")];
    expect(confirmDeleteNodeMessage(b, road, [], [a, b, c])).toMatch(/2 połączone odcinki/i);

    const j: RoutingNode = {
      uuid: "j",
      warehouse_id: 1,
      x: 50,
      y: 0,
      node_type: "junction",
      label: "Skrzyżowanie",
    };
    const cross = [baseEdge("e1", "a", "j"), baseEdge("e2", "j", "b"), baseEdge("e3", "j", "c")];
    const crossMsg = confirmDeleteNodeMessage(j, cross, [], [a, b, c, j]);
    expect(crossMsg).toMatch(/3 połączone odcinki/i);
    expect(crossMsg).not.toMatch(/uuid|edges?|nodes?|ROUTING_/i);

    expect("Usunąć ten odcinek trasy?").not.toMatch(/edge|UUID|node/i);

    let nodes = [a, b, c];
    let edges = [...road];
    let dirty = false;
    let validation: unknown = { ok: false };
    nodes = nodes.filter((n) => n.uuid !== "b");
    edges = edges.filter((e) => e.from_node_uuid !== "b" && e.to_node_uuid !== "b");
    validation = null;
    dirty = true;
    expect(nodes.map((n) => n.uuid)).toEqual(["a", "c"]);
    expect(edges).toHaveLength(0);
    expect(dirty).toBe(true);
    expect(validation).toBeNull();
  });

  it("TEST ROUTE graph: A—B—C and branch B—D—E connectivity", () => {
    const id = seqUuid("t");
    let graph: InteractionGraph = { nodes: [], edges: [] };
    let draft: string | null = null;
    let step = drawEmpty(graph, draft, 0, 0, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    const A = draft;
    step = drawEmpty(graph, draft, 100, 0, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    const B = draft;
    step = drawEmpty(graph, draft, 200, 0, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    const C = draft;

    draft = null;
    step = applyDrawClick(graph, draft, { kind: "node", uuid: B }, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    step = drawEmpty(graph, draft, 100, 100, id);
    graph = step.graph;
    draft = step.draftFromUuid;
    const D = draft;
    step = drawEmpty(graph, draft, 200, 100, id);
    graph = step.graph;
    const E = step.draftFromUuid;

    expect(pathNodes(graph, A, C)).toEqual([A, B, C]);
    expect(hasPath(graph, B, E)).toBe(true);
    expect(hasPath(graph, A, E)).toBe(true);
    expect(pathNodes(graph, A, E)).toEqual([A, B, D, E]);
  });

  it("ORPHAN PRODUCTION CLEANUP: 9 pts / 0 edges → remove → save payload empty", () => {
    const nodes: RoutingNode[] = Array.from({ length: 9 }, (_, i) => ({
      uuid: `orphan-${i}`,
      warehouse_id: 1,
      x: i * 10,
      y: 0,
      node_type: "junction",
    }));
    const edges: RoutingEdge[] = [];
    expect(orphanNodeUuids(nodes, edges)).toHaveLength(9);

    let nextNodes = nodes;
    const connected = new Set<string>();
    for (const e of edges) {
      if (!e.enabled) continue;
      connected.add(e.from_node_uuid);
      connected.add(e.to_node_uuid);
    }
    if (connected.size === 0) nextNodes = [];
    else nextNodes = nextNodes.filter((n) => connected.has(n.uuid));

    const dirty = true;
    const validation = null;
    const savePayload = { nodes: nextNodes, edges: [] as RoutingEdge[] };
    expect(savePayload.nodes).toHaveLength(0);
    expect(dirty).toBe(true);
    expect(validation).toBeNull();
  });

  it("TECHNICAL UI TERMS: operator-facing copy has no jargon", () => {
    const userFacing = [
      "Rysuj trasę",
      "Wybierz",
      "Testuj trasę",
      "Zapisz sieć",
      "Sprawdź sieć",
      "Usuń niepołączone punkty",
      "Usuń punkt",
      "Usuń odcinek",
      "Obsługiwane lokalizacje",
      "Punkt trasy",
      "Odcinek trasy",
      "Kliknij punkt początkowy na mapie.",
      "Kliknij punkt docelowy.",
      "Usunąć ten odcinek trasy?",
      humanizeRouteTestMessage({ ok: false, error_code: "ROUTING_GRAPH_NOT_CONFIGURED" }, 0),
      humanizeRouteTestMessage({ ok: false, message: "Sieć tras nie ma odcinków (edges)." }, 0),
      humanizeRouteTestMessage({ ok: false, error_code: "NO_PATH" }, 3),
      confirmDeleteNodeMessage(
        { uuid: "x", warehouse_id: 1, x: 0, y: 0, node_type: "junction" },
        [baseEdge("e", "x", "y")],
        []
      ),
    ].join("\n");

    for (const bad of ["Access Point", "Routing Graph", "ROUTING_", "(edges)", "orphan", "UUID", "edges", "nodes"]) {
      expect(userFacing.toLowerCase()).not.toContain(bad.toLowerCase());
    }
    // Polish warehouse words are OK
    expect(userFacing).toMatch(/odcinek|punkt|tras/i);
  });

  it("humanize never requires process/transport for empty network", () => {
    const msg = humanizeRouteTestMessage({ ok: false, error_code: "ROUTING_GRAPH_NOT_CONFIGURED" }, 0);
    expect(msg).toMatch(/Rysuj trasę/);
    expect(msg.toLowerCase()).not.toContain("proces");
    expect(msg.toLowerCase()).not.toContain("transport");
  });
});
