import React, { useMemo } from "react";
import type { RackState } from "../../../types/warehouse";
import { cellToPx } from "../renderUtils";
import { formatVolume, binVolumeDm3, binUsedVolumeDm3, getRackDisplayId, getRackLabelStyle, canShowRackLabel } from "../warehouseUtils";
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
  showRackLabels: boolean;
  hoveredRackId: number | string | null;
  setHoveredRackId: (id: number | string | null) => void;
  /** Racks to highlight (e.g. product locator). Values are String(rack.id ?? rack.rack_index). */
  highlightedRackIds?: Set<string>;
  /** Optional rack click handler (used for read-only map). */
  onRackClick?: (rackId: number | string) => void;
  /** Optional rack double click handler (used for read-only map). */
  onRackDoubleClick?: (rackId: number | string) => void;
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
  showRackLabels,
  hoveredRackId,
  setHoveredRackId,
  highlightedRackIds,
  onRackClick,
  onRackDoubleClick,
}: RackLayerProps) {
  const outsideSet = useMemo(() => (outsideRackIds != null && outsideRackIds.length > 0 ? new Set(outsideRackIds.map(String)) : null), [outsideRackIds]);
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
        const isHighlighted = highlightedRackIds != null && highlightedRackIds.has(ridStr) && !isSelected && !isDragging;
        const displayColor = rackFillColor(r);
        const showLabel = showRackLabels && (r.show_label !== false);
        const label = getRackDisplayId(r);
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
        const rackStrokeColor = isCollision || isOutside ? "#ef4444" : isSelected ? "#3b82f6" : colors.rackBorder;
        const rackStrokeWidth = isOutside ? 2 : 1;
        const rackBgHex = isCollision ? "#ef4444" : isSelected ? "#0ea5e9" : displayColor;
        const labelFill = labelColorForBackground(rackBgHex);
        const outlineOffset = 1;
        return (
          <g
            key={rid}
            style={isDragging ? { pointerEvents: "none" } : undefined}
            onMouseEnter={() => setHoveredRackId(rid)}
            onMouseLeave={() => setHoveredRackId(null)}
            onClick={onRackClick ? (e) => { e.stopPropagation(); onRackClick(rid); } : undefined}
            onDoubleClick={onRackDoubleClick ? (e) => { e.preventDefault(); e.stopPropagation(); onRackDoubleClick(rid); } : undefined}
          >
            {isHighlighted && (
              <rect
                x={rectX - outlineOffset - 2}
                y={rectY - outlineOffset - 2}
                width={rectW + (outlineOffset + 2) * 2}
                height={rectH + (outlineOffset + 2) * 2}
                fill="none"
                stroke="rgba(168,85,247,0.9)"
                strokeWidth={3}
                rx={RACK_RADIUS_PX + outlineOffset + 2}
                pointerEvents="none"
              />
            )}
            {isHovered && (
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
            <rect
              x={rectX}
              y={rectY}
              width={rectW}
              height={rectH}
              fill={isCollision ? "#ef4444" : isSelected ? "#0ea5e9" : displayColor}
              stroke={rackStrokeColor}
              strokeWidth={rackStrokeWidth}
              rx={RACK_RADIUS_PX}
              fillOpacity={isDragging ? 0.9 : 1}
              strokeDasharray={isDragging ? "4 2" : undefined}
              {...(tooltip ? { "aria-label": tooltip } : {})}
            />
            {showLabelHere && (
              <g clipPath={`url(#${layoutClipId})`}>
                <defs>
                  <clipPath id={layoutClipId}>
                    <rect x={clipX} y={clipY} width={clipW} height={clipH} />
                  </clipPath>
                </defs>
                <text
                  x={cx}
                  y={cy}
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
