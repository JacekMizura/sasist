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
  onNodeClick?: (uuid: string) => void;
  onEdgeClick?: (uuid: string) => void;
  onCanvasClickCm?: (x: number, y: number) => void;
  interactive?: boolean;
};

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
  onNodeClick,
  onEdgeClick,
  onCanvasClickCm,
  interactive = true,
}: Props) {
  const byUuid = new Map(nodes.map((n) => [n.uuid, n]));
  const hiNodes = new Set(highlightNodeUuids);
  const hiEdges = new Set(highlightEdgeUuids);
  const scale = cellPx / GRID_UNIT_CM;

  const draftFrom = draftFromUuid ? byUuid.get(draftFromUuid) : null;

  return (
    <g className="routing-graph-layer" data-routing-ssot="authored">
      {interactive && onCanvasClickCm && (
        <rect
          x={0}
          y={0}
          width="100%"
          height="100%"
          fill="transparent"
          style={{ pointerEvents: "all" }}
          onClick={(e) => {
            const svg = (e.currentTarget.ownerSVGElement ?? e.currentTarget) as SVGSVGElement;
            const pt = svg.createSVGPoint();
            pt.x = e.clientX;
            pt.y = e.clientY;
            const ctm = svg.getScreenCTM();
            if (!ctm) return;
            const loc = pt.matrixTransform(ctm.inverse());
            onCanvasClickCm(loc.x / scale, loc.y / scale);
          }}
        />
      )}
      {edges.map((e) => {
        const a = byUuid.get(e.from_node_uuid);
        const b = byUuid.get(e.to_node_uuid);
        if (!a || !b) return null;
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
              style={{ cursor: interactive ? "pointer" : "default" }}
              onClick={(ev) => {
                ev.stopPropagation();
                onEdgeClick?.(e.uuid);
              }}
            />
            {e.direction === "FORWARD" && (
              <circle
                cx={((a.x + b.x) / 2) * scale}
                cy={((a.y + b.y) / 2) * scale}
                r={3}
                fill="#0ea5e9"
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
        />
      )}
      {nodes.map((n) => {
        const active = selectedNodeUuid === n.uuid || hiNodes.has(n.uuid);
        const isOp = Boolean(n.operational_type);
        return (
          <g
            key={n.uuid}
            style={{ cursor: interactive ? "pointer" : "default" }}
            onClick={(ev) => {
              ev.stopPropagation();
              onNodeClick?.(n.uuid);
            }}
          >
            <circle
              cx={n.x * scale}
              cy={n.y * scale}
              r={active ? 8 : isOp ? 7 : 5}
              fill={active ? "#0284c7" : isOp ? "#f59e0b" : "#334155"}
              stroke="#fff"
              strokeWidth={1.5}
            />
            {n.label && (
              <text
                x={n.x * scale + 10}
                y={n.y * scale - 8}
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
