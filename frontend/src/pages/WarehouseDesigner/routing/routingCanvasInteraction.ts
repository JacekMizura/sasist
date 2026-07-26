/**
 * Pure interaction helpers for Route Designer canvas.
 * Keeps polyline drawing / selection logic testable without React state races.
 */

import { normalizeDrawnGraph } from "./routingDrawNormalize";

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

/** Magnetic snap radii in warehouse cm (draw mode). */
export const DRAW_NODE_SNAP_CM = 28;
export const DRAW_EDGE_SNAP_CM = 36;
/** Prefer 0°/90° when cursor is within this distance of axis from draft origin. */
export const ORTHOGONAL_SNAP_CM = 28;

/**
 * Prefer orthogonal (H/V) continuation from draft origin.
 * Preference only — Shift / freeAngle disables it.
 */
export function preferOrthogonalCm(
  from: { x: number; y: number } | null | undefined,
  x: number,
  y: number,
  opts?: { freeAngle?: boolean; thresholdCm?: number }
): { x: number; y: number; guide: "none" | "h" | "v" } {
  const freeAngle = Boolean(opts?.freeAngle);
  const thresholdCm = opts?.thresholdCm ?? ORTHOGONAL_SNAP_CM;
  if (!from || freeAngle) return { x, y, guide: "none" };
  const dx = Math.abs(x - from.x);
  const dy = Math.abs(y - from.y);
  if (dy <= thresholdCm && dy <= dx) {
    return { x, y: from.y, guide: "h" };
  }
  if (dx <= thresholdCm && dx < dy) {
    return { x: from.x, y, guide: "v" };
  }
  return { x, y, guide: "none" };
}

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
  maxDistCm = DRAW_EDGE_SNAP_CM
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
  layoutId: number | null = null,
  maxDistCm = DRAW_EDGE_SNAP_CM
): { graph: InteractionGraph; junctionUuid: string } | null {
  const edge = graph.edges.find((e) => e.uuid === edgeUuid);
  if (!edge) return null;
  const a = graph.nodes.find((n) => n.uuid === edge.from_node_uuid);
  const b = graph.nodes.find((n) => n.uuid === edge.to_node_uuid);
  if (!a || !b) return null;
  const proj = projectOntoSegment(x, y, a.x, a.y, b.x, b.y, maxDistCm);
  if (!proj) return null;

  const junction: InteractionNode = {
    uuid: newUuid(),
    warehouse_id: warehouseId,
    layout_id: layoutId,
    x: proj.x,
    y: proj.y,
    node_type: "junction",
    operational_type: null,
    label: "Skrzyżowanie",
    meta: { auto_intersection: true },
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

export type DrawSnapTarget =
  | { kind: "node"; uuid: string }
  | { kind: "edge"; uuid: string; x: number; y: number }
  | { kind: "empty"; x: number; y: number };

/**
 * Magnetic draw snap: EXISTING POINT > EXISTING EDGE > EMPTY CANVAS.
 */
export function resolveDrawSnap(
  graph: InteractionGraph,
  x: number,
  y: number,
  opts?: {
    nodeSnapCm?: number;
    edgeSnapCm?: number;
    preferEdgeUuid?: string;
    preferNodeUuid?: string;
  }
): DrawSnapTarget {
  const nodeSnap = opts?.nodeSnapCm ?? DRAW_NODE_SNAP_CM;
  const edgeSnap = opts?.edgeSnapCm ?? DRAW_EDGE_SNAP_CM;

  if (opts?.preferNodeUuid) {
    const n = graph.nodes.find((p) => p.uuid === opts.preferNodeUuid);
    if (n) return { kind: "node", uuid: n.uuid };
  }

  let bestNode: { uuid: string; d: number } | null = null;
  for (const n of graph.nodes) {
    const d = Math.hypot(n.x - x, n.y - y);
    if (d <= nodeSnap && (!bestNode || d < bestNode.d)) {
      bestNode = { uuid: n.uuid, d };
    }
  }
  if (bestNode) return { kind: "node", uuid: bestNode.uuid };

  if (opts?.preferEdgeUuid) {
    const e = graph.edges.find((ed) => ed.uuid === opts.preferEdgeUuid);
    if (e) {
      const a = graph.nodes.find((n) => n.uuid === e.from_node_uuid);
      const b = graph.nodes.find((n) => n.uuid === e.to_node_uuid);
      if (a && b) {
        const proj = projectOntoSegment(x, y, a.x, a.y, b.x, b.y, edgeSnap * 2);
        if (proj) return { kind: "edge", uuid: e.uuid, x: proj.x, y: proj.y };
        const dA = Math.hypot(a.x - x, a.y - y);
        const dB = Math.hypot(b.x - x, b.y - y);
        if (dA <= Math.max(nodeSnap, edgeSnap) && dA <= dB) {
          return { kind: "node", uuid: a.uuid };
        }
        if (dB <= Math.max(nodeSnap, edgeSnap)) {
          return { kind: "node", uuid: b.uuid };
        }
      }
    }
  }

  let bestEdge: { uuid: string; x: number; y: number; d: number } | null = null;
  for (const e of graph.edges) {
    const a = graph.nodes.find((n) => n.uuid === e.from_node_uuid);
    const b = graph.nodes.find((n) => n.uuid === e.to_node_uuid);
    if (!a || !b) continue;
    const proj = projectOntoSegment(x, y, a.x, a.y, b.x, b.y, edgeSnap);
    if (!proj) continue;
    const d = Math.hypot(proj.x - x, proj.y - y);
    if (!bestEdge || d < bestEdge.d) {
      bestEdge = { uuid: e.uuid, x: proj.x, y: proj.y, d };
    }
  }
  if (bestEdge) return { kind: "edge", uuid: bestEdge.uuid, x: bestEdge.x, y: bestEdge.y };

  return { kind: "empty", x, y };
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
      return {
        graph,
        draftFromUuid: draftFromUuid ?? click.uuid,
        createdNodeUuid: null,
        createdEdgeUuid: null,
      };
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

/**
 * Full draw step with magnetic snap + topology normalization
 * (crossings, T-junctions, collinear overlaps).
 */
export function applyDrawStep(
  graph: InteractionGraph,
  draftFromUuid: string | null,
  raw: {
    x: number;
    y: number;
    preferEdgeUuid?: string;
    preferNodeUuid?: string;
    /** Shift: allow free angle (no orthogonal prefer). */
    freeAngle?: boolean;
  },
  newUuid: () => string,
  warehouseId = 0,
  layoutId: number | null = null
): {
  graph: InteractionGraph;
  draftFromUuid: string;
  createdNodeUuid: string | null;
  createdEdgeUuid: string | null;
  snap: DrawSnapTarget;
  orthoGuide: "none" | "h" | "v";
} {
  const draftNode = draftFromUuid
    ? graph.nodes.find((n) => n.uuid === draftFromUuid)
    : null;
  const ortho = preferOrthogonalCm(draftNode, raw.x, raw.y, {
    freeAngle: Boolean(raw.freeAngle),
  });
  const snap = resolveDrawSnap(graph, ortho.x, ortho.y, {
    preferEdgeUuid: raw.preferEdgeUuid,
    preferNodeUuid: raw.preferNodeUuid,
  });

  let g = graph;
  let draft = draftFromUuid;
  let createdNodeUuid: string | null = null;
  let createdEdgeUuid: string | null = null;

  if (snap.kind === "edge") {
    const split = splitEdgeAtCm(g, snap.uuid, snap.x, snap.y, newUuid, warehouseId, layoutId);
    if (split) {
      g = split.graph;
      const continued = applyDrawClick(
        g,
        draft,
        { kind: "node", uuid: split.junctionUuid },
        newUuid,
        warehouseId,
        layoutId
      );
      g = continued.graph;
      draft = continued.draftFromUuid;
      createdNodeUuid = continued.createdNodeUuid ?? split.junctionUuid;
      createdEdgeUuid = continued.createdEdgeUuid;
    } else {
      const edge = g.edges.find((e) => e.uuid === snap.uuid);
      const a = edge && g.nodes.find((n) => n.uuid === edge.from_node_uuid);
      const b = edge && g.nodes.find((n) => n.uuid === edge.to_node_uuid);
      if (a && b) {
        const useA = Math.hypot(a.x - raw.x, a.y - raw.y) <= Math.hypot(b.x - raw.x, b.y - raw.y);
        const continued = applyDrawClick(
          g,
          draft,
          { kind: "node", uuid: useA ? a.uuid : b.uuid },
          newUuid,
          warehouseId,
          layoutId
        );
        g = continued.graph;
        draft = continued.draftFromUuid;
        createdEdgeUuid = continued.createdEdgeUuid;
      }
    }
  } else if (snap.kind === "node") {
    const continued = applyDrawClick(
      g,
      draft,
      { kind: "node", uuid: snap.uuid },
      newUuid,
      warehouseId,
      layoutId
    );
    g = continued.graph;
    draft = continued.draftFromUuid;
    createdEdgeUuid = continued.createdEdgeUuid;
  } else {
    const continued = applyDrawClick(
      g,
      draft,
      { kind: "empty", x: snap.x, y: snap.y },
      newUuid,
      warehouseId,
      layoutId
    );
    g = continued.graph;
    draft = continued.draftFromUuid;
    createdNodeUuid = continued.createdNodeUuid;
    createdEdgeUuid = continued.createdEdgeUuid;
  }

  g = normalizeDrawnGraph(g, newUuid, warehouseId, layoutId) as InteractionGraph;

  if (!g.nodes.some((n) => n.uuid === draft)) {
    draft =
      createdNodeUuid && g.nodes.some((n) => n.uuid === createdNodeUuid)
        ? createdNodeUuid
        : (g.nodes[g.nodes.length - 1]?.uuid ?? draft);
  }

  return {
    graph: g,
    draftFromUuid: draft,
    createdNodeUuid,
    createdEdgeUuid,
    snap,
    orthoGuide: ortho.guide,
  };
}

export function humanizeRouteTestMessage(
  result: { ok: boolean; message?: string | null; error_code?: string | null },
  edgeCount: number
): string {
  if (result.ok) return result.message?.trim() || "Trasa wyznaczona.";
  if (edgeCount === 0) {
    return "Brak sieci tras.";
  }
  const code = (result.error_code || "").toUpperCase();
  if (
    code.includes("NOT_CONFIGURED") ||
    code.includes("NO_EDGES") ||
    /edges/i.test(result.message || "")
  ) {
    return "Brak połączeń.";
  }
  if (code.includes("NO_PATH") || code.includes("DISCONNECTED")) {
    return "Brak trasy.";
  }
  if (code.includes("NODE_NOT_FOUND")) {
    return "Nie znaleziono punktu.";
  }
  if (code.includes("OVERLAPPING")) {
    return "Drogi nachodzą na siebie.";
  }
  const rawMsg = (result.message || "").trim();
  if (!rawMsg) return "Nie udało się wyznaczyć trasy.";
  return rawMsg
    .replace(/\bedges?\b/gi, "odcinki")
    .replace(/\bnodes?\b/gi, "punkty")
    .replace(/\bUUID\b/gi, "punkt")
    .replace(/ROUTING_GRAPH_[A-Z0-9_]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
