/**
 * Draw-time topology normalization for Route Designer.
 * Crossings / T-junctions / collinear overlaps become real shared junctions
 * while drawing — not only on backend save.
 *
 * Types are duplicated lightly to avoid circular imports with routingCanvasInteraction.
 */

export type NormNode = {
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

export type NormEdge = {
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

export type NormGraph = { nodes: NormNode[]; edges: NormEdge[] };

const EPS = 1e-4;
const SNAP_EPS_CM = 2.0;

function distM(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y) / 100;
}

function makeNormEdge(
  from: NormNode,
  to: NormNode,
  newUuid: () => string,
  warehouseId = 0,
  layoutId: number | null = null,
  template?: NormEdge
): NormEdge {
  return {
    uuid: newUuid(),
    warehouse_id: warehouseId,
    layout_id: layoutId,
    from_node_uuid: from.uuid,
    to_node_uuid: to.uuid,
    distance_m: distM(from, to),
    direction: template?.direction ?? "BOTH",
    enabled: template?.enabled ?? true,
    allowed_processes: [...(template?.allowed_processes ?? [])],
    allowed_transport_types: [...(template?.allowed_transport_types ?? [])],
    cost_multiplier: template?.cost_multiplier ?? 1,
    label: null,
  };
}

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
}

function onSegment(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  eps = EPS
): boolean {
  return (
    Math.min(ax, bx) - eps <= cx &&
    cx <= Math.max(ax, bx) + eps &&
    Math.min(ay, by) - eps <= cy &&
    cy <= Math.max(ay, by) + eps
  );
}

function nearEndpoint(
  x: number,
  y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  eps: number
): boolean {
  return (
    (Math.abs(x - ax) <= eps && Math.abs(y - ay) <= eps) ||
    (Math.abs(x - bx) <= eps && Math.abs(y - by) <= eps)
  );
}

/** Proper segment intersection (excluding shared endpoints). Matches backend semantics. */
export function segmentIntersection(
  a1: [number, number],
  a2: [number, number],
  b1: [number, number],
  b2: [number, number],
  eps = 1e-4
): [number, number] | null {
  const [ax, ay] = a1;
  const [bx, by] = a2;
  const [cx, cy] = b1;
  const [dx, dy] = b2;

  const o1 = orient(ax, ay, bx, by, cx, cy);
  const o2 = orient(ax, ay, bx, by, dx, dy);
  const o3 = orient(cx, cy, dx, dy, ax, ay);
  const o4 = orient(cx, cy, dx, dy, bx, by);

  if (Math.abs(o1) < eps && onSegment(ax, ay, bx, by, cx, cy)) {
    if (!nearEndpoint(cx, cy, ax, ay, bx, by, eps)) return [cx, cy];
    return null;
  }
  if (Math.abs(o2) < eps && onSegment(ax, ay, bx, by, dx, dy)) {
    if (!nearEndpoint(dx, dy, ax, ay, bx, by, eps)) return [dx, dy];
    return null;
  }

  if (o1 * o2 < 0 && o3 * o4 < 0) {
    const denom = (ax - bx) * (cy - dy) - (ay - by) * (cx - dx);
    if (Math.abs(denom) < eps) return null;
    const px =
      ((ax * by - ay * bx) * (cx - dx) - (ax - bx) * (cx * dy - cy * dx)) / denom;
    const py =
      ((ax * by - ay * bx) * (cy - dy) - (ay - by) * (cx * dy - cy * dx)) / denom;
    if (
      nearEndpoint(px, py, ax, ay, bx, by, eps) ||
      nearEndpoint(px, py, cx, cy, dx, dy, eps)
    ) {
      return null;
    }
    return [px, py];
  }
  return null;
}

