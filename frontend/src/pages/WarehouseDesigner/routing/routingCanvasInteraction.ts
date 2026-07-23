/**
 * Pure interaction helpers for Route Designer canvas.
 * Keeps polyline drawing / selection logic testable without React state races.
 */

export type InteractionNode = {
  uuid: string;
  x: number;
  y: number;
  warehouse_id?: number;
  layout_id?: number | null;
  node_type?: string;
  operational_type?: string | null;
  label?: string | null;
  meta?: Record<string, unknown> | null;
};

export type InteractionEdge = {
  uuid: string;
  from_node_uuid: string;
  to_node_uuid: string;
  distance_m: number;
  direction: string;
  enabled: boolean;
  allowed_processes: string[];
  allowed_transport_types: string[];
  cost_multiplier: number;
  warehouse_id?: number;
  layout_id?: number | null;
  label?: string | null;
  meta?: Record<string, unknown> | null;
};

export type InteractionGraph = {
  nodes: InteractionNode[];
  edges: InteractionEdge[];
};

function distM(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy) / 100;
}

function edgeExists(edges: InteractionEdge[], a: string, b: string): boolean {
  return edges.some(
    (e) =>
      (e.from_node_uuid === a && e.to_node_uuid === b) ||
      (e.from_node_uuid === b && e.to_node_uuid === a)
  );
}

export function makeEdge(
  from: InteractionNode,
  to: InteractionNode,
  newUuid: () => string,
  warehouseId = 0,
  layoutId: number | null = null
): InteractionEdge {
  return {
    uuid: newUuid(),
    warehouse_id: warehouseId,
    layout_id: layoutId,
    from_node_uuid: from.uuid,
    to_node_uuid: to.uuid,
    distance_m: distM(from, to),
    direction: "BOTH",
    enabled: true,
    allowed_processes: [],
    allowed_transport_types: [],
    cost_multiplier: 1,
    label: null,
  };
}

/** Project point onto segment; returns null if far from the segment (cm). */
export function projectOntoSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  maxDistCm = 40
): { x: number; y: number; t: number } | null {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-6) return null;
  let t = ((px - ax) * abx + (py - ay) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * abx;
  const y = ay + t * aby;
  const d = Math.hypot(px - x, py - y);
  if (d > maxDistCm) return null;
  // Avoid splitting at endpoints — reuse nodes instead.
  if (t < 0.05 || t > 0.95) return null;
  return { x, y, t };
}

export function splitEdgeAtCm(
  graph: InteractionGraph,
  edgeUuid: string,
  x: number,
  y: number,
  newUuid: () => string,
  warehouseId = 0,
  layoutId: number | null = null
): { graph: InteractionGraph; junctionUuid: string } | null {
  const edge = graph.edges.find((e) => e.uuid === edgeUuid);
  if (!edge) return null;
  const a = graph.nodes.find((n) => n.uuid === edge.from_node_uuid);
  const b = graph.nodes.find((n) => n.uuid === edge.to_node_uuid);
  if (!a || !b) return null;
  const proj = projectOntoSegment(x, y, a.x, a.y, b.x, b.y);
  if (!proj) return null;

  const junction: InteractionNode = {
    uuid: newUuid(),
    warehouse_id: warehouseId,
    layout_id: layoutId,
    x: proj.x,
    y: proj.y,
    node_type: "junction",
    operational_type: null,
    label: null,
  };
  const e1 = makeEdge(a, junction, newUuid, warehouseId, layoutId);
  e1.direction = edge.direction;
  e1.enabled = edge.enabled;
  e1.allowed_processes = [...(edge.allowed_processes ?? [])];
  e1.allowed_transport_types = [...(edge.allowed_transport_types ?? [])];
  e1.cost_multiplier = edge.cost_multiplier;
  const e2 = makeEdge(junction, b, newUuid, warehouseId, layoutId);
  e2.direction = edge.direction;
  e2.enabled = edge.enabled;
  e2.allowed_processes = [...(edge.allowed_processes ?? [])];
  e2.allowed_transport_types = [...(edge.allowed_transport_types ?? [])];
  e2.cost_multiplier = edge.cost_multiplier;

  return {
    junctionUuid: junction.uuid,
    graph: {
      nodes: [...graph.nodes, junction],
      edges: [...graph.edges.filter((e) => e.uuid !== edgeUuid), e1, e2],
    },
  };
}

/**
 * Continuous polyline draw step.
 * - empty map click → new node (+ edge from draft)
 * - existing node → reuse (+ edge from draft)
 */
export function applyDrawClick(
  graph: InteractionGraph,
  draftFromUuid: string | null,
  click: { kind: "empty"; x: number; y: number } | { kind: "node"; uuid: string },
  newUuid: () => string,
  warehouseId = 0,
  layoutId: number | null = null
): {
  graph: InteractionGraph;
  draftFromUuid: string;
  createdNodeUuid: string | null;
  createdEdgeUuid: string | null;
} {
  let nodes = graph.nodes;
  let edges = graph.edges;
  let target: InteractionNode;
  let createdNodeUuid: string | null = null;

  if (click.kind === "node") {
    const existing = nodes.find((n) => n.uuid === click.uuid);
    if (!existing) {
      return { graph, draftFromUuid: draftFromUuid ?? click.uuid, createdNodeUuid: null, createdEdgeUuid: null };
    }
    target = existing;
  } else {
    target = {
      uuid: newUuid(),
      warehouse_id: warehouseId,
      layout_id: layoutId,
      x: click.x,
      y: click.y,
      node_type: "junction",
      operational_type: null,
      label: null,
    };
    nodes = [...nodes, target];
    createdNodeUuid = target.uuid;
  }

  let createdEdgeUuid: string | null = null;
  if (draftFromUuid && draftFromUuid !== target.uuid) {
    const from = nodes.find((n) => n.uuid === draftFromUuid);
    if (from && !edgeExists(edges, from.uuid, target.uuid)) {
      const edge = makeEdge(from, target, newUuid, warehouseId, layoutId);
      edges = [...edges, edge];
      createdEdgeUuid = edge.uuid;
    }
  }

  return {
    graph: { nodes, edges },
    draftFromUuid: target.uuid,
    createdNodeUuid,
    createdEdgeUuid,
  };
}

export function humanizeRouteTestMessage(
  result: { ok: boolean; message?: string | null; error_code?: string | null },
  edgeCount: number
): string {
  if (result.ok) return result.message?.trim() || "Trasa wyznaczona.";
  if (edgeCount === 0) {
    return "Najpierw narysuj drogę w trybie «Rysuj trasę».";
  }
  const code = (result.error_code || "").toUpperCase();
  if (
    code.includes("NOT_CONFIGURED") ||
    code.includes("NO_EDGES") ||
    /edges/i.test(result.message || "")
  ) {
    return "Nie można wyznaczyć trasy, ponieważ drogi nie są jeszcze połączone.";
  }
  if (code.includes("NO_PATH") || code.includes("DISCONNECTED")) {
    return "Nie znaleziono połączenia między wybranymi punktami.";
  }
  if (code.includes("NODE_NOT_FOUND")) {
    return "Nie znaleziono wybranego punktu na sieci tras.";
  }
  const raw = (result.message || "").trim();
  if (!raw) return "Nie udało się wyznaczyć trasy.";
  // Never leak technical jargon to operators.
  return raw
    .replace(/\bedges?\b/gi, "odcinki")
    .replace(/\bnodes?\b/gi, "punkty")
    .replace(/\bUUID\b/gi, "punkt")
    .replace(/ROUTING_GRAPH_[A-Z0-9_]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
