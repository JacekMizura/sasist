import { useCallback, useMemo, useId } from "react";
import type { BinState, LayoutState, RackState } from "../../../types/warehouse";
import { cellToPx } from "../renderUtils";
import { isRackPickHorizontal } from "../rackAccessPoint";
import {
  activeBinsForRack,
  formatVolume,
  binVolumeDm3,
  binUsedVolumeDm3,
  getRackDisplayId,
  getRackLabelStyle,
  canShowRackLabel,
  getLevelConfig,
  normalizeRowPrefixLetters,
  rackMatchesSlotRackId,
} from "../warehouseUtils";
import { RACK_LABEL_MEDIUM_STRIDE, type RackLabelLodLevel } from "../../../utils/rackLabelLod";
import { clampRackRectLayout } from "../../../utils/rackMapVisual";
import { colors, radius } from "../../../layout/designTokens";

const RACK_RADIUS_PX = parseFloat(radius.small) || 6;
const DEFAULT_RACK_FILL = "#3b82f6";

/** Below this canvas zoom, hide rack text/badges (optional clutter reduction). */
const LABEL_ZOOM_MIN_VISIBLE = 0.4;
const ZOOM_EPS = 0.05;

/** Counteract parent `scale(zoom)` so label screen size stays stable. Pivot = label center in layout px. */
function inverseZoomTransform(cx: number, cy: number, zoom: number): string {
  const z = Math.max(zoom, ZOOM_EPS);
  return `translate(${cx}, ${cy}) scale(${1 / z}) translate(${-cx}, ${-cy})`;
}

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
  cellPx: number,
  /** When set, use clamped rack rect in layout px (matches main rack shape). */
  layoutRect?: { rectX: number; rectY: number; rectW: number; rectH: number }
): { x: number; y: number; width: number; height: number } | null {
  const lc = getLevelConfig(rack);
  const L = lc.length;
  if (L === 0) return null;
  const lev = bin.level_index;
  const seg = bin.segment_index;
  if (lev < 0 || lev >= L) return null;
  const S = Math.max(1, lc[lev]?.locations ?? 1);
  if (seg < 0 || seg >= S) return null;

  const rectX = layoutRect?.rectX ?? cellToPx(drawAt.x, cellPx) + 1;
  const rectY = layoutRect?.rectY ?? cellToPx(drawAt.y, cellPx) + 1;
  const rectW = layoutRect?.rectW ?? cellToPx(rack.width, cellPx) - 2;
  const rectH = layoutRect?.rectH ?? cellToPx(rack.height, cellPx) - 2;

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
  /** Stronger highlight for one bin (e.g. map opened from a location row). */
  focusedBinUUID?: string | null;
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
  /** `rack_direction` on the row container affects rack IDs on the map (no geometry change). */
  layout?: LayoutState | null;
  /** CSS zoom on the warehouse map canvas; keeps labels readable via inverse scale. */
  zoom?: number;
  /** PDF/export: uniform neutral fill — no template color or occupancy styling on rack body. */
  neutralRackStyle?: boolean;
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
  focusedBinUUID = null,
  hoveredLocationUUID = null,
  onRackClick,
  onRackClickPassthrough,
  onRackDoubleClick,
  routeStepBadges,
  routeStops = null,
  isRoutePlanningMode = false,
  layout = null,
  zoom: zoomProp = 1,
  neutralRackStyle = false,
}: RackLayerProps) {
  const mapZoom = zoomProp;
  const labelsReadable = mapZoom >= LABEL_ZOOM_MIN_VISIBLE;
  const filterUid = useId().replace(/:/g, "");
  const filterSurface = `wh-rack-surf-${filterUid}`;
  const filterHover = `wh-rack-hover-${filterUid}`;

  /** Stable map: full label detail, no zoom-based LOD. */
  const lodLevel: RackLabelLodLevel = "high";
  const labelOpacity = 1;
  const visualLod = "full" as const;

  const rackDrawAt = useCallback(
    (r: RackState): { x: number; y: number } => {
      const rid = r.id ?? r.rack_index;
      const isDragging = draggingRackId != null && selectedRackIds.includes(rid);
      return (
        rackDragPreviewPositions?.[String(rid)] ??
        (isDragging && rackDragPreviewPosition ? rackDragPreviewPosition : { x: r.x, y: r.y })
      );
    },
    [draggingRackId, selectedRackIds, rackDragPreviewPositions, rackDragPreviewPosition]
  );

  /** Medium LOD: one label every RACK_LABEL_MEDIUM_STRIDE racks per row prefix (Y then X). */
  const mediumLabelRackIdSet = useMemo(() => {
    if (lodLevel !== "medium") return null;
    const byPrefix = new Map<string, RackState[]>();
    for (const r of racks) {
      const p = normalizeRowPrefixLetters(r.rowPrefix ?? "A");
      if (!byPrefix.has(p)) byPrefix.set(p, []);
      byPrefix.get(p)!.push(r);
    }
    const set = new Set<string>();
    for (const list of byPrefix.values()) {
      list.sort((a, b) => a.y - b.y || a.x - b.x);
      list.forEach((r, i) => {
        if (i % RACK_LABEL_MEDIUM_STRIDE === 0) set.add(String(r.id ?? r.rack_index));
      });
    }
    return set;
  }, [racks, lodLevel]);

  /** Low LOD: one overview label per row prefix, centered on combined bounds (hidden at line/simple visual LOD). */
  const rowOverviewLabels = useMemo(() => {
    if (lodLevel !== "low" || !showLabels || visualLod !== "full") return [] as Array<{
      key: string;
      cx: number;
      cy: number;
      text: string;
      fontSize: number;
      clipId: string;
      clipX: number;
      clipY: number;
      clipW: number;
      clipH: number;
    }>;
    const byPrefix = new Map<string, RackState[]>();
    for (const r of racks) {
      const p = normalizeRowPrefixLetters(r.rowPrefix ?? "A");
      if (!byPrefix.has(p)) byPrefix.set(p, []);
      byPrefix.get(p)!.push(r);
    }
    const out: Array<{
      key: string;
      cx: number;
      cy: number;
      text: string;
      fontSize: number;
      clipId: string;
      clipX: number;
      clipY: number;
      clipW: number;
      clipH: number;
    }> = [];
    for (const [prefix, list] of byPrefix) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const r of list) {
        const drawAt = rackDrawAt(r);
        const { rectX, rectY, rectW, rectH } = clampRackRectLayout(drawAt, r, cellPx);
        minX = Math.min(minX, rectX);
        minY = Math.min(minY, rectY);
        maxX = Math.max(maxX, rectX + rectW);
        maxY = Math.max(maxY, rectY + rectH);
      }
      if (!Number.isFinite(minX)) continue;
      const bw = maxX - minX;
      const bh = maxY - minY;
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const fontSize = Math.max(11, Math.min(32, Math.min(bw, bh) * 0.32));
      const safeId = prefix.replace(/[^a-zA-Z0-9]/g, "_") || "row";
      out.push({
        key: prefix,
        cx,
        cy,
        text: prefix.toUpperCase(),
        fontSize,
        clipId: `lod-row-clip-${safeId}`,
        clipX: minX,
        clipY: minY,
        clipW: bw,
        clipH: bh,
      });
    }
    return out;
  }, [lodLevel, showLabels, visualLod, racks, cellPx, rackDrawAt]);

  const outsideSet = useMemo(() => (outsideRackIds != null && outsideRackIds.length > 0 ? new Set(outsideRackIds.map(String)) : null), [outsideRackIds]);
  const routeStopCellByRackId = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    if (!routeStops?.length) return m;
    for (const s of routeStops) m.set(String(s.rackId), s.position);
    return m;
  }, [routeStops]);
  const hasHighlightedRacks = highlightedRackIds != null && highlightedRackIds.size > 0;
  const binHighlightActive = highlightedBinUUIDs != null && highlightedBinUUIDs.size > 0;
  const focusedBinUuidNorm = (focusedBinUUID ?? "").trim();
  const hoveredBinUuidNorm = (hoveredLocationUUID ?? "").trim();
  return (
    <>
      <defs>
        <filter id={filterSurface} x="-8%" y="-8%" width="116%" height="120%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.25" floodColor="#0f172a" floodOpacity="0.1" />
        </filter>
        <filter id={filterHover} x="-12%" y="-12%" width="124%" height="124%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#2563eb" floodOpacity="0.14" />
        </filter>
      </defs>
      {racks.map((r) => {
        const rid = r.id ?? r.rack_index;
        const ridStr = String(rid);
        const reactKey = String(r.uuid ?? r.id ?? r.rack_index);
        const isDragging = draggingRackId != null && selectedRackIds.some((id) => rackMatchesSlotRackId(r, id));
        const drawAt = rackDrawAt(r);
        const isCollision = (collisionRackIds != null && collisionRackIds.includes(rid)) || rid === collisionRackId;
        const isOutside = outsideSet != null && outsideSet.has(String(rid));
        const isSelected = selectedRackIds.some((id) => rackMatchesSlotRackId(r, id));
        const rackHasHighlightedBin =
          binHighlightActive &&
          activeBinsForRack(r).some((b) => {
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
        const displayColor = neutralRackStyle ? "#e2e8f0" : rackFillColor(r);
        const showLabel = showLabels && (r.show_label !== false);
        const label = getRackDisplayId(r, layout ?? undefined);
        const used = r.used_dm3 ?? activeBinsForRack(r).reduce((s, b) => s + binUsedVolumeDm3(b), 0);
        const total = r.total_capacity_dm3 ?? activeBinsForRack(r).reduce((s, b) => s + binVolumeDm3(b, r), 0);
        const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
        const tooltip = `${label} · Zajętość: ${formatVolume(used)} / ${formatVolume(total)} dm³ (${pct.toFixed(0)}%)`;
        const layoutRect = clampRackRectLayout(drawAt, r, cellPx);
        const { rectX, rectY, rectW, rectH, cx, cy } = layoutRect;
        const showLabelHere =
          labelsReadable &&
          visualLod === "full" &&
          showLabel &&
          canShowRackLabel(rectW, rectH) &&
          (lodLevel === "high" ||
            (lodLevel === "medium" && mediumLabelRackIdSet != null && mediumLabelRackIdSet.has(ridStr)));
        const { displayText, fontSize: fontSizeBase } = getRackLabelStyle(rectW, rectH, label, false);
        const labelFontSize = fontSizeBase + 1;
        const clipInset = 0.05;
        const clipW = rectW * (1 - 2 * clipInset);
        const clipH = rectH * (1 - 2 * clipInset);
        const clipX = rectX + rectW * clipInset;
        const clipY = rectY + rectH * clipInset;
        const layoutClipId = `layout-rack-clip-${rid}`;
        const isHovered = hoveredRackId != null && rackMatchesSlotRackId(r, hoveredRackId) && !isDragging;
        const rackStrokeColor = neutralRackStyle
          ? "#64748b"
          : isCollision || isOutside
            ? "#ef4444"
            : isSelected
              ? "#1d4ed8"
              : isHighlighted
                ? "#2563eb"
                : colors.rackBorder;
        const rackStrokeWidth = neutralRackStyle ? 1 : isOutside ? 2 : isSelected ? 3 : isHighlighted ? 2.5 : 1;
        const rackBgHex = neutralRackStyle
          ? "#e2e8f0"
          : isCollision
            ? "#ef4444"
            : isSelected
              ? "#0ea5e9"
              : isHighlighted
                ? "#60a5fa"
                : displayColor;
        const labelFill = labelColorForBackground(rackBgHex);
        const outlineOffset = 1;
        // In Magazyn we want product highlighting to guide the eye without making the rest of the map hard to read.
        // Softer dimming keeps navigation clean.
        const groupOpacity = shouldDim ? 0.55 : 1;
        const quantity = rackQuantities?.get(ridStr) ?? 0;
        const showQuantityBadge = labelsReadable && visualLod === "full" && hasQuantityHighlight && quantity > 0;
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
        const showTypeBadge = labelsReadable && visualLod === "full" && typeBadgeText != null && typeBadgeW > 0;
        return (
          <g
            key={reactKey}
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
                    transition: "opacity 150ms ease",
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
            {visualLod === "line" ? (
              <>
                <rect
                  x={rectX}
                  y={rectY}
                  width={rectW}
                  height={rectH}
                  fill="transparent"
                  pointerEvents="auto"
                  {...(tooltip ? { "aria-label": tooltip } : {})}
                />
                <line
                  x1={rectW >= rectH ? rectX : rectX + rectW / 2}
                  y1={rectW >= rectH ? rectY + rectH / 2 : rectY}
                  x2={rectW >= rectH ? rectX + rectW : rectX + rectW / 2}
                  y2={rectW >= rectH ? rectY + rectH / 2 : rectY + rectH}
                  stroke={isCollision ? "#ef4444" : isSelected ? "#0ea5e9" : isHighlighted ? "#60a5fa" : displayColor}
                  strokeWidth={Math.max(1.5, rackStrokeWidth + 0.5)}
                  strokeLinecap="round"
                  pointerEvents="none"
                />
              </>
            ) : (
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
                filter={
                  neutralRackStyle
                    ? undefined
                    : isHovered
                      ? `url(#${filterHover})`
                      : `url(#${filterSurface})`
                }
                style={{ transition: "fill 150ms ease, stroke 150ms ease, stroke-width 150ms ease, filter 150ms ease" }}
                {...(tooltip ? { "aria-label": tooltip } : {})}
              />
            )}
            {visualLod === "full" &&
              binHighlightActive &&
              rackHasHighlightedBin &&
              activeBinsForRack(r).map((bin) => {
                const u = (bin.locationUUID ?? "").trim();
                if (!u) return null;
                const dims = binHighlightRectPx(r, bin, drawAt, cellPx, layoutRect);
                if (!dims) return null;
                const isBinH = highlightedBinUUIDs!.has(u);
                const isFocusedBin = focusedBinUuidNorm !== "" && u === focusedBinUuidNorm;
                const isPrimaryStyle = isFocusedBin || (focusedBinUuidNorm === "" && isBinH);
                return (
                  <rect
                    key={`${ridStr}-bin-${bin.level_index}-${bin.segment_index}`}
                    x={dims.x}
                    y={dims.y}
                    width={dims.width}
                    height={dims.height}
                    fill={
                      isBinH
                        ? isPrimaryStyle
                          ? isFocusedBin
                            ? "rgba(251,191,36,0.55)"
                            : "rgba(96,165,250,0.5)"
                          : "rgba(96,165,250,0.28)"
                        : "rgba(15,23,42,0.45)"
                    }
                    stroke={isBinH ? (isFocusedBin ? "#d97706" : isPrimaryStyle ? "#2563eb" : "#64748b") : "none"}
                    strokeWidth={isBinH ? (isFocusedBin ? 3 : isPrimaryStyle ? 2.5 : 1.5) : 0}
                    rx={3}
                    pointerEvents="none"
                  />
                );
              })}
            {visualLod === "full" &&
              hoveredBinUuidNorm !== "" &&
              activeBinsForRack(r).map((bin) => {
                const u = (bin.locationUUID ?? "").trim();
                if (u !== hoveredBinUuidNorm) return null;
                const dims = binHighlightRectPx(r, bin, drawAt, cellPx, layoutRect);
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
              <g
                pointerEvents="none"
                transform={inverseZoomTransform(badgeX + badgeW / 2, badgeY + badgeH / 2, mapZoom)}
              >
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
            {labelsReadable &&
              visualLod !== "line" &&
              (stepCurrent || stepNext) &&
              routeStepBadges != null && (
              <g pointerEvents="none">
                {stepCurrent && (
                  <g transform={inverseZoomTransform(stepBadgeCx, stepBadgeCy, mapZoom)}>
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
                  <g transform={inverseZoomTransform(stepBadgeCx, stepBadgeCy, mapZoom)}>
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
              <g
                pointerEvents="none"
                transform={inverseZoomTransform(typeBadgeX + typeBadgeW / 2, typeBadgeY + typeBadgeH / 2, mapZoom)}
              >
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
                <g
                  transform={inverseZoomTransform(
                    cx,
                    cy + (showTypeBadge ? 5 : 0),
                    mapZoom
                  )}
                >
                  <text
                    x={cx}
                    y={cy + (showTypeBadge ? 5 : 0)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={labelFill}
                    fontSize={labelFontSize}
                    fontWeight={600}
                    opacity={labelOpacity}
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {displayText}
                  </text>
                </g>
              </g>
            )}
          </g>
        );
      })}
      {lodLevel === "low" &&
        showLabels &&
        visualLod === "full" &&
        labelsReadable &&
        rowOverviewLabels.map((row) => (
          <g key={`lod-overview-${row.key}`} pointerEvents="none" style={{ userSelect: "none" }} clipPath={`url(#${row.clipId})`}>
            <defs>
              <clipPath id={row.clipId}>
                <rect x={row.clipX} y={row.clipY} width={row.clipW} height={row.clipH} />
              </clipPath>
            </defs>
            <g transform={inverseZoomTransform(row.cx, row.cy, mapZoom)}>
              <text
                x={row.cx}
                y={row.cy}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#0f172a"
                stroke="#ffffff"
                strokeWidth={2}
                style={{ paintOrder: "stroke", pointerEvents: "none", userSelect: "none" }}
                fontSize={row.fontSize}
                fontWeight={700}
                opacity={labelOpacity}
              >
                {row.text}
              </text>
            </g>
          </g>
        ))}
    </>
  );
}
