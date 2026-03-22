/**
 * Simple path visualization helpers: approach point, segment–rack intersection, reroute.
 * No A* or grid; basic Manhattan rerouting to avoid drawing through racks.
 */

import type { RackState } from "../../types/warehouse";

export type PathPoint = { x: number; y: number };
export type PathStop = PathPoint & { rackId?: string | number; label?: string };

const EPS = 1e-9;

/**
 * Simplify path by removing collinear intermediate points.
 * If direction AB === direction BC, remove B. Keeps first and last point.
 */
export function simplifyPath(points: PathPoint[]): PathPoint[] {
  if (points.length <= 2) return points;
  const result: PathPoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const cross = dx1 * dy2 - dy1 * dx2;
    const dot = dx1 * dx2 + dy1 * dy2;
    const collinear = Math.abs(cross) < EPS;
    const sameDirection = dot >= 0;
    if (!collinear || !sameDirection) result.push(curr);
  }
  result.push(points[points.length - 1]);
  return result;
}

function pointInRect(
  px: number,
  py: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): boolean {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

/** True if segment (ax,ay)-(bx,by) and segment (cx,cy)-(dx,dy) share a point (including endpoints). */
function segmentIntersectsSegment(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): boolean {
  const denom = (dx - cx) * (by - ay) - (dy - cy) * (bx - ax);
  if (Math.abs(denom) < 1e-9) {
    // Parallel: check if overlapping or endpoint on segment
    const onSeg = (px: number, py: number, sx: number, sy: number, ex: number, ey: number) =>
      Math.min(sx, ex) <= px && px <= Math.max(sx, ex) && Math.min(sy, ey) <= py && py <= Math.max(sy, ey);
    return (
      onSeg(ax, ay, cx, cy, dx, dy) || onSeg(bx, by, cx, cy, dx, dy) ||
      onSeg(cx, cy, ax, ay, bx, by) || onSeg(dx, dy, ax, ay, bx, by)
    );
  }
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / denom;
  const s = ((ax - cx) * (by - ay) - (ay - cy) * (bx - ax)) / denom;
  return t >= 0 && t <= 1 && s >= 0 && s <= 1;
}

/** True if segment (ax,ay)-(bx,by) intersects rectangle [rx,ry,rw,rh] (interior or boundary). */
export function segmentIntersectsRect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): boolean {
  if (pointInRect(ax, ay, rx, ry, rw, rh) || pointInRect(bx, by, rx, ry, rw, rh)) return true;
  const x2 = rx + rw;
  const y2 = ry + rh;
  return (
    segmentIntersectsSegment(ax, ay, bx, by, rx, ry, x2, ry) ||
    segmentIntersectsSegment(ax, ay, bx, by, x2, ry, x2, y2) ||
    segmentIntersectsSegment(ax, ay, bx, by, x2, y2, rx, y2) ||
    segmentIntersectsSegment(ax, ay, bx, by, rx, y2, rx, ry)
  );
}

/** Aisle offset so path is not exactly on the rack edge (in cell units). */
const AISLE_OFFSET = 0.2;

/** Set to true to force path end to (rack.x - 3, rack.y) for debugging: if path still goes to center, rendering is ignoring this. */
const DEBUG_FORCE_END_LEFT = false;

/**
 * Approach point in the aisle beside the rack (never inside the rack).
 * Two candidates: left (rack.x - 1) and right (rack.x + rack.width + 1), y = rack center.
 * Choose the aisle with smaller |start.x - aisle.x| so we approach from the closer side.
 * Optional offset (0.2 cells) moves the point slightly into the aisle away from the rack.
 * Clamped to grid AND kept outside rack bounds (so we never clamp onto the rack).
 */
function getApproachPoint(
  start: PathPoint,
  rack: RackState,
  gridCols: number,
  gridRows: number
): PathPoint {
  const cy = rack.y + rack.height / 2;
  const leftX = rack.x - 1 - AISLE_OFFSET;
  const rightX = rack.x + rack.width + 1 + AISLE_OFFSET;
  const left = { x: leftX, y: cy };
  const right = { x: rightX, y: cy };
  const leftDistX = Math.abs(start.x - left.x);
  const rightDistX = Math.abs(start.x - right.x);
  const useLeft = leftDistX <= rightDistX;
  const approach = useLeft ? left : right;

  // Clamp to grid but never into the rack: left point must stay < rack.x, right must stay > rack.x + rack.width
  const minXOutsideRack = 0;
  const maxXOutsideRack = gridCols - 1;
  const xClamped = useLeft
    ? Math.max(minXOutsideRack, Math.min(approach.x, rack.x - 0.5))
    : Math.min(maxXOutsideRack, Math.max(approach.x, rack.x + rack.width + 0.5));
  const yClamped = Math.max(0, Math.min(gridRows - 1, approach.y));

  return { x: xClamped, y: yClamped };
}

