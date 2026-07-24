import { useCallback, useRef, useState } from "react";
import type { RoutingAccessPoint, RoutingEdge, RoutingNode } from "../../../api/warehouseRoutingApi";
import { GRID_UNIT_CM } from "../../../types/warehouse";
import { nodeDisplayName, nodeKind, opTypeLabel } from "./routingDisplay";
import { EDGE_HIT_HALF_PX, NODE_HIT_RADIUS_PX, resolveSelectHit } from "./routingHitTest";

type Props = {
  nodes: RoutingNode[];
  edges: RoutingEdge[];
  accessPoints?: RoutingAccessPoint[];
  cellPx: number;
  selectedNodeUuid?: string | null;
  selectedEdgeUuid?: string | null;
  highlightNodeUuids?: string[];
  highlightEdgeUuids?: string[];
  draftFromUuid?: string | null;
  draftCursorCm?: { x: number; y: number } | null;
  /** When true (select tool), nodes can be dragged. */
  allowNodeDrag?: boolean;
  onNodeClick?: (uuid: string) => void;
  onEdgeClick?: (uuid: string, cm?: { x: number; y: number }) => void;
  onCanvasClickCm?: (x: number, y: number) => void;
  onCanvasMoveCm?: (x: number, y: number) => void;
  onNodeDrag?: (uuid: string, xCm: number, yCm: number) => void;
  onNodeDragEnd?: (uuid: string, xCm: number, yCm: number) => void;
  interactive?: boolean;
};

function clientToCm(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  scale: number
): { x: number; y: number } {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const loc = pt.matrixTransform(ctm.inverse());
  return { x: loc.x / scale, y: loc.y / scale };
}

function clientToSvgPx(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number
): { x: number; y: number } {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const loc = pt.matrixTransform(ctm.inverse());
  return { x: loc.x, y: loc.y };
}

/** Snap to layout grid (1 cell = GRID_UNIT_CM). */
export function snapRoutingCm(x: number, y: number): { x: number; y: number } {
  const g = GRID_UNIT_CM;
  return {
    x: Math.round(x / g) * g,
    y: Math.round(y / g) * g,
  };
}

