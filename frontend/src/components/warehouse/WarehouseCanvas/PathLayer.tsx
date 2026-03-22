export type PathPoint = { x: number; y: number };

export type PathLayerMarker = { x: number; y: number; label: string };
export type VisualRouteStop = { rackId: string; position: PathPoint };

export type PathLayerProps = {
  points: PathPoint[];
  cellPx: number;
  markers?: PathLayerMarker[];
  /** When set, merged into a single neutral path line (visit order on rack badges, not on path). */
  segments?: PathPoint[][];
  /** If true, path is drawn as single neutral secondary line (reduced width/opacity). */
  routeMode?: boolean;
  /** When set in routeMode, path up to this stop index is drawn with higher opacity. */
  highlightedStopIndex?: number | null;
  /** Route preview stops used to build a clean visual path independent of backend node detail. */
  routeStops?: VisualRouteStop[] | null;
  /** START position in grid cells for route preview. */
  routeStart?: PathPoint | null;
  /** Optional final node (e.g. packing station) in grid cells — appended after last rack stop. */
  routeEnd?: PathPoint | null;
  /** Aisle graph path: array = use it; null = strict aisle routing failed (no fallback); undefined = not provided. */
  routeGraphPolyline?: PathPoint[] | null;
  /** True = draw raw node-level path; false = simplified turn-level path. */
  debugMode?: boolean;
};

function toPx(p: PathPoint, cellPx: number) {
  return { x: p.x * cellPx + cellPx / 2, y: p.y * cellPx + cellPx / 2 };
}

type ArrowGlyph = { x: number; y: number; angleDeg: number };
type RouteAisleSegment =
  | { type: "horizontal"; y: number; x1: number; x2: number }
  | { type: "vertical"; x: number; y1: number; y2: number };

function samePoint(a: PathPoint, b: PathPoint, eps = 1e-6) {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
}

function nearlyEqual(a: number, b: number, eps = 1e-6) {
  return Math.abs(a - b) < eps;
}

function dedupeConsecutivePoints(points: PathPoint[]) {
  return points.reduce<PathPoint[]>((acc, point) => {
    if (acc.length === 0 || !samePoint(acc[acc.length - 1], point)) {
      acc.push(point);
    }
    return acc;
  }, []);
}

function arrowsAtSegmentCenters(points: PathPoint[], cellPx: number): ArrowGlyph[] {
  if (points.length < 2) return [];
  const pxPts = points.map((p) => toPx(p, cellPx));
  const arrows: ArrowGlyph[] = [];
  for (let i = 0; i < pxPts.length - 1; i += 1) {
    const a = pxPts[i];
    const b = pxPts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 10) continue;
    arrows.push({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
    });
  }
  return arrows;
}

function projectPointToSegmentPx(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-9) return { x: a.x, y: a.y, d2: (p.x - a.x) ** 2 + (p.y - a.y) ** 2 };
  const tRaw = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  const t = Math.max(0, Math.min(1, tRaw));
  const x = a.x + dx * t;
  const y = a.y + dy * t;
  return { x, y, d2: (p.x - x) ** 2 + (p.y - y) ** 2 };
}

function projectStopsToPathPx(stops: VisualRouteStop[] | null, pathPoints: PathPoint[], cellPx: number) {
  if (!stops || stops.length === 0 || pathPoints.length < 2) return [] as { x: number; y: number; label: string }[];
  const pathPx = pathPoints.map((p) => toPx(p, cellPx));
  return stops.map((s, idx) => {
    const sp = toPx(s.position, cellPx);
    let best = { x: sp.x, y: sp.y, d2: Infinity };
    for (let i = 0; i < pathPx.length - 1; i += 1) {
      const proj = projectPointToSegmentPx(sp, pathPx[i], pathPx[i + 1]);
      if (proj.d2 < best.d2) best = proj;
    }
    return { x: best.x, y: best.y, label: String(idx + 1) };
  });
}

function snapToAisleLikeMovement(points: PathPoint[]) {
  if (points.length < 2) return points;
  const snapped: PathPoint[] = [points[0]];
  for (let idx = 1; idx < points.length; idx += 1) {
    const prev = snapped[snapped.length - 1];
    const raw = points[idx];
    const dx = raw.x - prev.x;
    const dy = raw.y - prev.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx < 1e-6 && absDy < 1e-6) continue;

    if (absDx > absDy && absDy <= 0.35) {
      snapped.push({ x: raw.x, y: prev.y });
      continue;
    }
    if (absDy > absDx && absDx <= 0.35) {
      snapped.push({ x: prev.x, y: raw.y });
      continue;
    }

    snapped.push(raw);
  }
  return dedupeConsecutivePoints(snapped);
}

