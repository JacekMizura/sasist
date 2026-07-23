import { useCallback, useRef, useState } from "react";
import type { RoutingEdge, RoutingNode } from "../../../api/warehouseRoutingApi";
import { GRID_UNIT_CM } from "../../../types/warehouse";

type Props = {
  nodes: RoutingNode[];
  edges: RoutingEdge[];
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
  onEdgeClick?: (uuid: string) => void;
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
  } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ uuid: string; x: number; y: number } | null>(null);

  const resolveSvg = useCallback((el: Element): SVGSVGElement | null => {
    return (el.ownerSVGElement ?? (el as SVGSVGElement)) as SVGSVGElement;
  }, []);

  return (
    <g className="routing-graph-layer" data-routing-ssot="authored">
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
            const raw = clientToCm(svg, e.clientX, e.clientY, scale);
            const snapped = snapRoutingCm(raw.x, raw.y);
            onCanvasClickCm(snapped.x, snapped.y);
          }}
        />
      )}
      {edges.map((e) => {
        const a0 = byUuid.get(e.from_node_uuid);
        const b0 = byUuid.get(e.to_node_uuid);
        if (!a0 || !b0) return null;
        const a =
          dragPreview?.uuid === a0.uuid ? { ...a0, x: dragPreview.x, y: dragPreview.y } : a0;
        const b =
          dragPreview?.uuid === b0.uuid ? { ...b0, x: dragPreview.x, y: dragPreview.y } : b0;
        const active = selectedEdgeUuid === e.uuid || hiEdges.has(e.uuid);
        return (
          <g key={e.uuid}>
            <line
              x1={a.x * scale}
              y1={a.y * scale}
              x2={b.x * scale}
              y2={b.y * scale}
              stroke={active ? "#0ea5e9" : e.enabled ? "#64748b" : "#cbd5e1"}
              strokeWidth={active ? 4 : 2.5}
              strokeDasharray={e.enabled ? undefined : "6 4"}
              opacity={0.9}
              style={{ cursor: interactive ? "pointer" : "default", pointerEvents: "stroke" }}
              onClick={(ev) => {
                ev.stopPropagation();
                onEdgeClick?.(e.uuid);
              }}
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
      {nodes.map((n) => {
        const preview = dragPreview?.uuid === n.uuid ? dragPreview : null;
        const nx = preview?.x ?? n.x;
        const ny = preview?.y ?? n.y;
        const active = selectedNodeUuid === n.uuid || hiNodes.has(n.uuid);
        const isOp = Boolean(n.operational_type);
        return (
          <g
            key={n.uuid}
            style={{
              cursor: allowNodeDrag ? (dragRef.current?.uuid === n.uuid ? "grabbing" : "grab") : interactive ? "pointer" : "default",
              touchAction: "none",
            }}
            onPointerDown={(ev) => {
              if (!interactive || !allowNodeDrag) return;
              if (ev.button !== 0) return; // left button only — middle = pan
              ev.stopPropagation();
              ev.preventDefault();
              (ev.currentTarget as SVGGElement).setPointerCapture(ev.pointerId);
              dragRef.current = { uuid: n.uuid, moved: false, pointerId: ev.pointerId };
              setDragPreview({ uuid: n.uuid, x: n.x, y: n.y });
            }}
            onPointerMove={(ev) => {
              const drag = dragRef.current;
              if (!drag || drag.uuid !== n.uuid) return;
              ev.stopPropagation();
              const svg = resolveSvg(ev.currentTarget);
              if (!svg) return;
              const raw = clientToCm(svg, ev.clientX, ev.clientY, scale);
              const snapped = snapRoutingCm(raw.x, raw.y);
              if (Math.abs(snapped.x - n.x) > 0.01 || Math.abs(snapped.y - n.y) > 0.01) {
                drag.moved = true;
              }
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
              const svg = resolveSvg(ev.currentTarget);
              const raw = svg ? clientToCm(svg, ev.clientX, ev.clientY, scale) : { x: n.x, y: n.y };
              const snapped = snapRoutingCm(raw.x, raw.y);
              const moved = drag.moved;
              dragRef.current = null;
              setDragPreview(null);
              if (moved) {
                onNodeDragEnd?.(n.uuid, snapped.x, snapped.y);
              } else {
                onNodeClick?.(n.uuid);
              }
            }}
            onClick={(ev) => {
              ev.stopPropagation();
              if (allowNodeDrag) return; // select/drag: click handled in pointer up
              onNodeClick?.(n.uuid);
            }}
          >
            <circle
              cx={nx * scale}
              cy={ny * scale}
              r={active ? 8 : isOp ? 7 : 5}
              fill={active ? "#0284c7" : isOp ? "#f59e0b" : "#334155"}
              stroke="#fff"
              strokeWidth={1.5}
            />
            {n.label && (
              <text
                x={nx * scale + 10}
                y={ny * scale - 8}
                fontSize={10}
                fill="#0f172a"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {n.label}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