export function RoutingGraphLayer({
  nodes,
  edges,
  accessPoints = [],
  cellPx,
  selectedNodeUuid,
  selectedEdgeUuid,
  highlightNodeUuids = [],
  highlightEdgeUuids = [],
  draftFromUuid,
  draftCursorCm,
  allowNodeDrag = false,
  onNodeClick,
  onEdgeClick,
  onCanvasClickCm,
  onCanvasMoveCm,
  onNodeDrag,
  onNodeDragEnd,
  interactive = true,
}: Props) {
  const byUuid = new Map(nodes.map((n) => [n.uuid, n]));
  const hiNodes = new Set(highlightNodeUuids);
  const hiEdges = new Set(highlightEdgeUuids);
  const scale = cellPx / GRID_UNIT_CM;
  const draftFrom = draftFromUuid ? byUuid.get(draftFromUuid) : null;

  const dragRef = useRef<{
    uuid: string;
    moved: boolean;
    pointerId: number;
    startX?: number;
    startY?: number;
  } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ uuid: string; x: number; y: number } | null>(null);
  const [hoverNodeUuid, setHoverNodeUuid] = useState<string | null>(null);
  const [hoverEdgeUuid, setHoverEdgeUuid] = useState<string | null>(null);

  const resolveSvg = useCallback((el: Element): SVGSVGElement | null => {
    return (el.ownerSVGElement ?? (el as SVGSVGElement)) as SVGSVGElement;
  }, []);

  const nodePxMap = () => {
    const m = new Map<string, { x: number; y: number }>();
    for (const n of nodes) {
      const preview = dragPreview?.uuid === n.uuid ? dragPreview : null;
      m.set(n.uuid, { x: (preview?.x ?? n.x) * scale, y: (preview?.y ?? n.y) * scale });
    }
    return m;
  };

  /** Unified pick: POINT > EDGE (guards against transparent-fill / stroke endpoint steal). */
  const pickAtClient = (svg: SVGSVGElement, clientX: number, clientY: number) => {
    const px = clientToSvgPx(svg, clientX, clientY);
    return resolveSelectHit({
      xPx: px.x,
      yPx: px.y,
      nodes,
      edges,
      nodePx: nodePxMap(),
      nodeHitRadiusPx: NODE_HIT_RADIUS_PX,
      edgeHitHalfPx: EDGE_HIT_HALF_PX,
    });
  };

  return (
    <g className="routing-graph-layer" data-routing-ssot="authored">
      {/* 1) Canvas underlay */}
      {interactive && (
        <rect
          x={0}
          y={0}
          width="100%"
          height="100%"
          fill="transparent"
          style={{ pointerEvents: "all" }}
          onPointerMove={(e) => {
            const svg = resolveSvg(e.currentTarget);
            if (!svg) return;
            const cm = clientToCm(svg, e.clientX, e.clientY, scale);
            onCanvasMoveCm?.(cm.x, cm.y);
          }}
          onClick={(e) => {
            if (dragRef.current?.moved) return;
            const svg = resolveSvg(e.currentTarget);
            if (!svg || !onCanvasClickCm) return;
            const hit = pickAtClient(svg, e.clientX, e.clientY);
            if (hit.kind !== "empty") return;
            const raw = clientToCm(svg, e.clientX, e.clientY, scale);
            const snapped = snapRoutingCm(raw.x, raw.y);
            onCanvasClickCm(snapped.x, snapped.y);
          }}
        />
      )}

      {/* 2) Edges UNDER nodes — wide stroke for mid-segment clicks only */}
      {edges.map((e) => {
        const a0 = byUuid.get(e.from_node_uuid);
        const b0 = byUuid.get(e.to_node_uuid);
        if (!a0 || !b0) return null;
        const a =
          dragPreview?.uuid === a0.uuid ? { ...a0, x: dragPreview.x, y: dragPreview.y } : a0;
        const b =
          dragPreview?.uuid === b0.uuid ? { ...b0, x: dragPreview.x, y: dragPreview.y } : b0;
        const active = selectedEdgeUuid === e.uuid || hiEdges.has(e.uuid);
        const hovered = hoverEdgeUuid === e.uuid && !hoverNodeUuid;
        return (
          <g key={e.uuid}>
            <line
              x1={a.x * scale}
              y1={a.y * scale}
              x2={b.x * scale}
              y2={b.y * scale}
              stroke="transparent"
              strokeWidth={EDGE_HIT_HALF_PX * 2}
              style={{ cursor: interactive ? "pointer" : "default", pointerEvents: "stroke" }}
              onPointerEnter={() => {
                if (!hoverNodeUuid) setHoverEdgeUuid(e.uuid);
              }}
              onPointerLeave={() => setHoverEdgeUuid((u) => (u === e.uuid ? null : u))}
              onClick={(ev) => {
                ev.stopPropagation();
                const svg = resolveSvg(ev.currentTarget);
                if (!svg) return;
                // POINT wins even if edge stroke received the DOM event at an endpoint.
                const hit = pickAtClient(svg, ev.clientX, ev.clientY);
                if (hit.kind === "node") {
                  onNodeClick?.(hit.uuid);
                  return;
                }
                if (hit.kind === "edge") {
                  const cm = clientToCm(svg, ev.clientX, ev.clientY, scale);
                  onEdgeClick?.(hit.uuid, cm);
                }
              }}
            />
            <line
              x1={a.x * scale}
              y1={a.y * scale}
              x2={b.x * scale}
              y2={b.y * scale}
              stroke={active || hovered ? "#0ea5e9" : e.enabled ? "#64748b" : "#cbd5e1"}
              strokeWidth={active || hovered ? 4 : 2.5}
              strokeDasharray={e.enabled ? undefined : "6 4"}
              opacity={0.9}
              style={{ pointerEvents: "none" }}
            />
            {(e.direction === "FORWARD" || e.direction === "BACKWARD") && (
              <circle
                cx={((a.x + b.x) / 2) * scale}
                cy={((a.y + b.y) / 2) * scale}
                r={3}
                fill="#0ea5e9"
                style={{ pointerEvents: "none" }}
              />
            )}
          </g>
        );
      })}

      {draftFrom && draftCursorCm && (
        <line
          x1={draftFrom.x * scale}
          y1={draftFrom.y * scale}
          x2={draftCursorCm.x * scale}
          y2={draftCursorCm.y * scale}
          stroke="#38bdf8"
          strokeWidth={2}
          strokeDasharray="4 3"
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* 3) Nodes ON TOP — large hittable disc (never transparent-only / visiblePainted miss) */}
      {nodes.map((n) => {
        const preview = dragPreview?.uuid === n.uuid ? dragPreview : null;
        const nx = preview?.x ?? n.x;
        const ny = preview?.y ?? n.y;
        const active = selectedNodeUuid === n.uuid || hiNodes.has(n.uuid);
        const hovered = hoverNodeUuid === n.uuid;
        const kind = nodeKind(n, accessPoints);
        const tip = nodeDisplayName(n, accessPoints, [], nodes);
        const showLabel = kind === "operational" && (active || hovered);
        const r = active || hovered ? (kind === "operational" ? 9 : 7) : kind === "operational" ? 8 : kind === "access" ? 6 : 4.5;
        const fill =
          active ? "#0284c7" : kind === "operational" ? "#d97706" : kind === "access" ? "#059669" : "#475569";
        const hitR = NODE_HIT_RADIUS_PX;
        return (
          <g
            key={n.uuid}
            data-routing-node={n.uuid}
            style={{
              cursor: allowNodeDrag
                ? dragRef.current?.uuid === n.uuid && dragRef.current.moved
                  ? "grabbing"
                  : "grab"
                : interactive
                  ? "pointer"
                  : "default",
              touchAction: "none",
            }}
            onPointerDown={(ev) => {
              if (!interactive) return;
              if (ev.button !== 0) return;
              ev.stopPropagation();
              // Always arm selection/drag from node hitbox (select + draw reuse).
              dragRef.current = {
                uuid: n.uuid,
                moved: false,
                pointerId: ev.pointerId,
                startX: ev.clientX,
                startY: ev.clientY,
              };
              if (!allowNodeDrag) return;
            }}
            onPointerMove={(ev) => {
              const drag = dragRef.current;
              if (!drag || drag.uuid !== n.uuid) return;
              if (!allowNodeDrag) return;
              ev.stopPropagation();
              const startX = drag.startX ?? ev.clientX;
              const startY = drag.startY ?? ev.clientY;
              const pixelDist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
              if (!drag.moved && pixelDist < 6) return;
              if (!drag.moved) {
                drag.moved = true;
                try {
                  (ev.currentTarget as SVGGElement).setPointerCapture(ev.pointerId);
                } catch {
                  /* ignore */
                }
              }
              const svg = resolveSvg(ev.currentTarget);
              if (!svg) return;
              const raw = clientToCm(svg, ev.clientX, ev.clientY, scale);
              const snapped = snapRoutingCm(raw.x, raw.y);
              setDragPreview({ uuid: n.uuid, x: snapped.x, y: snapped.y });
              onNodeDrag?.(n.uuid, snapped.x, snapped.y);
            }}
            onPointerUp={(ev) => {
              const drag = dragRef.current;
              if (!drag || drag.uuid !== n.uuid) return;
              ev.stopPropagation();
              try {
                (ev.currentTarget as SVGGElement).releasePointerCapture(ev.pointerId);
              } catch {
                /* ignore */
              }
              const moved = drag.moved;
              dragRef.current = null;
              setDragPreview(null);
              if (allowNodeDrag && moved) {
                const svg = resolveSvg(ev.currentTarget);
                const raw = svg ? clientToCm(svg, ev.clientX, ev.clientY, scale) : { x: n.x, y: n.y };
                const snapped = snapRoutingCm(raw.x, raw.y);
                onNodeDragEnd?.(n.uuid, snapped.x, snapped.y);
                return;
              }
              onNodeClick?.(n.uuid);
            }}
            onClick={(ev) => {
              // Fallback if pointerUp path was skipped; never let click fall through to edge.
              ev.stopPropagation();
            }}
            onPointerEnter={() => {
              setHoverNodeUuid(n.uuid);
              setHoverEdgeUuid(null);
            }}
            onPointerLeave={() => setHoverNodeUuid((u) => (u === n.uuid ? null : u))}
          >
            <title>{tip}</title>
            {/*
              CRITICAL: fill must be a real paint + pointer-events:all.
              fill="transparent" + default visiblePainted often misses hits → edge steals click.
            */}
            <circle
              cx={nx * scale}
              cy={ny * scale}
              r={hitR}
              fill="rgba(0,0,0,0.001)"
              style={{ pointerEvents: "all" }}
            />
            {(active || hovered) && (
              <circle
                cx={nx * scale}
                cy={ny * scale}
                r={hitR}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={1.5}
                opacity={0.85}
                style={{ pointerEvents: "none" }}
              />
            )}
            {kind === "access" && (
              <circle
                cx={nx * scale}
                cy={ny * scale}
                r={r + 3}
                fill="none"
                stroke="#059669"
                strokeWidth={1.5}
                opacity={0.7}
                style={{ pointerEvents: "none" }}
              />
            )}
            {kind === "operational" ? (
              <rect
                x={nx * scale - r}
                y={ny * scale - r}
                width={r * 2}
                height={r * 2}
                rx={2}
                fill={fill}
                stroke="#fff"
                strokeWidth={1.5}
                style={{ pointerEvents: "none" }}
              />
            ) : (
              <circle
                cx={nx * scale}
                cy={ny * scale}
                r={r}
                fill={fill}
                stroke="#fff"
                strokeWidth={1.5}
                style={{ pointerEvents: "none" }}
              />
            )}
            {showLabel && (
              <text
                x={nx * scale + r + 4}
                y={ny * scale - 4}
                fontSize={11}
                fontWeight={600}
                fill="#0f172a"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {opTypeLabel(n.operational_type) || n.label}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