function removeNearCollinearPoints(points: PathPoint[]) {
  if (points.length < 3) return points;
  const simplified: PathPoint[] = [points[0]];
  for (let idx = 1; idx < points.length - 1; idx += 1) {
    const prev = simplified[simplified.length - 1];
    const curr = points[idx];
    const next = points[idx + 1];

    const prevDx = curr.x - prev.x;
    const prevDy = curr.y - prev.y;
    const nextDx = next.x - curr.x;
    const nextDy = next.y - curr.y;

    const sameVertical = nearlyEqual(prev.x, curr.x, 0.1) && nearlyEqual(curr.x, next.x, 0.1);
    const sameHorizontal = nearlyEqual(prev.y, curr.y, 0.1) && nearlyEqual(curr.y, next.y, 0.1);
    const tinyJogOnHorizontal =
      nearlyEqual(prev.y, next.y, 0.1) &&
      Math.abs(curr.y - prev.y) <= 0.5 &&
      (Math.abs(prevDx) <= 1 || Math.abs(nextDx) <= 1);
    const tinyJogOnVertical =
      nearlyEqual(prev.x, next.x, 0.1) &&
      Math.abs(curr.x - prev.x) <= 0.5 &&
      (Math.abs(prevDy) <= 1 || Math.abs(nextDy) <= 1);
    const tinyDirectionChange =
      Math.hypot(prevDx, prevDy) <= 0.75 ||
      Math.hypot(nextDx, nextDy) <= 0.75;

    if (sameVertical || sameHorizontal || tinyJogOnHorizontal || tinyJogOnVertical || tinyDirectionChange) {
      continue;
    }

    simplified.push(curr);
  }
  simplified.push(points[points.length - 1]);
  return dedupeConsecutivePoints(simplified);
}

function simplifyRenderedPath(points: PathPoint[]) {
  let simplified = dedupeConsecutivePoints(points);
  simplified = snapToAisleLikeMovement(simplified);

  let changed = true;
  while (changed) {
    const next = removeNearCollinearPoints(simplified);
    changed = next.length !== simplified.length;
    simplified = next;
  }

  return simplified;
}

function axisOf(a: PathPoint, b: PathPoint): "horizontal" | "vertical" | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return "horizontal";
  return "vertical";
}

/**
 * Collapse monotonic grid stair-jitter (H,V,H,V...) into an aisle-like L segment.
 * Keeps path direction but removes cell-level zig-zag noise.
 */