export function segmentsOverlapCollinear(
  a1: [number, number],
  a2: [number, number],
  b1: [number, number],
  b2: [number, number],
  eps = 1e-3
): boolean {
  const [ax, ay] = a1;
  const [bx, by] = a2;
  const [cx, cy] = b1;
  const [dx, dy] = b2;
  const scale = Math.max(1, Math.abs(bx - ax) + Math.abs(by - ay));
  if (Math.abs(orient(ax, ay, bx, by, cx, cy)) > eps * scale) return false;
  if (Math.abs(orient(ax, ay, bx, by, dx, dy)) > eps * scale) return false;
  let aLo: number;
  let aHi: number;
  let bLo: number;
  let bHi: number;
  if (Math.abs(bx - ax) >= Math.abs(by - ay)) {
    [aLo, aHi] = [ax, bx].sort((p, q) => p - q);
    [bLo, bHi] = [cx, dx].sort((p, q) => p - q);
  } else {
    [aLo, aHi] = [ay, by].sort((p, q) => p - q);
    [bLo, bHi] = [cy, dy].sort((p, q) => p - q);
  }
  return Math.min(aHi, bHi) - Math.max(aLo, bLo) > eps;
}

function splitEdgeAtPoint(
  fromXy: [number, number],
  toXy: [number, number],
  point: [number, number],
  eps = 1e-3
): boolean {
  if (nearEndpoint(point[0], point[1], fromXy[0], fromXy[1], toXy[0], toXy[1], eps)) {
    return false;
  }
  return onSegment(fromXy[0], fromXy[1], toXy[0], toXy[1], point[0], point[1], eps);
}

function copyEdgeAttrs(src: NormEdge, partial: Partial<NormEdge>): NormEdge {
  return {
    ...src,
    ...partial,
    allowed_processes: [...(src.allowed_processes ?? [])],
    allowed_transport_types: [...(src.allowed_transport_types ?? [])],
  };
}

function findNearbyNode(
  nodes: NormNode[],
  x: number,
  y: number,
  epsCm = SNAP_EPS_CM
): NormNode | null {
  for (const n of nodes) {
    if (Math.abs(n.x - x) <= epsCm && Math.abs(n.y - y) <= epsCm) return n;
  }
  return null;
}

/** Insert junctions at proper crossings / mid-segment touches (draw-time). */
export function materializeIntersections(
  graph: NormGraph,
  newUuid: () => string,
  warehouseId = 0,
  layoutId: number | null = null
): NormGraph {
  let nodes = [...graph.nodes];
  let edges = [...graph.edges];
  let changed = true;
  let safety = 0;

  while (changed && safety < 500) {
    safety += 1;
    changed = false;
    const byUuid = new Map(nodes.map((n) => [n.uuid, n]));
    const n = edges.length;
    outer: for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const e1 = edges[i]!;
        const e2 = edges[j]!;
        const n1a = byUuid.get(e1.from_node_uuid);
        const n1b = byUuid.get(e1.to_node_uuid);
        const n2a = byUuid.get(e2.from_node_uuid);
        const n2b = byUuid.get(e2.to_node_uuid);
        if (!n1a || !n1b || !n2a || !n2b) continue;
        const shared = new Set([e1.from_node_uuid, e1.to_node_uuid]);
        if (shared.has(e2.from_node_uuid) || shared.has(e2.to_node_uuid)) continue;

        const hit = segmentIntersection(
          [n1a.x, n1a.y],
          [n1b.x, n1b.y],
          [n2a.x, n2a.y],
          [n2b.x, n2b.y]
        );
        if (!hit) continue;
        let [hx, hy] = hit;
        let junction = findNearbyNode(nodes, hx, hy);
        if (!junction) {
          junction = {
            uuid: newUuid(),
            warehouse_id: warehouseId,
            layout_id: layoutId,
            x: hx,
            y: hy,
            node_type: "junction",
            operational_type: null,
            label: "Skrzyżowanie",
            meta: { auto_intersection: true },
          };
          nodes = [...nodes, junction];
        } else {
          hx = junction.x;
          hy = junction.y;
        }
        const jUuid = junction.uuid;

        const splitOne = (edge: NormEdge): NormEdge[] => {
          const fa = byUuid.get(edge.from_node_uuid)!;
          const tb = byUuid.get(edge.to_node_uuid)!;
          if (!splitEdgeAtPoint([fa.x, fa.y], [tb.x, tb.y], [hx, hy])) {
            return [edge];
          }
          return [
            copyEdgeAttrs(edge, {
              uuid: newUuid(),
              from_node_uuid: edge.from_node_uuid,
              to_node_uuid: jUuid,
              distance_m: Math.hypot(fa.x - hx, fa.y - hy) / 100,
            }),
            copyEdgeAttrs(edge, {
              uuid: newUuid(),
              from_node_uuid: jUuid,
              to_node_uuid: edge.to_node_uuid,
              distance_m: Math.hypot(hx - tb.x, hy - tb.y) / 100,
            }),
          ];
        };

        const next: NormEdge[] = [];
        for (let k = 0; k < edges.length; k++) {
          if (k === i || k === j) continue;
          next.push(edges[k]!);
        }
        next.push(...splitOne(e1), ...splitOne(e2));
        edges = next;
        changed = true;
        break outer;
      }
    }
  }

  const byUuid = new Map(nodes.map((n) => [n.uuid, n]));
  edges = edges.map((e) => {
    const a = byUuid.get(e.from_node_uuid);
    const b = byUuid.get(e.to_node_uuid);
    if (!a || !b) return e;
    return { ...e, distance_m: distM(a, b) };
  });
  return { nodes, edges };
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Collapse collinear overlapping edges into a non-overlapping chain
 * along the shared line (reuse endpoints; no stacked duplicates).
 */
