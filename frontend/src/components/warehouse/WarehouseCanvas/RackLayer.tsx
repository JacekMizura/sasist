import React, { useMemo } from "react";
import type { BinState, LayoutState, RackState } from "../../../types/warehouse";
import { cellToPx } from "../renderUtils";
import { isRackPickHorizontal } from "../rackAccessPoint";
import {
  formatVolume,
  binVolumeDm3,
  binUsedVolumeDm3,
  getRackDisplayId,
  getRackLabelStyle,
  canShowRackLabel,
  getLevelConfig,
} from "../warehouseUtils";
import { colors, radius } from "../../../layout/designTokens";

const RACK_RADIUS_PX = parseFloat(radius.small) || 6;
const DEFAULT_RACK_FILL = "#3b82f6";

function rackFillColor(rack: RackState): string {
  const c = rack.color;
  if (typeof c !== "string" || c.trim() === "") return DEFAULT_RACK_FILL;
  return c.trim();
}

function hexLuminance(hex: string): number {
  const n = hex.replace("#", "");
  if (n.length !== 6) return 0.5;
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function labelColorForBackground(hex: string): string {
  return hexLuminance(hex) > 0.6 ? "#111827" : "#ffffff";
}

/** Top-down map: levels as horizontal strips (bottom = level 0), segments along rack width. */
function binHighlightRectPx(
  rack: RackState,
  bin: BinState,
  drawAt: { x: number; y: number },
  cellPx: number
): { x: number; y: number; width: number; height: number } | null {
  const lc = getLevelConfig(rack);
  const L = lc.length;
  if (L === 0) return null;
  const lev = bin.level_index;
  const seg = bin.segment_index;
  if (lev < 0 || lev >= L) return null;
  const S = Math.max(1, lc[lev]?.locations ?? 1);
  if (seg < 0 || seg >= S) return null;

  const rectX = cellToPx(drawAt.x, cellPx) + 1;
  const rectY = cellToPx(drawAt.y, cellPx) + 1;
  const rectW = cellToPx(rack.width, cellPx) - 2;
  const rectH = cellToPx(rack.height, cellPx) - 2;

  const rowH = rectH / L;
  const colW = rectW / S;
  const y = rectY + rectH - (lev + 1) * rowH;
  const x = rectX + seg * colW;
  const inset = 1.5;
  return { x: x + inset, y: y + inset, width: colW - inset * 2, height: rowH - inset * 2 };
}

export type RackLayerProps = {
  racks: RackState[];
  cellPx: number;
  draggingRackId: number | string | null;
  selectedRackIds: Array<number | string>;
  rackDragPreviewPositions: Record<string, { x: number; y: number }> | null;
  rackDragPreviewPosition: { x: number; y: number } | null;
  collisionRackId: number | string | null;
  collisionRackIds: Array<number | string> | null;
  /** Racks outside building boundary; drawn with red stroke. */
  outsideRackIds?: Array<number | string>;
  showLabels: boolean;
  hoveredRackId: number | string | null;
  setHoveredRackId: (id: number | string | null) => void;
  /** Racks to highlight (e.g. product locator). Values are String(rack.id ?? rack.rack_index). */
  highlightedRackIds?: Set<string>;
  /** Optional quantity badges keyed by rack id for highlighted product location racks. */
  rackQuantities?: Map<string, number>;
  /** When set (e.g. Magazyn sidebar product pick), highlight matching bin cells; others in that rack dimmed. */
  highlightedBinUUIDs?: Set<string>;
  /** Sidebar location row hover: emphasize this bin only (temporary; UUID match). */
  hoveredLocationUUID?: string | null;
  /** Optional rack click handler (used for read-only map). */
  onRackClick?: (rackId: number | string) => void;
  /** Optional rack click handler that does NOT stop propagation (keeps canvas click behavior). */
  onRackClickPassthrough?: (rackId: number | string) => void;
  /** Optional rack double click handler (used for read-only map). */
  onRackDoubleClick?: (rackId: number | string) => void;
  /** Step navigation: badges only on current (large) and next (small) rack; omit for no step UI. */
  routeStepBadges?: {
    currentRackId: string;
    nextRackId: string | null;
    currentOrder: number;
    nextOrder: number | null;
  } | null;
  /** When set with route mode, step badges anchor at aisle pick cells (not rack center). */
  routeStops?: { rackId: string; position: { x: number; y: number } }[] | null;
  /** Layout designer: route planning mode — stronger rack hover + pointer. */
  isRoutePlanningMode?: boolean;
  /** Row direction affects rack labels only (no geometry change). */
  layout?: LayoutState | null;
};

export function RackLayer({
  racks,
  cellPx,
  draggingRackId,
  selectedRackIds,
  rackDragPreviewPositions,
  rackDragPreviewPosition,
  collisionRackId,
  collisionRackIds,
  outsideRackIds,
  showLabels,
  hoveredRackId,
  setHoveredRackId,
  highlightedRackIds,
  rackQuantities,
  highlightedBinUUIDs,
  hoveredLocationUUID = null,
  onRackClick,
  onRackClickPassthrough,
  onRackDoubleClick,
  routeStepBadges,
  routeStops = null,
  isRoutePlanningMode = false,
  layout = null,
}: RackLayerProps) {
  const outsideSet = useMemo(() => (outsideRackIds != null && outsideRackIds.length > 0 ? new Set(outsideRackIds.map(String)) : null), [outsideRackIds]);
  const routeStopCellByRackId = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    if (!routeStops?.length) return m;
    for (const s of routeStops) m.set(String(s.rackId), s.position);
    return m;
  }, [routeStops]);
  const hasHighlightedRacks = highlightedRackIds != null && highlightedRackIds.size > 0;
  const binHighlightActive = highlightedBinUUIDs != null && highlightedBinUUIDs.size > 0;
  const hoveredBinUuidNorm = (hoveredLocationUUID ?? "").trim();
  return (
    <>
      {racks.map((r) => {
        const rid = r.id ?? r.rack_index;
        const ridStr = String(rid);
        const isDragging = draggingRackId != null && selectedRackIds.includes(rid);
        const drawAt = rackDragPreviewPositions?.[String(rid)] ?? (isDragging && rackDragPreviewPosition ? rackDragPreviewPosition : { x: r.x, y: r.y });
        const isCollision = (collisionRackIds != null && collisionRackIds.includes(rid)) || rid === collisionRackId;
        const isOutside = outsideSet != null && outsideSet.has(String(rid));
        const isSelected = selectedRackIds.includes(rid);
        const rackHasHighlightedBin =
          binHighlightActive &&
          (r.bins ?? []).some((b) => {
            const u = (b.locationUUID ?? "").trim();
            return u !== "" && highlightedBinUUIDs!.has(u);
          });
        const isHighlighted =
          highlightedRackIds != null &&
          highlightedRackIds.has(ridStr) &&
          !isSelected &&
          !isDragging &&
          !(binHighlightActive && rackHasHighlightedBin);
        const hasQuantityHighlight = highlightedRackIds != null && highlightedRackIds.has(ridStr);
        const shouldDim = binHighlightActive
          ? !rackHasHighlightedBin && !isSelected && !isDragging
          : hasHighlightedRacks && !isHighlighted && !isSelected && !isDragging;
        const displayColor = rackFillColor(r);
        const showLabel = showLabels && (r.show_label !== false);
        const label = getRackDisplayId(r, layout ?? undefined);
        const used = r.used_dm3 ?? r.bins?.reduce((s, b) => s + binUsedVolumeDm3(b), 0) ?? 0;
        const total = r.total_capacity_dm3 ?? r.bins?.reduce((s, b) => s + binVolumeDm3(b, r), 0) ?? 0;
        const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
        const tooltip = `${label} · Zajętość: ${formatVolume(used)} / ${formatVolume(total)} dm³ (${pct.toFixed(0)}%)`;
        const rectX = cellToPx(drawAt.x, cellPx) + 1;
        const rectY = cellToPx(drawAt.y, cellPx) + 1;
        const rectW = cellToPx(r.width, cellPx) - 2;
        const rectH = cellToPx(r.height, cellPx) - 2;
        const cx = cellToPx(drawAt.x, cellPx) + cellToPx(r.width, cellPx) / 2;
        const cy = cellToPx(drawAt.y, cellPx) + cellToPx(r.height, cellPx) / 2;
        const showLabelHere = showLabel && canShowRackLabel(rectW, rectH);
        const { displayText, fontSize: fontSizeBase } = getRackLabelStyle(rectW, rectH, label, false);
        const labelFontSize = fontSizeBase + 1;
        const clipInset = 0.05;
        const clipW = rectW * (1 - 2 * clipInset);
        const clipH = rectH * (1 - 2 * clipInset);
        const clipX = rectX + rectW * clipInset;
        const clipY = rectY + rectH * clipInset;
        const layoutClipId = `layout-rack-clip-${rid}`;
        const isHovered = hoveredRackId === rid && !isDragging;
        const rackStrokeColor = isCollision || isOutside ? "#ef4444" : isSelected ? "#1d4ed8" : isHighlighted ? "#2563eb" : colors.rackBorder;
        const rackStrokeWidth = isOutside ? 2 : isSelected ? 3 : isHighlighted ? 2.5 : 1;
        const rackBgHex = isCollision ? "#ef4444" : isSelected ? "#0ea5e9" : isHighlighted ? "#60a5fa" : displayColor;
        const labelFill = labelColorForBackground(rackBgHex);
        const outlineOffset = 1;
        // In Magazyn we want product highlighting to guide the eye without making the rest of the map hard to read.
        // Softer dimming keeps navigation clean.
        const groupOpacity = shouldDim ? 0.55 : 1;
        const quantity = rackQuantities?.get(ridStr) ?? 0;
        const showQuantityBadge = hasQuantityHighlight && quantity > 0;
        const stepCurrent = routeStepBadges?.currentRackId === ridStr;
        const stepNext = routeStepBadges?.nextRackId != null && routeStepBadges.nextRackId === ridStr;
        const pickCell = routeStopCellByRackId.get(ridStr);
        /** Nudge badge slightly into the aisle so it does not sit on the path polyline. */
        const ROUTE_BADGE_NUDGE_PX = 6;
        const pickH = isRackPickHorizontal(r);
        const stepBadgeCx =
          pickCell != null
            ? cellToPx(pickCell.x, cellPx) + cellPx / 2 + (pickH ? 0 : -ROUTE_BADGE_NUDGE_PX)
            : rectX + rectW - 12;
        const stepBadgeCy =
          pickCell != null
            ? cellToPx(pickCell.y, cellPx) + cellPx / 2 + (pickH ? ROUTE_BADGE_NUDGE_PX : 0)
            : rectY + 14;
        const quantityLabel = Number.isInteger(quantity) ? String(quantity) : quantity.toLocaleString("pl-PL", { maximumFractionDigits: 2 });
        const badgeMinSize = 18;
        const badgePaddingX = 6;
        const approxCharWidth = 7;
        const badgeW = Math.max(badgeMinSize, quantityLabel.length * approxCharWidth + badgePaddingX * 2);
        const badgeH = 18;
        const badgeX = rectX + rectW - badgeW + 6;
        const badgeY = rectY - 8;
        // Rack type badge: show only when rack is actually a different type from the default.
        // Keep the map low-noise by highlighting only "Sklep" racks.
        const typeBadgeText: string | null = r.rack_type === "store" ? "Sklep" : null;
        const typeBadgeH = 16;
        const typeBadgePadX = 6;
        const typeBadgeApproxCharW = 6.5;
        const typeBadgeW = typeBadgeText ? Math.max(28, typeBadgeText.length * typeBadgeApproxCharW + typeBadgePadX * 2) : 0;
        const typeBadgeX = rectX + 6;
        const typeBadgeY = rectY + 6;
        const typeBadgeBg = "#f59e0b";
        const showTypeBadge = typeBadgeText != null && typeBadgeW > 0;
        return (
          <g
            key={rid}
            data-rack-interactive=""
            onMouseDown={
              onRackClick || onRackDoubleClick
                ? (ev) => {
                    ev.stopPropagation();
                  }
                : undefined
            }
            style={
              isDragging
                ? { pointerEvents: "none" }
                : {
                    pointerEvents: "auto",
                    ...(isRoutePlanningMode ? { cursor: "pointer" } : {}),
                  }
            }
            opacity={groupOpacity}
            onMouseEnter={() => setHoveredRackId(rid)}
            onMouseLeave={() => setHoveredRackId(null)}
            onClick={onRackClick ? (e) => { e.stopPropagation(); onRackClick(rid); } : undefined}
            onClickCapture={onRackClickPassthrough ? () => { onRackClickPassthrough(rid); } : undefined}
            onDoubleClick={onRackDoubleClick ? (e) => { e.preventDefault(); e.stopPropagation(); onRackDoubleClick(rid); } : undefined}
          >
            {isHighlighted && (
              <rect
                x={rectX - outlineOffset - 4}
                y={rectY - outlineOffset - 4}
                width={rectW + (outlineOffset + 4) * 2}
                height={rectH + (outlineOffset + 4) * 2}
                fill="#60a5fa"
                fillOpacity={0.16}
                stroke="none"
                rx={RACK_RADIUS_PX + outlineOffset + 4}
                pointerEvents="none"
              />
            )}
            {isHighlighted && (
              <rect
                x={rectX - outlineOffset - 2}
                y={rectY - outlineOffset - 2}
                width={rectW + (outlineOffset + 2) * 2}
                height={rectH + (outlineOffset + 2) * 2}
                fill="none"
                stroke="#3b82f6"
                strokeWidth={4}
                rx={RACK_RADIUS_PX + outlineOffset + 2}
                pointerEvents="none"
              />
            )}
            {isHovered && !isRoutePlanningMode && (
              <rect
                x={rectX - outlineOffset}
                y={rectY - outlineOffset}
                width={rectW + outlineOffset * 2}
                height={rectH + outlineOffset * 2}
                fill="none"
                stroke="rgba(59,130,246,0.4)"
                strokeWidth={2}
                rx={RACK_RADIUS_PX + outlineOffset}
                pointerEvents="none"
              />
            )}
            {isRoutePlanningMode && isHovered && (
              <rect
                x={rectX - outlineOffset - 4}
                y={rectY - outlineOffset - 4}
                width={rectW + (outlineOffset + 4) * 2}
                height={rectH + (outlineOffset + 4) * 2}
                fill="rgba(37,99,235,0.14)"
                stroke="#2563eb"
                strokeWidth={2.5}
                rx={RACK_RADIUS_PX + outlineOffset + 4}
                pointerEvents="none"
              />
            )}
            <rect
              x={rectX}
              y={rectY}
              width={rectW}
              height={rectH}
              fill={isCollision ? "#ef4444" : isSelected ? "#0ea5e9" : isHighlighted ? "#60a5fa" : displayColor}
              stroke={rackStrokeColor}
              strokeWidth={rackStrokeWidth}
              rx={RACK_RADIUS_PX}
              fillOpacity={isDragging ? 0.9 : shouldDim ? 0.55 : 1}
              strokeDasharray={isDragging ? "4 2" : undefined}
              pointerEvents="auto"
              {...(tooltip ? { "aria-label": tooltip } : {})}
            />
            {binHighlightActive &&
              rackHasHighlightedBin &&
              (r.bins ?? []).map((bin) => {
                const u = (bin.locationUUID ?? "").trim();
                if (!u) return null;
                const dims = binHighlightRectPx(r, bin, drawAt, cellPx);
                if (!dims) return null;
                const isBinH = highlightedBinUUIDs!.has(u);
                return (
                  <rect
                    key={`${ridStr}-bin-${bin.level_index}-${bin.segment_index}`}
                    x={dims.x}
                    y={dims.y}
                    width={dims.width}
                    height={dims.height}
                    fill={isBinH ? "rgba(96,165,250,0.5)" : "rgba(15,23,42,0.45)"}
                    stroke={isBinH ? "#2563eb" : "none"}
                    strokeWidth={isBinH ? 2.5 : 0}
                    rx={3}
                    pointerEvents="none"
                  />
                );
              })}
            {hoveredBinUuidNorm !== "" &&
              (r.bins ?? []).map((bin) => {
                const u = (bin.locationUUID ?? "").trim();
                if (u !== hoveredBinUuidNorm) return null;
                const dims = binHighlightRectPx(r, bin, drawAt, cellPx);
                if (!dims) return null;
                return (
                  <rect
                    key={`sidebar-loc-hover-${ridStr}-${bin.level_index}-${bin.segment_index}`}
                    x={dims.x}
                    y={dims.y}
                    width={dims.width}
                    height={dims.height}
                    fill="rgba(34,211,238,0.3)"
                    stroke="#22d3ee"
                    strokeWidth={3}
                    rx={4}
                    pointerEvents="none"
                    style={{ filter: "drop-shadow(0 0 5px rgba(34,211,238,0.9))" }}
                  />
                );
              })}
            {showQuantityBadge && (
              <g pointerEvents="none">
                <rect
                  x={badgeX}
                  y={badgeY}
                  width={badgeW}
                  height={badgeH}
                  rx={badgeH / 2}
                  fill={isSelected ? "#0f766e" : "#2563eb"}
                  stroke="#ffffff"
                  strokeWidth={1.5}
                />
                <text
                  x={badgeX + badgeW / 2}
                  y={badgeY + badgeH / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#ffffff"
                  fontSize={11}
                  fontWeight={700}
                  style={{ userSelect: "none" }}
                >
                  {quantityLabel}
                </text>
              </g>
            )}
            {(stepCurrent || stepNext) && routeStepBadges != null && (
              <g pointerEvents="none">
                {stepCurrent && (
                  <g>
                    <circle
                      cx={stepBadgeCx}
                      cy={stepBadgeCy}
                      r={Math.max(12, Math.min(16, cellPx * 0.28))}
                      fill="#1d4ed8"
                      stroke="#ffffff"
                      strokeWidth={2}
                    />
                    <text
                      x={stepBadgeCx}
                      y={stepBadgeCy}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#ffffff"
                      fontSize={Math.max(11, Math.min(14, cellPx * 0.32))}
                      fontWeight={800}
                      style={{ userSelect: "none" }}
                    >
                      {routeStepBadges.currentOrder}
                    </text>
                  </g>
                )}
                {stepNext && routeStepBadges.nextOrder != null && (
                  <g>
                    <circle
                      cx={stepBadgeCx}
                      cy={stepBadgeCy}
                      r={Math.max(8, Math.min(11, cellPx * 0.2))}
                      fill="#3b82f6"
                      stroke="#ffffff"
                      strokeWidth={1.5}
                      opacity={0.95}
                    />
                    <text
                      x={stepBadgeCx}
                      y={stepBadgeCy}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#ffffff"
                      fontSize={Math.max(8, Math.min(11, cellPx * 0.22))}
                      fontWeight={700}
                      style={{ userSelect: "none" }}
                    >
                      {routeStepBadges.nextOrder}
                    </text>
                  </g>
                )}
              </g>
            )}
            {/* Optional small rack-type marker (no interaction). */}
            {showTypeBadge && (
              <g pointerEvents="none">
                <rect
                  x={typeBadgeX}
                  y={typeBadgeY}
                  width={typeBadgeW}
                  height={typeBadgeH}
                  rx={typeBadgeH / 2}
                  fill={typeBadgeBg}
                  stroke="#ffffff"
                  strokeWidth={1.3}
                />
                <text
                  x={typeBadgeX + typeBadgeW / 2}
                  y={typeBadgeY + typeBadgeH / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#ffffff"
                  fontSize={9.5}
                  fontWeight={800}
                  style={{ userSelect: "none" }}
                >
                  {typeBadgeText}
                </text>
              </g>
            )}
            {showLabelHere && (
              <g clipPath={`url(#${layoutClipId})`}>
                <defs>
                  <clipPath id={layoutClipId}>
                    <rect x={clipX} y={clipY} width={clipW} height={clipH} />
                  </clipPath>
                </defs>
                <text
                  x={cx}
                  y={cy + (showTypeBadge ? 5 : 0)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={labelFill}
                  fontSize={labelFontSize}
                  fontWeight={600}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {displayText}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </>
  );
}
