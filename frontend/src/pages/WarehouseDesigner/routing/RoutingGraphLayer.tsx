import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type {
  LocationAccessBinding,
  RoutingAccessPoint,
  RoutingEdge,
  RoutingNode,
} from "../../../api/warehouseRoutingApi";
import { GRID_UNIT_CM, type RackState } from "../../../types/warehouse";
import { worldServiceNormal } from "../rackServiceFace";
import { nodeDisplayName, nodeKind, opTypeLabel } from "./routingDisplay";
import { EDGE_HIT_HALF_PX, NODE_HIT_RADIUS_PX, resolveSelectHit } from "./routingHitTest";
import { RoutingPointIcon, routingPointIconKind } from "./routingPointIcons";
import {
  endpointSnapToDropTarget,
  resolveEndpointRewireSnap,
  type EndpointDragEnd,
  type EndpointRewireDropTarget,
  type EndpointSnapPreview,
} from "./routingEndpointDrag";

type Props = {
  nodes: RoutingNode[];
  edges: RoutingEdge[];
  accessPoints?: RoutingAccessPoint[];
  locationAccess?: LocationAccessBinding[];
  showAccessDiagnostics?: boolean;
  /** Layout racks — used for aggregated face markers (not all S→P lines). */
  racks?: RackState[];
  /** When set, show detailed S→P only for these rack uuids. */
  selectedRackUuids?: string[];
  /** When set, show detailed S→P only for this location id. */
  selectedLocationId?: number | null;
  /** Emphasize problem racks (no spaghetti lines). */
  showAllAccessProblems?: boolean;
  /** Rack uuids with access problems — used for subtle badges when diagnostics on. */
  problemRackUuids?: string[];
  cellPx: number;
  selectedNodeUuid?: string | null;
  selectedEdgeUuid?: string | null;
  highlightNodeUuids?: string[];
  highlightEdgeUuids?: string[];
  /** Soft physical-collision diagnostics (rose dashed) — does not block save. */
  diagnosticEdgeUuids?: string[];
  draftFromUuid?: string | null;
  draftCursorCm?: { x: number; y: number } | null;
  /** Orthogonal guide while drafting (prefer 0/90). */
  draftOrthoGuide?: "none" | "h" | "v" | null;
  /** When true (Edit tool), nodes can be dragged. */
  allowNodeDrag?: boolean;
  /** When true (Edit tool), selected edge shows endpoint handles for rewire. */
  allowEndpointDrag?: boolean;
  onNodeClick?: (uuid: string) => void;
  onEdgeClick?: (uuid: string, cm?: { x: number; y: number }) => void;
  onCanvasClickCm?: (x: number, y: number, opts?: { freeAngle?: boolean }) => void;
  onCanvasMoveCm?: (x: number, y: number, opts?: { freeAngle?: boolean }) => void;
  onNodeDrag?: (uuid: string, xCm: number, yCm: number) => void;
  onNodeDragEnd?: (uuid: string, xCm: number, yCm: number) => void;
  /** Drop result after dragging an edge endpoint (snap to node or new ghost). */
  onEndpointRewireDrop?: (payload: {
    edgeUuid: string;
    end: EndpointDragEnd;
    target: EndpointRewireDropTarget;
  }) => void;
  interactive?: boolean;
};

const ENDPOINT_HANDLE_R_PX = 8;

type RackAccessAgg = {
  rackUuid: string;
  status: "OK" | "REVIEW" | "BLOCKED";
  nx: number;
  ny: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
};

function accessStatusRank(status: string | undefined): "OK" | "REVIEW" | "BLOCKED" {
  const s = String(status || "").toUpperCase();
  if (s === "OK" || s === "RESOLVED" || s === "LEGACY_NODE") return "OK";
  if (s === "REVIEW" || s === "AMBIGUOUS") return "REVIEW";
  return "BLOCKED";
}