function collapseStairJitter(points: PathPoint[]): PathPoint[] {
  const src = dedupeConsecutivePoints(points);
  if (src.length < 4) return src;
  const out: PathPoint[] = [];
  let i = 0;
  while (i < src.length - 1) {
    const start = src[i];
    let j = i;
    let prevAxis = axisOf(src[j], src[j + 1]);
    if (!prevAxis) {
      out.push(start);
      i += 1;
      continue;
    }
    let hSign = 0;
    let vSign = 0;
    let alternations = 0;
    while (j < src.length - 1) {
      const a = src[j];
      const b = src[j + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const axis = axisOf(a, b);
      if (!axis) {
        j += 1;
        continue;
      }
      if (axis === "horizontal") {
        const s = Math.sign(dx);
        if (hSign === 0) hSign = s;
        else if (s !== 0 && s !== hSign) break;
      } else {
        const s = Math.sign(dy);
        if (vSign === 0) vSign = s;
        else if (s !== 0 && s !== vSign) break;
      }
      if (axis !== prevAxis) alternations += 1;
      prevAxis = axis;
      j += 1;
      if (j >= src.length - 1) break;
      const nextAxis = axisOf(src[j], src[j + 1]);
      if (!nextAxis) continue;
      // Stop when trend flips on either axis.
      const ndx = src[j + 1].x - src[j].x;
      const ndy = src[j + 1].y - src[j].y;
      if ((hSign !== 0 && Math.sign(ndx) !== 0 && Math.sign(ndx) !== hSign) || (vSign !== 0 && Math.sign(ndy) !== 0 && Math.sign(ndy) !== vSign)) {
        break;
      }
    }
    const hasStair = j - i >= 3 && alternations >= 2 && hSign !== 0 && vSign !== 0;
    if (hasStair) {
      const end = src[j];
      const firstAxis = axisOf(src[i], src[i + 1]);
      out.push(start);
      if (firstAxis === "horizontal") out.push({ x: end.x, y: start.y });
      else out.push({ x: start.x, y: end.y });
      out.push(end);
      i = j;
    } else {
      out.push(start);
      i += 1;
    }
  }
  out.push(src[src.length - 1]);
  return dedupeConsecutivePoints(dedupeCollinearRoutePoints(out));
}

function toAisleSegments(points: PathPoint[]): RouteAisleSegment[] {
  const segs: RouteAisleSegment[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (nearlyEqual(a.x, b.x, 1e-6) && !nearlyEqual(a.y, b.y, 1e-6)) {
      const y1 = Math.min(a.y, b.y);
      const y2 = Math.max(a.y, b.y);
      const prev = segs[segs.length - 1];
      if (prev && prev.type === "vertical" && nearlyEqual(prev.x, a.x, 1e-6) && nearlyEqual(prev.y2, y1, 1e-6)) {
        prev.y2 = y2;
      } else {
        segs.push({ type: "vertical", x: a.x, y1, y2 });
      }
      continue;
    }
    if (nearlyEqual(a.y, b.y, 1e-6) && !nearlyEqual(a.x, b.x, 1e-6)) {
      const x1 = Math.min(a.x, b.x);
      const x2 = Math.max(a.x, b.x);
      const prev = segs[segs.length - 1];
      if (prev && prev.type === "horizontal" && nearlyEqual(prev.y, a.y, 1e-6) && nearlyEqual(prev.x2, x1, 1e-6)) {
        prev.x2 = x2;
      } else {
        segs.push({ type: "horizontal", y: a.y, x1, x2 });
      }
      continue;
    }
    // If a tiny diagonal remains, split into orthogonal turn.
    segs.push({ type: "horizontal", y: a.y, x1: Math.min(a.x, b.x), x2: Math.max(a.x, b.x) });
    segs.push({ type: "vertical", x: b.x, y1: Math.min(a.y, b.y), y2: Math.max(a.y, b.y) });
  }
  return segs;
}

function segmentsToPolylinePoints(segments: RouteAisleSegment[], fallbackStart: PathPoint): PathPoint[] {
  if (segments.length === 0) return [fallbackStart];
  const out: PathPoint[] = [];
  const startFromSeg = (s: RouteAisleSegment): PathPoint =>
    s.type === "horizontal" ? { x: s.x1, y: s.y } : { x: s.x, y: s.y1 };
  const endFromSeg = (s: RouteAisleSegment): PathPoint =>
    s.type === "horizontal" ? { x: s.x2, y: s.y } : { x: s.x, y: s.y2 };
  out.push(startFromSeg(segments[0]));
  for (const s of segments) out.push(endFromSeg(s));
  return dedupeConsecutivePoints(dedupeCollinearRoutePoints(out));
}

/** Safe for aisle graph polylines: only merge collinear vertices (does not snap off aisle lines). */
export function mergeCollinearRoutePointsForDisplay(points: PathPoint[]): PathPoint[] {
  return dedupeCollinearRoutePoints(dedupeConsecutivePoints(points));
}

function appendOrthogonalLeg(built: PathPoint[], cursor: PathPoint, to: PathPoint): PathPoint {
  const from = cursor;
  let turn: PathPoint;
  if (samePoint(from, to)) {
    turn = { x: from.x + 0.5, y: from.y };
  } else if (nearlyEqual(from.x, to.x, 0.05)) {
    turn = { x: from.x, y: (from.y + to.y) / 2 };
  } else if (nearlyEqual(from.y, to.y, 0.05)) {
    turn = { x: (from.x + to.x) / 2, y: from.y };
  } else {
    const horizontalFirst = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
    turn = horizontalFirst ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
  }
  const segment = [from, turn, to];
  built.push(...segment.slice(1));
  return to;
}

/**
 * Orthogonal path through rack access points (not centers). Optionally ends at packing / route end.
 * Does not merge stops into synthetic "lanes" — keeps points in the aisle in front of racks.
 */
export function buildVisualRoutePath(
  routeStart: PathPoint | null,
  routeStops: VisualRouteStop[] | null,
  stopLimit?: number | null,
  routeEnd?: PathPoint | null
) {
  if (!routeStart || !routeStops || routeStops.length === 0) return [] as PathPoint[];

  const lastStopIndex =
    stopLimit != null ? Math.max(0, Math.min(routeStops.length - 1, stopLimit)) : routeStops.length - 1;
  const limitedStops = routeStops.slice(0, lastStopIndex + 1);
  const built: PathPoint[] = [routeStart];
  let cursor = routeStart;

  for (const stop of limitedStops) {
    cursor = appendOrthogonalLeg(built, cursor, stop.position);
  }

  const appendPacking =
    (stopLimit == null || stopLimit === undefined) && routeEnd != null && !samePoint(cursor, routeEnd);
  if (appendPacking) {
    cursor = appendOrthogonalLeg(built, cursor, routeEnd);
  }

  const finalPoints =
    built.length >= 3
      ? built
      : limitedStops.length > 0
        ? [routeStart, { x: routeStart.x, y: routeStart.y + 0.5 }, limitedStops[0].position]
        : built;

  return dedupeCollinearRoutePoints(finalPoints);
}

/** Drop intermediate points that lie on a straight segment (keeps corners only). */
function dedupeCollinearRoutePoints(points: PathPoint[]): PathPoint[] {
  if (points.length <= 2) return points;
  const out: PathPoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    const c = points[i + 1];
    const d1 = { x: b.x - a.x, y: b.y - a.y };
    const d2 = { x: c.x - b.x, y: c.y - b.y };
    const cross = d1.x * d2.y - d1.y * d2.x;
    const collinear = Math.abs(cross) < 1e-5;
    if (!collinear) out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}

export function PathLayer({
  points,
  cellPx,
  markers = [],
  segments,
  routeMode = false,
  highlightedStopIndex: _highlightedStopIndex = null,
  routeStops = null,
  routeStart = null,
  routeEnd = null,
  routeGraphPolyline,
  debugMode = false,
}: PathLayerProps) {
  void _highlightedStopIndex;
  const r = Math.max(3, Math.min(6, cellPx * 0.18));

  const graphRouteOk = routeGraphPolyline != null && routeGraphPolyline.length >= 2;
  const graphRouteFailed = routeGraphPolyline === null;

  const rawMergedPoints: PathPoint[] =
    segments && segments.length > 0
      ? segments.reduce<PathPoint[]>((acc, seg) => {
          if (seg.length === 0) return acc;
          const startIdx = acc.length > 0 && samePoint(acc[acc.length - 1], seg[0]) ? 1 : 0;
          acc.push(...seg.slice(startIdx));
          return acc;
        }, [])
      : points;

  const visualRoutePoints =
    routeMode &&
    routeStart &&
    routeStops &&
    routeStops.length > 0 &&
    !graphRouteOk &&
    !graphRouteFailed
      ? buildVisualRoutePath(routeStart, routeStops, null, routeEnd ?? null)
      : null;

  const mergedPointsBase = graphRouteOk
    ? (debugMode
        ? mergeCollinearRoutePointsForDisplay(routeGraphPolyline!)
        : simplifyRenderedPath(mergeCollinearRoutePointsForDisplay(routeGraphPolyline!)))
    : graphRouteFailed
      ? []
      : routeMode && visualRoutePoints && visualRoutePoints.length >= 2
        ? (debugMode
            ? mergeCollinearRoutePointsForDisplay(visualRoutePoints)
            : simplifyRenderedPath(mergeCollinearRoutePointsForDisplay(visualRoutePoints)))
        : simplifyRenderedPath(rawMergedPoints);
  const aisleReadyPoints = debugMode ? mergedPointsBase : collapseStairJitter(mergedPointsBase);
  const aisleSegments = toAisleSegments(aisleReadyPoints);
  const mergedPoints = debugMode
    ? aisleReadyPoints
    : segmentsToPolylinePoints(aisleSegments, aisleReadyPoints[0] ?? { x: 0, y: 0 });

  const pts = mergedPoints
    .map((p) => {
      const { x, y } = toPx(p, cellPx);
      return `${x},${y}`;
    })
    .join(" ");

  if (mergedPoints.length < 2) return null;

  /** Picking route: one thin polyline; START/PACK in RouteStopLayer; order on racks. */
  const useRoutePolyline =
    routeMode &&
    mergedPoints.length >= 2 &&
    routeStart &&
    routeStops &&
    routeStops.length > 0 &&
    (graphRouteOk || (visualRoutePoints?.length ?? 0) >= 2);
  if (useRoutePolyline) {
    const ROUTE_STROKE = "#2563eb";
    const ROUTE_STROKE_W = Math.max(3, Math.min(4, cellPx * 0.09));
    const ROUTE_OPACITY = 1;
    const arrows = arrowsAtSegmentCenters(mergedPoints, cellPx);
    const stopMarkers = projectStopsToPathPx(routeStops ?? null, mergedPoints, cellPx);
    const markerR = Math.max(9, Math.min(12, cellPx * 0.24));
    return (
      <g pointerEvents="none">
        <polyline
          points={pts}
          stroke={ROUTE_STROKE}
          strokeWidth={ROUTE_STROKE_W}
          fill="none"
          strokeOpacity={ROUTE_OPACITY}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Subtle flow animation to indicate movement direction. */}
        <polyline
          points={pts}
          stroke="#93c5fd"
          strokeWidth={Math.max(1.4, ROUTE_STROKE_W * 0.45)}
          fill="none"
          strokeDasharray="8 14"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.9}
        >
          <animate attributeName="stroke-dashoffset" from="44" to="0" dur="1.4s" repeatCount="indefinite" />
        </polyline>
        {arrows.map((a, idx) => (
          <g key={`route-arrow-${idx}`} transform={`translate(${a.x}, ${a.y}) rotate(${a.angleDeg})`}>
            <path
              d={`M ${-Math.max(5, cellPx * 0.16)} ${-Math.max(4, cellPx * 0.12)} L ${Math.max(6, cellPx * 0.2)} 0 L ${-Math.max(5, cellPx * 0.16)} ${Math.max(4, cellPx * 0.12)} Z`}
              fill="#1d4ed8"
              opacity={0.95}
            />
          </g>
        ))}
        {stopMarkers.map((m) => (
          <g key={`route-step-${m.label}`} transform={`translate(${m.x}, ${m.y})`}>
            <circle r={markerR + 2} fill="#ffffff" opacity={0.95} />
            <circle r={markerR} fill="#1d4ed8" stroke="#ffffff" strokeWidth={1.8} />
            <text
              x={0}
              y={0}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#ffffff"
              fontSize={Math.max(9, Math.min(12, cellPx * 0.25))}
              fontWeight={800}
              style={{ userSelect: "none" }}
            >
              {m.label}
            </text>
          </g>
        ))}
      </g>
    );
  }

  const stroke = "#3b82f6";
  const strokeWidth = 2;
  const baseOpacity = 0.6;
  const start = mergedPoints[0];
  const end = mergedPoints[mergedPoints.length - 1];
  const sx = toPx(start, cellPx).x;
  const sy = toPx(start, cellPx).y;
  const ex = toPx(end, cellPx).x;
  const ey = toPx(end, cellPx).y;

  const pathContent = (
    <polyline
      points={pts}
      stroke={stroke}
      strokeWidth={strokeWidth}
      fill="none"
      strokeOpacity={baseOpacity}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );

  return (
    <g pointerEvents="none">
      {pathContent}
      {!routeMode && (
        <>
          <circle cx={sx} cy={sy} r={r} fill={stroke} opacity={baseOpacity} />
          <circle cx={ex} cy={ey} r={r} fill={stroke} opacity={baseOpacity} />
        </>
      )}
      {!routeMode &&
        markers.map((m) => {
          const mx = m.x * cellPx + cellPx / 2;
          const my = m.y * cellPx + cellPx / 2;
          const mr = Math.max(7, Math.min(12, cellPx * 0.28));
          return (
            <g key={m.label} transform={`translate(${mx}, ${my})`}>
              <circle r={mr} fill="#ffffff" opacity={0.95} />
              <circle r={mr} fill="none" stroke="#3b82f6" strokeWidth={2} opacity={0.9} />
              <text
                x={0}
                y={mr * 0.35}
                textAnchor="middle"
                fontSize={Math.max(9, Math.min(14, cellPx * 0.35))}
                fontWeight={700}
                fill="#1d4ed8"
              >
                {m.label}
              </text>
            </g>
          );
        })}
    </g>
  );
}