/** Check if segment (a→b) intersects any of the given racks. */
function segmentHitsAnyRack(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  racks: RackState[],
  excludeRackId?: number | string
): boolean {
  for (const r of racks) {
    const rid = r.id ?? r.rack_index;
    if (excludeRackId != null && rid === excludeRackId) continue;
    if (segmentIntersectsRect(ax, ay, bx, by, r.x, r.y, r.width, r.height)) return true;
  }
  return false;
}

function maxRackBottomY(racks: RackState[]): number {
  let maxY = 0;
  for (const r of racks) maxY = Math.max(maxY, r.y + r.height);
  return maxY;
}

function segmentHitsAnyRackOnPath(points: PathPoint[], racks: RackState[]): boolean {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (segmentHitsAnyRack(a.x, a.y, b.x, b.y, racks)) return true;
  }
  return false;
}

function manhattanLen(points: PathPoint[]): number {
  let d = 0;
  for (let i = 0; i < points.length - 1; i++) {
    d += Math.abs(points[i + 1].x - points[i].x) + Math.abs(points[i + 1].y - points[i].y);
  }
  return d;
}

function buildCandidateYs(
  startY: number,
  endY: number,
  racks: RackState[],
  gridRows: number
): number[] {
  const ys = new Set<number>();
  const clampY = (y: number) => Math.max(0, Math.min(gridRows - 1, y));
  ys.add(clampY(startY));
  ys.add(clampY(endY));

  // Midpoints between merged rack bands (simple "between rack rows" heuristic).
  const intervals = racks
    .map((r) => ({ a: r.y, b: r.y + r.height }))
    .filter((t) => Number.isFinite(t.a) && Number.isFinite(t.b))
    .sort((p, q) => p.a - q.a);

  const merged: Array<{ a: number; b: number }> = [];
  for (const it of intervals) {
    if (!merged.length) merged.push({ ...it });
    else {
      const last = merged[merged.length - 1];
      if (it.a <= last.b) last.b = Math.max(last.b, it.b);
      else merged.push({ ...it });
    }
  }

  for (let i = 0; i < merged.length - 1; i++) {
    const gapStart = merged[i].b;
    const gapEnd = merged[i + 1].a;
    const gap = gapEnd - gapStart;
    if (gap <= 0.4) continue;
    const mid = clampY((gapStart + gapEnd) / 2);
    // Slightly offset away from edges to avoid "touching" a rack boundary.
    ys.add(clampY(mid));
    ys.add(clampY(mid + 0.3));
    ys.add(clampY(mid - 0.3));
  }

  // Fallback: below everything.
  ys.add(clampY(maxRackBottomY(racks) + 2));

  return Array.from(ys);
}

/**
 * Build Manhattan path from start to an approach point outside the target rack,
 * with simple rerouting so segments do not pass through other racks.
 * Returns array of points [start, ...midpoints, approach].
 */