function worstStatus(a: "OK" | "REVIEW" | "BLOCKED", b: "OK" | "REVIEW" | "BLOCKED") {
  const order = { OK: 0, REVIEW: 1, BLOCKED: 2 } as const;
  return order[b] > order[a] ? b : a;
}

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
  locationAccess = [],
  showAccessDiagnostics = false,
  racks = [],
  selectedRackUuids = [],
  selectedLocationId = null,
  showAllAccessProblems = false,
  problemRackUuids = [],
  cellPx,
  selectedNodeUuid,
  selectedEdgeUuid,
  highlightNodeUuids = [],
  highlightEdgeUuids = [],
  diagnosticEdgeUuids = [],
  draftFromUuid,
  draftCursorCm,
  draftOrthoGuide = null,
  allowNodeDrag = false,
  allowEndpointDrag = false,
  onNodeClick,
  onEdgeClick,
  onCanvasClickCm,
  onCanvasMoveCm,
  onNodeDrag,
  onNodeDragEnd,
  onEndpointRewireDrop,
  interactive = true,
}: Props) {
  const byUuid = new Map(nodes.map((n) => [n.uuid, n]));
  const hiNodes = new Set(highlightNodeUuids);
  const hiEdges = new Set(highlightEdgeUuids);
  const diagEdges = new Set(diagnosticEdgeUuids);
  const scale = cellPx / GRID_UNIT_CM;
  const draftFrom = draftFromUuid ? byUuid.get(draftFromUuid) : null;
  const selectedRackSet = useMemo(() => new Set(selectedRackUuids.filter(Boolean)), [selectedRackUuids]);
  const problemRackSet = useMemo(() => new Set(problemRackUuids.filter(Boolean)), [problemRackUuids]);
  const detailMode = selectedRackSet.size > 0 || selectedLocationId != null;

  const rackAgg = useMemo(() => {
    const byRack = new Map<string, RackAccessAgg>();
    const rackByUuid = new Map(racks.map((r) => [String(r.uuid || ""), r]));
    for (const a of locationAccess) {
      const ru = a.rack_uuid ? String(a.rack_uuid) : "";
      if (!ru) continue;
      const rack = rackByUuid.get(ru);
      if (!rack) continue;
      const n = worldServiceNormal(
        String(rack.orientation || "vertical"),
        rack.rotationDegrees ?? 0,
        rack.serviceSide ?? "FRONT"
      );
      const st = accessStatusRank(a.status);
      const prev = byRack.get(ru);
      const cx = (Number(rack.x) + Number(rack.width) / 2) * GRID_UNIT_CM;
      const cy = (Number(rack.y) + Number(rack.height) / 2) * GRID_UNIT_CM;
      const w = Number(rack.width) * GRID_UNIT_CM;
      const h = Number(rack.height) * GRID_UNIT_CM;
      if (!prev) {
        byRack.set(ru, { rackUuid: ru, status: st, nx: n.x, ny: n.y, cx, cy, w, h });
      } else {
        byRack.set(ru, { ...prev, status: worstStatus(prev.status, st), nx: n.x, ny: n.y });
      }
    }
    return [...byRack.values()];
  }, [locationAccess, racks]);

  const detailAccess = useMemo(() => {
    if (!detailMode) return [] as LocationAccessBinding[];
    if (!showAccessDiagnostics && selectedLocationId == null) return [] as LocationAccessBinding[];
    return locationAccess.filter((a) => {
      // Prefer single-location detail when clicked from problem list.
      if (selectedLocationId != null) return a.location_id === selectedLocationId;
      if (a.rack_uuid && selectedRackSet.has(String(a.rack_uuid))) return true;
      return false;
    });
  }, [showAccessDiagnostics, detailMode, locationAccess, selectedLocationId, selectedRackSet]);

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
  const endpointDragRef = useRef<{
    edgeUuid: string;
    end: EndpointDragEnd;
    pointerId: number;
    moved: boolean;
    fixedNodeUuid: string;
    currentNodeUuid: string;
  } | null>(null);
  const endpointSnapRef = useRef<EndpointSnapPreview | null>(null);
  const [endpointDragPreview, setEndpointDragPreview] = useState<{
    edgeUuid: string;
    end: EndpointDragEnd;
    snap: EndpointSnapPreview;
    fixedCm: { x: number; y: number };
  } | null>(null);

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
            onCanvasMoveCm?.(cm.x, cm.y, { freeAngle: e.shiftKey });
          }}
          onClick={(e) => {
            if (dragRef.current?.moved) return;
            if (endpointDragRef.current?.moved) return;
            const svg = resolveSvg(e.currentTarget);
            if (!svg || !onCanvasClickCm) return;
            const hit = pickAtClient(svg, e.clientX, e.clientY);
            if (hit.kind !== "empty") return;
            const raw = clientToCm(svg, e.clientX, e.clientY, scale);
            const snapped = snapRoutingCm(raw.x, raw.y);
            onCanvasClickCm(snapped.x, snapped.y, { freeAngle: e.shiftKey });
          }}
        />
      )}

      {/* 2) Edges UNDER nodes — wide stroke for mid-segment clicks only */}
      {edges.map((e) => {
        const a0 = byUuid.get(e.from_node_uuid);
        const b0 = byUuid.get(e.to_node_uuid);
        if (!a0 || !b0) return null;
        let a =
          dragPreview?.uuid === a0.uuid ? { ...a0, x: dragPreview.x, y: dragPreview.y } : a0;
        let b =
          dragPreview?.uuid === b0.uuid ? { ...b0, x: dragPreview.x, y: dragPreview.y } : b0;
        // Live rewire preview: moving endpoint follows snap target
        if (endpointDragPreview?.edgeUuid === e.uuid) {
          const snap = endpointDragPreview.snap;
          if (endpointDragPreview.end === "from") {
            a = { ...a, x: snap.x, y: snap.y };
          } else {
            b = { ...b, x: snap.x, y: snap.y };
          }
        }
        const active = selectedEdgeUuid === e.uuid || hiEdges.has(e.uuid);
        const diagnostic = diagEdges.has(e.uuid);
        const hovered = hoverEdgeUuid === e.uuid && !hoverNodeUuid;
        const rewiring = endpointDragPreview?.edgeUuid === e.uuid;
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
                if (endpointDragRef.current?.moved) return;
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
              stroke={
                diagnostic
                  ? "#e11d48"
                  : rewiring || active || hovered
                    ? "#0ea5e9"
                    : e.enabled
                      ? "#64748b"
                      : "#cbd5e1"
              }
              strokeWidth={diagnostic || rewiring || active || hovered ? 4 : 2.5}
              strokeDasharray={
                diagnostic ? "7 4" : rewiring ? "6 3" : e.enabled ? undefined : "6 4"
              }
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
        <>
          {draftOrthoGuide === "h" || draftOrthoGuide === "v" ? (
            <line
              x1={
                draftOrthoGuide === "h"
                  ? Math.min(draftFrom.x, draftCursorCm.x) * scale - 40
                  : draftFrom.x * scale
              }
              y1={
                draftOrthoGuide === "v"
                  ? Math.min(draftFrom.y, draftCursorCm.y) * scale - 40
                  : draftFrom.y * scale
              }
              x2={
                draftOrthoGuide === "h"
                  ? Math.max(draftFrom.x, draftCursorCm.x) * scale + 40
                  : draftFrom.x * scale
              }
              y2={
                draftOrthoGuide === "v"
                  ? Math.max(draftFrom.y, draftCursorCm.y) * scale + 40
                  : draftFrom.y * scale
              }
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="2 4"
              opacity={0.7}
              style={{ pointerEvents: "none" }}
            />
          ) : null}
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
        </>
      )}

      {(showAccessDiagnostics || showAllAccessProblems) &&
        !detailMode &&
        rackAgg
          .filter((agg) => problemRackSet.has(agg.rackUuid) || agg.status !== "OK")
          .map((agg) => {
          const stroke =
            agg.status === "OK" ? "#10b981" : agg.status === "REVIEW" ? "#f59e0b" : "#f43f5e";
          const emphasize = showAllAccessProblems && problemRackSet.has(agg.rackUuid);
          const faceLen = Math.max(10, Math.min(agg.w, agg.h) * 0.22);
          const x1 = agg.cx * scale;
          const y1 = agg.cy * scale;
          const x2 = (agg.cx + agg.nx * faceLen) * scale;
          const y2 = (agg.cy + agg.ny * faceLen) * scale;
          const hw = (agg.w * scale) / 2;
          const hh = (agg.h * scale) / 2;
          return (
            <g key={`la-agg-${agg.rackUuid}`} style={{ pointerEvents: "none" }} opacity={emphasize ? 0.95 : 0.55}>
              {emphasize && (
                <rect
                  x={x1 - hw}
                  y={y1 - hh}
                  width={agg.w * scale}
                  height={agg.h * scale}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  rx={3}
                />
              )}
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={emphasize ? 2.5 : 1.75} />
              <circle cx={x2} cy={y2} r={emphasize ? 4.5 : 3} fill={stroke} />
              <title>
                {agg.status === "OK"
                  ? "OK — dostęp"
                  : agg.status === "REVIEW"
                    ? "Do sprawdzenia"
                    : "Brak dostępu"}
              </title>
            </g>
          );
        })}

      {(showAccessDiagnostics || selectedLocationId != null) &&
        detailAccess.map((a) => {
          if (
            a.service_point_x_cm == null ||
            a.service_point_y_cm == null ||
            a.entry_x_cm == null ||
            a.entry_y_cm == null
          ) {
            return null;
          }
          const ok = a.status === "OK" || a.status === "RESOLVED" || a.status === "LEGACY_NODE";
          const review = a.status === "REVIEW" || a.status === "AMBIGUOUS";
          const broken = a.status === "OVERRIDE_BROKEN" || a.status === "BLOCKED";
          const stroke = ok ? "#10b981" : review ? "#f59e0b" : broken ? "#f43f5e" : "#f43f5e";
          return (
            <g key={`la-${a.uuid}`} style={{ pointerEvents: "none" }} opacity={0.9}>
              <line
                x1={a.service_point_x_cm * scale}
                y1={a.service_point_y_cm * scale}
                x2={a.entry_x_cm * scale}
                y2={a.entry_y_cm * scale}
                stroke={stroke}
                strokeWidth={2}
                strokeDasharray="4 2"
              />
              <circle cx={a.entry_x_cm * scale} cy={a.entry_y_cm * scale} r={3.5} fill={stroke} />
            </g>
          );
        })}

      {/* 3) Nodes ON TOP — large hittable disc (never transparent-only / visiblePainted miss) */}
      {nodes.map((n) => {
        const preview = dragPreview?.uuid === n.uuid ? dragPreview : null;
        const nx = preview?.x ?? n.x;
        const ny = preview?.y ?? n.y;
        const active =
          selectedNodeUuid === n.uuid ||
          hiNodes.has(n.uuid) ||
          (endpointDragPreview?.snap.kind === "node" &&
            endpointDragPreview.snap.uuid === n.uuid);
        const hovered = hoverNodeUuid === n.uuid;
        const kind = nodeKind(n, accessPoints);
        const tip = nodeDisplayName(n, accessPoints, [], nodes);
        const showLabel = kind === "operational" && (active || hovered);
        // Slight diamond for auto-intersections / high-degree junctions
  const isJunctionMark =
    kind === "junction" &&
    (Boolean((n.meta as { auto_intersection?: boolean } | null)?.auto_intersection) ||
      (n.label ?? "").trim() === "Skrzyżowanie");
  const r = active || hovered ? (kind === "operational" ? 9 : 7) : kind === "operational" ? 8 : kind === "access" ? 6 : isJunctionMark ? 5.5 : 4.5;

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
              if (endpointDragRef.current) return;
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
              (() => {
                const iconKind = routingPointIconKind(n.operational_type);
                if (iconKind) {
                  return (
                    <RoutingPointIcon
                      kind={iconKind}
                      cx={nx * scale}
                      cy={ny * scale}
                      size={r + 1}
                      fill={fill}
                    />
                  );
                }
                // Legacy / unknown operational — keep previous square marker
                return (
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
                );
              })()
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

      {/* 4) Endpoint handles + snap ghost (Edit mode, selected edge) — above nodes */}
      {allowEndpointDrag &&
        interactive &&
        selectedEdgeUuid &&
        (() => {
          const edge = edges.find((e) => e.uuid === selectedEdgeUuid);
          if (!edge) return null;
          const fromN = byUuid.get(edge.from_node_uuid);
          const toN = byUuid.get(edge.to_node_uuid);
          if (!fromN || !toN) return null;

          const startEndpointDrag = (
            end: EndpointDragEnd,
            ev: ReactPointerEvent<SVGGElement>
          ) => {
            if (ev.button !== 0) return;
            ev.stopPropagation();
            ev.preventDefault();
            dragRef.current = null;
            const fixedUuid = end === "from" ? edge.to_node_uuid : edge.from_node_uuid;
            const currentUuid = end === "from" ? edge.from_node_uuid : edge.to_node_uuid;
            const fixed = byUuid.get(fixedUuid);
            if (!fixed) return;
            endpointDragRef.current = {
              edgeUuid: edge.uuid,
              end,
              pointerId: ev.pointerId,
              moved: false,
              fixedNodeUuid: fixedUuid,
              currentNodeUuid: currentUuid,
            };
            const snap: EndpointSnapPreview = {
              kind: "node",
              uuid: currentUuid,
              x: end === "from" ? fromN.x : toN.x,
              y: end === "from" ? fromN.y : toN.y,
            };
            endpointSnapRef.current = snap;
            setEndpointDragPreview({
              edgeUuid: edge.uuid,
              end,
              snap,
              fixedCm: { x: fixed.x, y: fixed.y },
            });
            try {
              (ev.currentTarget as SVGGElement).setPointerCapture(ev.pointerId);
            } catch {
              /* ignore */
            }
          };

          const moveEndpointDrag = (ev: ReactPointerEvent<SVGGElement>) => {
            const drag = endpointDragRef.current;
            if (!drag || drag.edgeUuid !== edge.uuid) return;
            ev.stopPropagation();
            const svg = resolveSvg(ev.currentTarget);
            if (!svg) return;
            if (!drag.moved) {
              drag.moved = true;
            }
            const raw = clientToCm(svg, ev.clientX, ev.clientY, scale);
            const snap = resolveEndpointRewireSnap(nodes, raw, {
              excludeNodeUuid: drag.fixedNodeUuid,
              gridSnap: snapRoutingCm,
            });
            endpointSnapRef.current = snap;
            const fixed = byUuid.get(drag.fixedNodeUuid);
            setEndpointDragPreview({
              edgeUuid: drag.edgeUuid,
              end: drag.end,
              snap,
              fixedCm: fixed ? { x: fixed.x, y: fixed.y } : { x: 0, y: 0 },
            });
          };

          const endEndpointDrag = (ev: ReactPointerEvent<SVGGElement>) => {
            const drag = endpointDragRef.current;
            if (!drag || drag.edgeUuid !== edge.uuid) return;
            ev.stopPropagation();
            try {
              (ev.currentTarget as SVGGElement).releasePointerCapture(ev.pointerId);
            } catch {
              /* ignore */
            }
            const moved = drag.moved;
            const snap = endpointSnapRef.current;
            endpointDragRef.current = null;
            endpointSnapRef.current = null;
            setEndpointDragPreview(null);
            if (!moved || !snap) return;
            const target = endpointSnapToDropTarget(snap);
            if (target.kind === "node" && target.uuid === drag.currentNodeUuid) return;
            onEndpointRewireDrop?.({
              edgeUuid: drag.edgeUuid,
              end: drag.end,
              target,
            });
          };

          const renderHandle = (end: EndpointDragEnd, n: RoutingNode) => {
            const dragging =
              endpointDragPreview?.edgeUuid === edge.uuid && endpointDragPreview.end === end;
            const cx = dragging ? endpointDragPreview.snap.x * scale : n.x * scale;
            const cy = dragging ? endpointDragPreview.snap.y * scale : n.y * scale;
            return (
              <g
                key={`ep-${edge.uuid}-${end}`}
                data-testid={`routing-endpoint-handle-${end}`}
                style={{ cursor: "grab", touchAction: "none" }}
                onPointerDown={(ev) => startEndpointDrag(end, ev)}
                onPointerMove={moveEndpointDrag}
                onPointerUp={endEndpointDrag}
                onPointerCancel={endEndpointDrag}
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={ENDPOINT_HANDLE_R_PX + 4}
                  fill="rgba(0,0,0,0.001)"
                  style={{ pointerEvents: "all" }}
                />
                <rect
                  x={cx - ENDPOINT_HANDLE_R_PX}
                  y={cy - ENDPOINT_HANDLE_R_PX}
                  width={ENDPOINT_HANDLE_R_PX * 2}
                  height={ENDPOINT_HANDLE_R_PX * 2}
                  rx={2}
                  fill={dragging ? "#f59e0b" : "#fff"}
                  stroke="#f59e0b"
                  strokeWidth={2}
                  style={{ pointerEvents: "none" }}
                />
              </g>
            );
          };

          return (
            <g className="routing-endpoint-handles" style={{ pointerEvents: "all" }}>
              {endpointDragPreview?.edgeUuid === edge.uuid &&
                endpointDragPreview.snap.kind === "ghost" && (
                  <g style={{ pointerEvents: "none" }} data-testid="routing-endpoint-ghost">
                    <circle
                      cx={endpointDragPreview.snap.x * scale}
                      cy={endpointDragPreview.snap.y * scale}
                      r={10}
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      strokeDasharray="4 3"
                      opacity={0.95}
                    />
                    <circle
                      cx={endpointDragPreview.snap.x * scale}
                      cy={endpointDragPreview.snap.y * scale}
                      r={3.5}
                      fill="#f59e0b"
                      opacity={0.85}
                    />
                  </g>
                )}
              {endpointDragPreview?.edgeUuid === edge.uuid &&
                endpointDragPreview.snap.kind === "node" && (
                  <circle
                    data-testid="routing-endpoint-snap-node"
                    cx={endpointDragPreview.snap.x * scale}
                    cy={endpointDragPreview.snap.y * scale}
                    r={NODE_HIT_RADIUS_PX + 2}
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth={2.5}
                    opacity={0.95}
                    style={{ pointerEvents: "none" }}
                  />
                )}
              {renderHandle("from", fromN)}
              {renderHandle("to", toN)}
            </g>
          );
        })()}
    </g>
  );
}
