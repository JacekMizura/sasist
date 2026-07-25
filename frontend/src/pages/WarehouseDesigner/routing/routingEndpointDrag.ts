/**
 * Pure snap logic for edge endpoint rewire on canvas (Edit mode).
 * Prefer existing node; otherwise ghost a new junction on grid.
 */

import { DRAW_NODE_SNAP_CM } from "./routingCanvasInteraction";

export type EndpointDragEnd = "from" | "to";

export type EndpointSnapPreview =
  | { kind: "node"; uuid: string; x: number; y: number }
  | { kind: "ghost"; x: number; y: number };

export type EndpointRewireDropTarget =
  | { kind: "node"; uuid: string }
  | { kind: "new"; x: number; y: number };

type SnapNode = { uuid: string; x: number; y: number };

/**
 * Resolve snap while dragging an edge endpoint.
 * - Existing node within snap radius (excluding fixed opposite end) wins.
 * - Else ghost at grid-snapped cursor (caller supplies gridSnap).
 */
export function resolveEndpointRewireSnap(
  nodes: SnapNode[],
  cursorCm: { x: number; y: number },
  opts?: {
    /** Opposite (fixed) end — excluded to avoid self-loop highlight. */
    excludeNodeUuid?: string | null;
    nodeSnapCm?: number;
    gridSnap?: (x: number, y: number) => { x: number; y: number };
  }
): EndpointSnapPreview {
  const nodeSnap = opts?.nodeSnapCm ?? DRAW_NODE_SNAP_CM;
  const exclude = opts?.excludeNodeUuid ?? null;
  const gridSnap = opts?.gridSnap ?? ((x: number, y: number) => ({ x, y }));

  let best: { uuid: string; x: number; y: number; d: number } | null = null;
  for (const n of nodes) {
    if (exclude && n.uuid === exclude) continue;
    const d = Math.hypot(n.x - cursorCm.x, n.y - cursorCm.y);
    if (d <= nodeSnap && (!best || d < best.d)) {
      best = { uuid: n.uuid, x: n.x, y: n.y, d };
    }
  }
  if (best) return { kind: "node", uuid: best.uuid, x: best.x, y: best.y };

  const g = gridSnap(cursorCm.x, cursorCm.y);
  // If grid position coincides with an existing node (incl. excluded), prefer that node
  // only when not the excluded fixed end — otherwise still ghost (drop will reject loop).
  for (const n of nodes) {
    if (exclude && n.uuid === exclude) continue;
    if (Math.hypot(n.x - g.x, n.y - g.y) < 1e-6) {
      return { kind: "node", uuid: n.uuid, x: n.x, y: n.y };
    }
  }
  return { kind: "ghost", x: g.x, y: g.y };
}

export function endpointSnapToDropTarget(snap: EndpointSnapPreview): EndpointRewireDropTarget {
  if (snap.kind === "node") return { kind: "node", uuid: snap.uuid };
  return { kind: "new", x: snap.x, y: snap.y };
}