export function buildPathAvoidingRacks(
  start: PathPoint,
  targetRack: RackState,
  allRacks: RackState[],
  gridCols: number,
  gridRows: number
): PathPoint[] {
  let approach = getApproachPoint(start, targetRack, gridCols, gridRows);
  if (DEBUG_FORCE_END_LEFT) {
    approach = { x: targetRack.x - 3, y: targetRack.y };
  }
  const rackCenter = { x: targetRack.x + targetRack.width / 2, y: targetRack.y + targetRack.height / 2 };
  if (typeof console !== "undefined" && console.log) {
    console.log("[path] START", start);
    console.log("[path] END (aisle approach)", approach);
    console.log("[path] rack center (not used)", rackCenter);
    console.log("[path] rack bounds", { x: targetRack.x, y: targetRack.y, w: targetRack.width, h: targetRack.height });
  }
  const targetRid = targetRack.id ?? targetRack.rack_index;
  const otherRacks = allRacks.filter((r) => (r.id ?? r.rack_index) !== targetRid);

  // Try candidate Y levels and choose the shortest valid path:
  // start → (start.x, y) → (approach.x, y) → approach
  const candidateYs = buildCandidateYs(start.y, approach.y, allRacks, gridRows);
  const failures: Array<{ y: number; reason: string }> = [];
  const candidates = candidateYs
    .map((y) => {
      const path = [start, { x: start.x, y }, { x: approach.x, y }, approach];
      return { y, path, len: manhattanLen(path), hits: segmentHitsAnyRackOnPath(path, allRacks) };
    })
    .sort((a, b) => a.len - b.len);

  const best = candidates.find((c) => !c.hits);
  if (best) {
    if (typeof console !== "undefined" && console.log) {
      console.log("[path] candidateY chosen", { y: best.y, len: best.len });
    }
    return best.path;
  }

  for (const c of candidates) {
    if (c.hits) failures.push({ y: c.y, reason: "collision" });
  }
  const fallbackYRaw = maxRackBottomY(allRacks) + 2;
  const fallbackY = Math.max(0, Math.min(gridRows - 1, fallbackYRaw));
  if (typeof console !== "undefined" && console.log) {
    console.log("[path] all candidateYs collide; falling back to bottom path", {
      tried: failures.slice(0, 12),
      fallbackY,
      fallbackYRaw,
    });
  }
  const fallbackPath = [start, { x: start.x, y: fallbackY }, { x: approach.x, y: fallbackY }, approach];
  // Note: fallback may still collide if the grid ends before safeYRaw; we keep it simple.
  return fallbackPath;

  // Unreachable (returned above).
}

/**
 * Build a path between two arbitrary points (cells), avoiding rack rectangles using the same candidate-Y strategy.
 * This does not compute aisle approach points; caller should provide appropriate end points.
 */
export function buildPathBetweenPointsAvoidingRacks(
  start: PathPoint,
  end: PathPoint,
  racks: RackState[],
  gridRows: number
): { points: PathPoint[]; chosenY: number; hadCollision: boolean } {
  const candidateYs = buildCandidateYs(start.y, end.y, racks, gridRows);
  const candidates = candidateYs
    .map((y) => {
      const path = [start, { x: start.x, y }, { x: end.x, y }, end];
      return { y, path, len: manhattanLen(path), hits: segmentHitsAnyRackOnPath(path, racks) };
    })
    .sort((a, b) => a.len - b.len);

  const best = candidates.find((c) => !c.hits);
  if (best) {
    return { points: best.path, chosenY: best.y, hadCollision: false };
  }
  const fallbackYRaw = maxRackBottomY(racks) + 2;
  const fallbackY = Math.max(0, Math.min(gridRows - 1, fallbackYRaw));
  const fallbackPath = [start, { x: start.x, y: fallbackY }, { x: end.x, y: fallbackY }, end];
  return { points: fallbackPath, chosenY: fallbackY, hadCollision: true };
}

function euclid2(a: PathPoint, b: PathPoint): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * Order stops by nearest-neighbor (greedy) starting from start.
 * Returns ordered stops.
 */
export function orderStopsNearestNeighbor(start: PathPoint, stops: PathStop[]): PathStop[] {
  const remaining = stops.slice();
  const ordered: PathStop[] = [];
  let current: PathPoint = start;
  while (remaining.length) {
    let bestIdx = 0;
    let bestD = euclid2(current, remaining[0]);
    for (let i = 1; i < remaining.length; i++) {
      const d = euclid2(current, remaining[i]);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    ordered.push(next);
    current = next;
  }
  return ordered;
}

/**
 * Build one continuous polyline for a full picking route (ordered stops).
 * Returns:
 * - polylinePoints: concatenated points
 * - orderedStops: final stop order
 * - totalLenCells: Manhattan length along the polyline
 */
export function buildPickingRoutePolyline(
  start: PathPoint,
  stops: PathStop[],
  racks: RackState[],
  gridRows: number
): { polylinePoints: PathPoint[]; orderedStops: PathStop[]; totalLenCells: number } {
  const orderedStops = orderStopsNearestNeighbor(start, stops);
  const allPoints: PathPoint[] = [];
  let current: PathPoint = start;

  for (const stop of orderedStops) {
    const seg = buildPathBetweenPointsAvoidingRacks(current, stop, racks, gridRows).points;
    if (allPoints.length === 0) allPoints.push(...seg);
    else {
      // Avoid duplicating the join point
      allPoints.push(...seg.slice(1));
    }
    current = stop;
  }

  return { polylinePoints: allPoints, orderedStops, totalLenCells: manhattanLen(allPoints) };
}
