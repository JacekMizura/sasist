/**
 * Hit-test priority for Route Designer (select tool).
 * POINT > EDGE > empty — nodes must win over wide edge strokes at endpoints.
 */

export const NODE_HIT_RADIUS_PX = 13; // ~26px diameter interactive target
export const EDGE_HIT_HALF_PX = 6; // invisible stroke ~12px

export type HitNode = { uuid: string; x: number; y: number };
export type HitEdge = {
  uuid: string;
  from_node_uuid: string;
  to_node_uuid: string;
};

/** Distance from point P to segment AB in the same coordinate space. */
export function distPointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-9) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * abx + (py - ay) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * abx;
  const qy = ay + t * aby;
  return Math.hypot(px - qx, py - qy);
}

/**
 * Pick what a select-mode click should select.
 * Coordinates are SVG/screen pixels (already scaled), same space as rendered geometry.
 */
export function resolveSelectHit(args: {
  xPx: number;
  yPx: number;
  nodes: HitNode[];
  edges: HitEdge[];
  /** map uuid → {x,y} in same px space */
  nodePx: Map<string, { x: number; y: number }>;
  nodeHitRadiusPx?: number;
  edgeHitHalfPx?: number;
}): { kind: "node"; uuid: string } | { kind: "edge"; uuid: string } | { kind: "empty" } {
  const nodeR = args.nodeHitRadiusPx ?? NODE_HIT_RADIUS_PX;
  const edgeHalf = args.edgeHitHalfPx ?? EDGE_HIT_HALF_PX;

  let bestNode: { uuid: string; d: number } | null = null;
  for (const n of args.nodes) {
    const p = args.nodePx.get(n.uuid);
    if (!p) continue;
    const d = Math.hypot(args.xPx - p.x, args.yPx - p.y);
    if (d <= nodeR && (!bestNode || d < bestNode.d)) {
      bestNode = { uuid: n.uuid, d };
    }
  }
  if (bestNode) return { kind: "node", uuid: bestNode.uuid };

  let bestEdge: { uuid: string; d: number } | null = null;
  for (const e of args.edges) {
    const a = args.nodePx.get(e.from_node_uuid);
    const b = args.nodePx.get(e.to_node_uuid);
    if (!a || !b) continue;
    const d = distPointToSegment(args.xPx, args.yPx, a.x, a.y, b.x, b.y);
    if (d <= edgeHalf && (!bestEdge || d < bestEdge.d)) {
      bestEdge = { uuid: e.uuid, d };
    }
  }
  if (bestEdge) return { kind: "edge", uuid: bestEdge.uuid };

  return { kind: "empty" };
}
