import type { RackState } from "../../../types/warehouse";
import { getRackFootprintPixelBounds } from "../../../utils/rackMapVisual";

export type RouteStop = { rackId: string; position: { x: number; y: number } };

export type RouteStopLayerProps = {
  routeStops: RouteStop[];
  racks: RackState[];
  pickStartCell: { x: number; y: number };
  cellPx: number;
  /** Kept for API compatibility; stop order is shown on racks via RackLayer. */
  getRackDisplayId?: (r: RackState) => string;
  highlightedStopIndex: number | null;
  currentStopIndex: number | null;
  markerPlacement?: "rack" | "path";
  routeEndCell?: { x: number; y: number } | null;
  /** When false, hide START/PACK (step-by-step navigation uses rack badges only). */
  showEndpointMarkers?: boolean;
};

function toPx(p: { x: number; y: number }, cellPx: number) {
  return { x: p.x * cellPx + cellPx / 2, y: p.y * cellPx + cellPx / 2 };
}

function nearestRackEdgePointPx(
  stopCell: { x: number; y: number },
  rack: RackState,
  cellPx: number
): { x: number; y: number } {
  const s = toPx(stopCell, cellPx);
  const b = getRackFootprintPixelBounds({ x: rack.x, y: rack.y }, rack, cellPx);
  const x0 = b.x0;
  const y0 = b.y0;
  const x1 = b.x1;
  const y1 = b.y1;
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const candidates = [
    { x: clamp(s.x, x0, x1), y: y0 },
    { x: clamp(s.x, x0, x1), y: y1 },
    { x: x0, y: clamp(s.y, y0, y1) },
    { x: x1, y: clamp(s.y, y0, y1) },
  ];
  let best = candidates[0];
  let bestD2 = (best.x - s.x) ** 2 + (best.y - s.y) ** 2;
  for (let i = 1; i < candidates.length; i += 1) {
    const c = candidates[i];
    const d2 = (c.x - s.x) ** 2 + (c.y - s.y) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = c;
    }
  }
  return best;
}

export function RouteStopLayer({
  routeStops,
  racks,
  pickStartCell,
  cellPx,
  getRackDisplayId: _getRackDisplayId,
  highlightedStopIndex: _highlightedStopIndex,
  currentStopIndex: _currentStopIndex,
  markerPlacement: _markerPlacement = "rack",
  routeEndCell = null,
  showEndpointMarkers = true,
}: RouteStopLayerProps) {
  if (!showEndpointMarkers) return null;
  if (routeStops.length === 0) return null;
  void _getRackDisplayId;
  void _highlightedStopIndex;
  void _currentStopIndex;
  void _markerPlacement;

  const startPx = toPx(pickStartCell, cellPx);
  const startR = Math.max(15, Math.min(20, cellPx * 0.48));
  const packR = Math.max(13, Math.min(19, cellPx * 0.42));
  const packFont = Math.max(9, Math.min(12, cellPx * 0.28));

  const rackById = new Map<string, RackState>();
  for (const r of racks) rackById.set(String(r.id ?? r.rack_index), r);

  return (
    <g pointerEvents="none">
      <defs>
        <filter id="route-stop-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#0f172a" floodOpacity={0.28} />
        </filter>
      </defs>
      {/* START */}
      <g transform={`translate(${startPx.x}, ${startPx.y})`} filter="url(#route-stop-shadow)">
        <circle r={startR + 3} fill="#ffffff" opacity={0.98} />
        <circle r={startR} fill="#2563eb" stroke="#1e40af" strokeWidth={3} />
        <path
          d={`M 0 ${-startR * 0.45} L ${startR * 0.38} 0 L 0 ${startR * 0.45} L ${-startR * 0.38} 0 Z`}
          fill="#ffffff"
        />
        <text
          x={0}
          y={startR + 12}
          textAnchor="middle"
          fontSize={10}
          fontWeight={800}
          fill="#1e3a8a"
        >
          START
        </text>
      </g>

      {routeStops.map((s, idx) => {
        const rack = rackById.get(String(s.rackId));
        if (!rack) return null;
        const sp = toPx(s.position, cellPx);
        const rp = nearestRackEdgePointPx(s.position, rack, cellPx);
        return (
          <g key={`route-link-${s.rackId}-${idx}`}>
            <line
              x1={sp.x}
              y1={sp.y}
              x2={rp.x}
              y2={rp.y}
              stroke="#1d4ed8"
              strokeWidth={1.6}
              strokeOpacity={0.85}
            />
          </g>
        );
      })}

      {routeEndCell != null && (
        <g
          transform={`translate(${toPx(routeEndCell, cellPx).x}, ${toPx(routeEndCell, cellPx).y})`}
          filter="url(#route-stop-shadow)"
        >
          <circle r={packR + 3} fill="#ffffff" opacity={0.98} />
          <circle r={packR} fill="#ea580c" stroke="#9a3412" strokeWidth={3} />
          <text
            x={0}
            y={packFont * 0.35}
            textAnchor="middle"
            fontSize={packFont}
            fontWeight={800}
            fill="#ffffff"
          >
            PACK
          </text>
        </g>
      )}
    </g>
  );
}