export function collapseCollinearOverlaps(
  graph: NormGraph,
  newUuid: () => string,
  warehouseId = 0,
  layoutId: number | null = null
): NormGraph {
  let nodes = [...graph.nodes];
  let edges = [...graph.edges];
  let changed = true;
  let safety = 0;

  while (changed && safety < 200) {
    safety += 1;
    changed = false;
    const byUuid = new Map(nodes.map((n) => [n.uuid, n]));

    outer: for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const e1 = edges[i]!;
        const e2 = edges[j]!;
        const a = byUuid.get(e1.from_node_uuid);
        const b = byUuid.get(e1.to_node_uuid);
        const c = byUuid.get(e2.from_node_uuid);
        const d = byUuid.get(e2.to_node_uuid);
        if (!a || !b || !c || !d) continue;
        if (
          !segmentsOverlapCollinear([a.x, a.y], [b.x, b.y], [c.x, c.y], [d.x, d.y])
        ) {
          continue;
        }

        const useX = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
        const proj = (n: NormNode) => (useX ? n.x : n.y);
        const unique = new Map<string, NormNode>();
        for (const n of [a, b, c, d]) {
          let found: NormNode | null = null;
          for (const existing of unique.values()) {
            if (Math.abs(proj(existing) - proj(n)) <= SNAP_EPS_CM) {
              found = existing;
              break;
            }
          }
          if (!found) unique.set(n.uuid, n);
        }
        const sorted = [...unique.values()].sort((p, q) => proj(p) - proj(q));
        if (sorted.length < 2) continue;

        const template = e1.enabled ? e1 : e2;
        const keep = edges.filter((_, k) => k !== i && k !== j);
        const seen = new Set(keep.map((e) => edgeKey(e.from_node_uuid, e.to_node_uuid)));
        const added: NormEdge[] = [];
        for (let t = 0; t < sorted.length - 1; t++) {
          const u = sorted[t]!;
          const v = sorted[t + 1]!;
          const key = edgeKey(u.uuid, v.uuid);
          if (seen.has(key)) continue;
          seen.add(key);
          added.push(makeNormEdge(u, v, newUuid, warehouseId, layoutId, template));
        }
        edges = [...keep, ...added];
        changed = true;
        break outer;
      }
    }
  }

  return { nodes, edges };
}

/** Full draw-time topology pass after each stroke step. */
export function normalizeDrawnGraph(
  graph: NormGraph,
  newUuid: () => string,
  warehouseId = 0,
  layoutId: number | null = null
): NormGraph {
  let g = materializeIntersections(graph, newUuid, warehouseId, layoutId);
  g = collapseCollinearOverlaps(g, newUuid, warehouseId, layoutId);
  g = materializeIntersections(g, newUuid, warehouseId, layoutId);
  return g;
}
