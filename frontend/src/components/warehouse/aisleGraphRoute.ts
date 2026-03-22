/**
 * Aisle-based routing model:
 * - infer horizontal aisle center lines from gaps between rack rows
 * - route on aisle graph (horizontal aisle lines + vertical connectors)
 * - no free-grid pathfinding, no micro zig-zag corrections
 */

import type { LayoutState, RackState } from "../../types/warehouse";
import type { PathPoint, VisualRouteStop } from "./WarehouseCanvas/PathLayer";
import { getRackPickPointCell } from "./rackAccessPoint";

export type AisleSegment = {
  id: string;
  /** True: horizontal line y = u, x in [lo, hi]. */
  horizontal: boolean;
  u: number;
  lo: number;
  hi: number;
};

const EPS = 1e-5;

function nearlyEq(a: number, b: number, eps = EPS) {
  return Math.abs(a - b) < eps;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function lineIntersectsRackHorizontal(y: number, x1: number, x2: number, r: RackState): boolean {
  if (y <= r.y + EPS || y >= r.y + r.height - EPS) return false;
  const lo = Math.min(x1, x2);
  const hi = Math.max(x1, x2);
  return !(hi <= r.x + EPS || lo >= r.x + r.width - EPS);
}

function lineIntersectsRackVertical(x: number, y1: number, y2: number, r: RackState): boolean {
  if (x <= r.x + EPS || x >= r.x + r.width - EPS) return false;
  const lo = Math.min(y1, y2);
  const hi = Math.max(y1, y2);
  return !(hi <= r.y + EPS || lo >= r.y + r.height - EPS);
}

function horizontalClear(racks: RackState[], y: number, x1: number, x2: number): boolean {
  for (const r of racks) if (lineIntersectsRackHorizontal(y, x1, x2, r)) return false;
  return true;
}

function verticalClear(racks: RackState[], x: number, y1: number, y2: number): boolean {
  for (const r of racks) if (lineIntersectsRackVertical(x, y1, y2, r)) return false;
  return true;
}

function inferAisleYLines(layout: LayoutState): number[] {
  const rows = Math.max(1, Math.floor(layout.grid_rows));
  const free: number[] = [];
  for (let iy = 0; iy < rows; iy += 1) {
    const y = iy + 0.5;
    let blocked = false;
    for (const r of layout.racks) {
      if (y > r.y + EPS && y < r.y + r.height - EPS) {
        blocked = true;
        break;
      }
    }
    if (!blocked) free.push(y);
  }
  if (free.length === 0) return [Math.max(0.5, Math.min(layout.grid_rows - 0.5, layout.grid_rows / 2))];
  const out: number[] = [];
  let start = free[0];
  let prev = free[0];
  for (let i = 1; i < free.length; i += 1) {
    const y = free[i];
    if (y - prev > 1.01) {
      out.push((start + prev) / 2);
      start = y;
    }
    prev = y;
  }
  out.push((start + prev) / 2);
  return out;
}

/** Derived aisle center lines from rack gaps. */
export function deriveAisleSegments(layout: LayoutState): AisleSegment[] {
  const ys = inferAisleYLines(layout);
  const x0 = 0.5;
  const x1 = Math.max(0.5, layout.grid_cols - 0.5);
  return ys.map((y, i) => ({ id: `auto-aisle-${i}`, horizontal: true, u: y, lo: x0, hi: x1 }));
}

export function snapPointToAisle(p: PathPoint, segments: AisleSegment[]): PathPoint | null {
  if (segments.length === 0) return null;
  let best = segments[0].u;
  let bestD = Math.abs(p.y - best);
  for (let i = 1; i < segments.length; i += 1) {
    const d = Math.abs(p.y - segments[i].u);
    if (d < bestD) {
      bestD = d;
      best = segments[i].u;
    }
  }
  return { x: p.x, y: best };
}

/** Undirected edge key for detecting duplicate traversals. */
function edgeKey(ax: number, ay: number, bx: number, by: number): string {
  const k = (x: number, y: number) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
  const p1 = k(ax, ay);
  const p2 = k(bx, by);
  return p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`;
}

/** Reject if same undirected edge appears more than once (unnecessary backtrack). */
export function validateNoDuplicateEdges(points: PathPoint[]): boolean {
  if (points.length < 2) return true;
  const seen = new Set<string>();
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const ek = edgeKey(a.x, a.y, b.x, b.y);
    if (seen.has(ek)) return false;
    seen.add(ek);
  }
  return true;
}

/** Sum of Manhattan edge lengths in grid cells (orthogonal aisle movement). */
export function computeManhattanPathLengthCells(points: PathPoint[]): number {
  if (points.length < 2) return 0;
  let d = 0;
  for (let i = 1; i < points.length; i += 1) {
    d += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
  }
  return d;
}

export type BuildAisleRouteOptions = { debug?: boolean; aisleHalfWidthCells?: number };

function resolveAisleHalfWidthCells(options?: BuildAisleRouteOptions): number {
  const v = options?.aisleHalfWidthCells;
  return v != null && Number.isFinite(v) && v > 0 ? v : 0.5;
}

function dedupeCollinear(points: PathPoint[]): PathPoint[] {
  if (points.length <= 2) return points;
  const out: PathPoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const a = out[out.length - 1];
    const b = points[i];
    const c = points[i + 1];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) > 1e-6) out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}

function nearestAisleY(y: number, aisleYs: number[]): number {
  let best = aisleYs[0];
  let bestD = Math.abs(y - best);
  for (let i = 1; i < aisleYs.length; i += 1) {
    const d = Math.abs(y - aisleYs[i]);
    if (d < bestD) {
      bestD = d;
      best = aisleYs[i];
    }
  }
  return best;
}

function computeWaypoints(
  layout: LayoutState,
  routeStart: PathPoint,
  routeStops: VisualRouteStop[],
  routeEnd: PathPoint | null,
  racks: RackState[],
  options?: BuildAisleRouteOptions
): { aisleYs: number[]; points: PathPoint[] } | null {
  const aisleYs = deriveAisleSegments(layout).map((s) => s.u).sort((a, b) => a - b);
  if (aisleYs.length === 0) return null;
  const half = resolveAisleHalfWidthCells(options);
  const rackById = new Map<string, RackState>();
  for (const r of racks) rackById.set(String(r.id ?? r.rack_index), r);
  const points: PathPoint[] = [];
  points.push({ x: clamp(routeStart.x, 0.5, layout.grid_cols - 0.5), y: nearestAisleY(routeStart.y, aisleYs) });
  for (const stop of routeStops) {
    const rack = rackById.get(String(stop.rackId));
    if (!rack) return null;
    const raw = getRackPickPointCell(rack, half);
    points.push({ x: clamp(raw.x, 0.5, layout.grid_cols - 0.5), y: nearestAisleY(raw.y, aisleYs) });
  }
  if (routeEnd) {
    points.push({ x: clamp(routeEnd.x, 0.5, layout.grid_cols - 0.5), y: nearestAisleY(routeEnd.y, aisleYs) });
  }
  return { aisleYs, points };
}

function legPath(racks: RackState[], a: PathPoint, b: PathPoint): PathPoint[] | null {
  if (nearlyEq(a.y, b.y)) {
    if (!horizontalClear(racks, a.y, a.x, b.x)) return null;
    return [a, { x: b.x, y: a.y }];
  }
  const midX = b.x;
  if (horizontalClear(racks, a.y, a.x, midX) && verticalClear(racks, midX, a.y, b.y)) {
    return [a, { x: midX, y: a.y }, { x: midX, y: b.y }];
  }
  const altX = a.x;
  if (verticalClear(racks, altX, a.y, b.y) && horizontalClear(racks, b.y, altX, b.x)) {
    return [a, { x: altX, y: b.y }, { x: b.x, y: b.y }];
  }
  return null;
}

export function getRackRouteWaypoint(rack: RackState, layout: LayoutState, aisleHalfWidthCells: number): PathPoint | null {
  const aisleYs = deriveAisleSegments(layout).map((s) => s.u);
  if (aisleYs.length === 0) return null;
  const raw = getRackPickPointCell(rack, aisleHalfWidthCells);
  return { x: clamp(raw.x, 0.5, layout.grid_cols - 0.5), y: nearestAisleY(raw.y, aisleYs) };
}

export function buildAisleGraphRoutePath(
  layout: LayoutState,
  routeStart: PathPoint,
  routeStops: VisualRouteStop[],
  routeEnd: PathPoint | null,
  racks: RackState[],
  options?: BuildAisleRouteOptions
): PathPoint[] | null {
  const wp = computeWaypoints(layout, routeStart, routeStops, routeEnd, racks, options);
  if (!wp || wp.points.length < 2) return null;
  const out: PathPoint[] = [wp.points[0]];
  for (let i = 0; i < wp.points.length - 1; i += 1) {
    const seg = legPath(racks, wp.points[i], wp.points[i + 1]);
    if (!seg) return null;
    for (let j = 1; j < seg.length; j += 1) out.push(seg[j]);
  }
  return dedupeCollinear(out);
}

export function buildAisleGraphRoutePathSegment(
  layout: LayoutState,
  fromRackId: string,
  toRackId: string,
  racks: RackState[],
  options?: BuildAisleRouteOptions
): PathPoint[] | null {
  const half = resolveAisleHalfWidthCells(options);
  const rackById = new Map<string, RackState>();
  for (const r of racks) rackById.set(String(r.id ?? r.rack_index), r);
  const ra = rackById.get(fromRackId);
  const rb = rackById.get(toRackId);
  if (!ra || !rb) return null;
  const a = getRackRouteWaypoint(ra, layout, half);
  const b = getRackRouteWaypoint(rb, layout, half);
  if (!a || !b) return null;
  const p = legPath(racks, a, b);
  if (!p) return null;
  return dedupeCollinear(p);
}

export function buildAisleGraphRoutePathPickStartToRack(
  layout: LayoutState,
  pickStart: PathPoint,
  rackId: string,
  racks: RackState[],
  options?: BuildAisleRouteOptions
): PathPoint[] | null {
  const half = resolveAisleHalfWidthCells(options);
  const rackById = new Map<string, RackState>();
  for (const r of racks) rackById.set(String(r.id ?? r.rack_index), r);
  const rack = rackById.get(rackId);
  if (!rack) return null;
  const aisleYs = deriveAisleSegments(layout).map((s) => s.u);
  if (aisleYs.length === 0) return null;
  const start = { x: clamp(pickStart.x, 0.5, layout.grid_cols - 0.5), y: nearestAisleY(pickStart.y, aisleYs) };
  const end = getRackRouteWaypoint(rack, layout, half);
  if (!end) return null;
  const p = legPath(racks, start, end);
  if (!p) return null;
  return dedupeCollinear(p);
}
