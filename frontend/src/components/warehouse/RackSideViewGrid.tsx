import { useRef, useState, useEffect, useMemo } from "react";
import type { RackState, BinState, WarehouseProduct, LayoutState } from "../../types/warehouse";
import {
  getLevelConfig,
  binUsedVolumeDm3,
  binVolumeDm3,
  isBinDirectionRtl,
  segmentIndexForVisualSlot,
  type PackingLayoutResult,
} from "./warehouseUtils";
import { getStorageTypeStyle, getStorageTypeLabel, normalizeStorageType } from "../../utils/storageTypes";
import { resolveWarehouseLocation } from "../../utils/resolvedWarehouseLocation";
import { StorageTypeIcon } from "../../utils/storageTypeIcons";

/** Blue – vertical rack columns (uprights) for non-top levels */
const UPRIGHT_BLUE = "#1e63a7";
/** Grey – top level only (no side posts in reality) */
const UPRIGHT_TOP_LEVEL_GREY = "#9ca3af";
/** Rack orange – horizontal beams (traverses), fixed 22px height for readability */
const BEAM_ORANGE = "#f97316";
/** Base beam (floor support) – neutral grey */
const BEAM_BASE_GREY = "#94a3b8";
const UPRIGHT_WIDTH = 8;
const BEAM_HEIGHT_VIEWBOX = 22;
const BIN_BG = "#f4f4f4";
const BIN_BORDER = "#ddd";

function getBinAt(rack: RackState, levelIndex: number, segmentIndex: number): BinState | undefined {
  return rack.bins.find((b) => b.level_index === levelIndex && b.segment_index === segmentIndex);
}

export type SelectedLocation = { level_index: number; segment_index: number } | null;

/**
 * Pallet-rack style side view: uprights | levels (beam + bin-row) | upright.
 * Beams are orange traverses between levels; location labels sit on the beam.
 * Bins are boxes between beams with occupancy bars. No data model changes.
 */
const DEFAULT_LEVEL_MAX_LOAD_KG = 500;

function levelLoadColor(loadKg: number, maxKg: number): string {
  if (maxKg <= 0) return "#94a3b8";
  const ratio = loadKg / maxKg;
  if (ratio < 0.6) return "#22c55e";   // green
  if (ratio <= 0.9) return "#f97316"; // orange
  return "#ef4444";                    // red
}

/** Key for binItemCounts / binUniqueProductCounts: `${level_index}-${segment_index}` */
export function RackSideViewGrid({
  rack,
  className = "",
  onBinClick,
  selectedLocation,
  binItemCounts,
  binUniqueProductCounts,
  binMaxCapacityPieces,
  binCapacityDetails,
  binPackingPreview,
  showPhysicalCapacity = false,
  levelLoadKg = {},
  levelMaxLoadKg,
  hoveredLocationUUID = null,
  showLabels = true,
  layout = null,
}: {
  rack: RackState;
  className?: string;
  onBinClick?: (level_index: number, segment_index: number) => void;
  selectedLocation?: SelectedLocation;
  binItemCounts?: Record<string, number>;
  binUniqueProductCounts?: Record<string, number>;
  /** Per-bin max physical capacity (pieces). Shown only when showPhysicalCapacity and slot has products. */
  binMaxCapacityPieces?: Record<string, number>;
  /** Per-bin list of { product, quantity, capacity } for tooltip (capacity per product). */
  binCapacityDetails?: Record<
    string,
    { product: WarehouseProduct; quantity: number; capacity: number }[]
  >;
  /** Packing layout preview for bins with exactly one product (for hover overlay). */
  binPackingPreview?: Record<
    string,
    PackingLayoutResult & {
      productName: string;
      productDisplayName: string;
      quantity: number;
      slotDims: { width_cm?: number; depth_cm?: number; height_cm?: number };
    }
  >;
  /** When true (e.g. Magazyn view), show "Fizyczna poj.: X szt." under slot percentage. */
  showPhysicalCapacity?: boolean;
  /** Per-level total load in kg (from products weight_kg × quantity). */
  levelLoadKg?: Record<number, number>;
  /** Max allowed load per level in kg (from template/rack). Default 500 when missing. */
  levelMaxLoadKg?: number;
  /** Magazyn sidebar: temporary highlight when hovering a location row (UUID match). */
  hoveredLocationUUID?: string | null;
  /** Bin/slot address badges on beams (A1, B2, …); same toggle as map „Pokaż etykiety”. */
  showLabels?: boolean;
  /** When set, beam/bin labels use `resolveWarehouseLocation` (`rack_direction` + `bin_direction`). */
  layout?: LayoutState | null;
}) {
  const hoveredUuidNorm = (hoveredLocationUUID ?? "").trim();
  const hasLevelMaxLoad = levelMaxLoadKg != null && levelMaxLoadKg > 0;
  const effectiveMaxKg = hasLevelMaxLoad ? levelMaxLoadKg! : DEFAULT_LEVEL_MAX_LOAD_KG;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(400);
  const [hoveredBinKey, setHoveredBinKey] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ left: number; top: number } | null>(null);
  const [highlightedStorageType, setHighlightedStorageType] = useState<string | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 400;
      setContainerHeight(Math.max(200, h));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const levelConfig = useMemo(() => getLevelConfig(rack), [rack]);
  const L = levelConfig.length;

  /** Visual order of slots (left→right): RTL mirrors segment_index without changing data. */
  const binDirectionRtl = useMemo(() => isBinDirectionRtl(layout, rack), [layout, rack]);

  const margin = 8;
  const padding = 8;
  const viewBoxW = 1000;
  const availableHeight = Math.max(100, containerHeight - 2 * padding);
  const viewBoxH = availableHeight;
  const contentW = viewBoxW - 2 * margin - 2 * UPRIGHT_WIDTH;
  const contentAreaH = viewBoxH - 2 * margin;
  const pad = 2;
  const ox = margin + UPRIGHT_WIDTH;
  const contentAreaY = margin;

  // Level then beam; lowest level has base beam (grey). Total = L bin rows + L beams.
  const beamHeight = BEAM_HEIGHT_VIEWBOX;
  const binRowHeight = Math.max(20, (contentAreaH - L * beamHeight) / L);
  // Top of bin row for level (level L-1 at top, level 0 at bottom)
  const levelToBinRowY = (level: number) => contentAreaY + (L - 1 - level) * (binRowHeight + beamHeight);
  // Top of beam (below bins); one beam per level (orange above floor, grey base at bottom)
  const levelToBeamY = (level: number) => levelToBinRowY(level) + binRowHeight;

  // Posts stop exactly at lowest beam (base beam). Height = levels container height.
  const structureHeight = L > 0 ? L * (binRowHeight + beamHeight) : 0;
  const uprightTopY = levelToBinRowY(L - 1);
  const uprightBottomY = L > 0 ? levelToBeamY(0) + beamHeight : contentAreaY;
  const uprightHeight = structureHeight;

  return (
    <div ref={containerRef} className={`w-full overflow-visible ${className}`} style={{ height: "100%", minHeight: 0, position: "relative" }}>
      <svg
        viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full block"
        style={{ display: "block" }}
      >
        <defs>
          <filter id="rack-sideview-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.15" />
          </filter>
          <filter id="rack-beam-badge-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#000" floodOpacity="0.15" />
          </filter>
          <clipPath id="rack-sideview-clip">
            <rect x={ox} y={contentAreaY} width={contentW} height={contentAreaH} />
          </clipPath>
        </defs>
        {/* RackContainer > LevelsContainer (LeftPost, Levels, RightPost) — posts height = levels height */}
        <g className="rack-sideview" filter="url(#rack-sideview-shadow)" aria-label="Rack">
          <g aria-label="LevelsContainer">
            {/* LeftPost — per-level segments; top level (L-1) grey, rest blue */}
            <g aria-label="LeftPost">
              {Array.from({ length: L }, (_, lev) => {
                const segY = levelToBinRowY(lev);
                const segH = binRowHeight + beamHeight;
                const fill = lev === L - 1 ? UPRIGHT_TOP_LEVEL_GREY : UPRIGHT_BLUE;
                return (
                  <rect
                    key={lev}
                    x={margin}
                    y={segY}
                    width={UPRIGHT_WIDTH}
                    height={segH}
                    fill={fill}
                    rx={2}
                  />
                );
              })}
            </g>
            {/* Levels: one beam per level — orange above floor, grey base beam at bottom */}
            {Array.from({ length: L }, (_, i) => L - 1 - i).map((lev) => {
              const row = levelConfig[lev];
              const locs = Math.max(1, row?.locations ?? 1);
              const cellWLev = contentW / locs;
              const beamY = levelToBeamY(lev);
              const isBaseBeam = lev === 0;
              const beamFill = isBaseBeam ? BEAM_BASE_GREY : BEAM_ORANGE;
              const rawLoadKg = levelLoadKg[lev] ?? 0;
              const loadKg = Number.isFinite(rawLoadKg) ? rawLoadKg : 0;
              const maxKg = effectiveMaxKg;
              const loadColor = hasLevelMaxLoad ? levelLoadColor(loadKg, maxKg) : "#64748b";
              const exceeded = hasLevelMaxLoad && loadKg > maxKg;
              const addresses = Array.from({ length: locs }, (_, seg) => {
                const b = getBinAt(rack, lev, seg);
                if (!b) return `L${lev + 1}-${seg + 1}`;
                return resolveWarehouseLocation(rack, b, layout ?? null).label || `L${lev + 1}-${seg + 1}`;
              });
              const weightText = hasLevelMaxLoad
                ? `${Math.round(loadKg)} / ${maxKg} kg${exceeded ? " ⚠" : ""}`
                : `${Math.round(loadKg)} kg`;
              const beamCenterY = beamY + beamHeight / 2;
              const labelW = 46;
              const labelH = 20;
              const badgeH = 20;
              const badgePaddingH = 16;
              const badgeCharWidth = 7;
              const badgeW = Math.max(64, weightText.length * badgeCharWidth + badgePaddingH);
              const badgeX = ox + contentW - badgeW - 6;
              return (
                <g key={`beam-${lev}`} aria-label={isBaseBeam ? "BaseBeam" : "Beam"}>
                  <rect
                    x={ox}
                    y={beamY}
                    width={contentW}
                    height={beamHeight}
                    fill={beamFill}
                    rx={2}
                  />
                  {showLabels && (
                    <g aria-label="Beam labels">
                      {Array.from({ length: locs }, (_, vis) => {
                        const seg = segmentIndexForVisualSlot(vis, locs, binDirectionRtl);
                        const addr = addresses[seg] ?? "";
                        const displayAddr = String(addr).length > 12 ? String(addr).slice(0, 10) + "…" : String(addr);
                        const slotCenterX = ox + cellWLev * (vis + 0.5);
                        const rectX = slotCenterX - labelW / 2;
                        const rectY = beamCenterY - labelH / 2;
                        return (
                          <g key={`beam-${lev}-${seg}`} filter="url(#rack-beam-badge-shadow)">
                            <rect
                              x={rectX}
                              y={rectY}
                              width={labelW}
                              height={labelH}
                              rx={6}
                              fill="#ffffff"
                              stroke="#d1d5db"
                            />
                            <text
                              x={slotCenterX}
                              y={beamCenterY}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fontSize={13}
                              fontWeight={700}
                              fill="#111827"
                              fontFamily="system-ui, sans-serif"
                            >
                              {displayAddr}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  )}
                  <g filter="url(#rack-beam-badge-shadow)">
                    <rect
                      x={badgeX}
                      y={beamCenterY - badgeH / 2}
                      width={badgeW}
                      height={badgeH}
                      rx={6}
                      fill="#e5e7eb"
                      stroke="#d1d5db"
                    />
                    <text
                      x={badgeX + badgeW - 6}
                      y={beamCenterY}
                      textAnchor="end"
                      dominantBaseline="middle"
                      fontSize={13}
                      fontWeight={700}
                      fill={isBaseBeam ? "#64748b" : loadColor}
                      fontFamily="system-ui, sans-serif"
                    >
                      {weightText}
                    </text>
                  </g>
                  {!isBaseBeam && exceeded && (
                    <text
                      x={ox + contentW / 2}
                      y={beamY + beamHeight - 2}
                      textAnchor="middle"
                      dominantBaseline="auto"
                      fontSize={Math.max(8, beamHeight * 0.4)}
                      fill="#fff"
                      fontFamily="system-ui, sans-serif"
                    >
                      Level load exceeded
                    </text>
                  )}
                </g>
              );
            })}
            {/* RightPost — per-level segments; top level (L-1) grey, rest blue */}
            <g aria-label="RightPost">
              {Array.from({ length: L }, (_, lev) => {
                const segY = levelToBinRowY(lev);
                const segH = binRowHeight + beamHeight;
                const fill = lev === L - 1 ? UPRIGHT_TOP_LEVEL_GREY : UPRIGHT_BLUE;
                return (
                  <rect
                    key={lev}
                    x={margin + UPRIGHT_WIDTH + contentW}
                    y={segY}
                    width={UPRIGHT_WIDTH}
                    height={segH}
                    fill={fill}
                    rx={2}
                  />
                );
              })}
            </g>
          </g>
          {/* Bin area: LevelRow content (boxes with location labels + occupancy) */}
          <g clipPath="url(#rack-sideview-clip)" aria-label="BinRows">
            {levelConfig.map((row, lev) => {
              const locs = Math.max(1, row.locations);
              const cellWLev = contentW / locs;
              const binRowY = levelToBinRowY(lev);
              const contentH = Math.max(0, binRowHeight - 2 * pad);
              const textPadding = 5;
              const lineH = 10;
              const barH = 4;
              const gap = 4;
              const lineCount = 4; // Różnych produktów, Łącznie, dm³, then bar
              const blockH = lineH * lineCount + gap * (lineCount - 1) + barH + gap + 10;
              const scale = contentH >= blockH ? 1 : Math.max(0.5, contentH / blockH);
              const linePx = lineH * scale;
              const barHPx = Math.max(2, barH * scale);
              const gapPx = gap * scale;
              const totalBlock = linePx * 3 + gapPx * 2 + barHPx + gapPx + 10 * scale;
              const startOff = (contentH - totalBlock) / 2;
              const barPad = 10;

              return Array.from({ length: locs }, (_, vis) => {
                const bin = segmentIndexForVisualSlot(vis, locs, binDirectionRtl);
                const binState = getBinAt(rack, lev, bin);
                const vol = binState ? binVolumeDm3(binState, rack) : 0;
                const used = binState ? binUsedVolumeDm3(binState) : 0;
                const pct = vol > 0 ? (used / vol) * 100 : 0;
                const quantity = binItemCounts?.[`${lev}-${bin}`] ?? 0;
                const uniqueCount = binUniqueProductCounts?.[`${lev}-${bin}`] ?? 0;
                const storageType =
                  binState != null && layout
                    ? resolveWarehouseLocation(rack, binState, layout).storageType
                    : normalizeStorageType(binState?.storage_type);
                const storageTypeLabel = getStorageTypeLabel(storageType);
                const isSelected = selectedLocation?.level_index === lev && selectedLocation?.segment_index === bin;
                const typeHighlightActive = highlightedStorageType != null;
                const isSameTypeHighlighted = highlightedStorageType === storageType;
                const x = ox + vis * cellWLev + pad;
                const y = binRowY + pad;
                const w = cellWLev - pad * 2;
                const h = contentH;
                const cx = x + w / 2;
                const style = getStorageTypeStyle(storageType);
                const fill = isSelected ? "#eff6ff" : storageType === "primary" ? BIN_BG : style.bg;
                const stroke = isSelected ? "#1d4ed8" : storageType === "primary" ? BIN_BORDER : style.border;
                const strokeWidth = isSelected ? 4 : 1;
                const line1Y = y + textPadding + startOff;
                const line2Y = line1Y + linePx + gapPx;
                const line3Y = line2Y + linePx + gapPx;
                const line4Y = line3Y + linePx + gapPx;
                const barY = line4Y + gapPx;
                const pctY = barY + barHPx + gapPx + 8 * scale;
                const barW = Math.max(0, w - 2 * barPad);
                const barX = x + barPad;
                const fontSize = Math.max(8, Math.min(14, w * 0.26, (h - 24) * 0.2) * scale);
                const fontSizeSub = Math.max(7, fontSize - 2);
                const binLabel =
                  binState != null
                    ? resolveWarehouseLocation(rack, binState, layout ?? null).label || `L${lev + 1}-${bin + 1}`
                    : `L${lev + 1}-${bin + 1}`;
                const binUuidNorm = (
                  (binState as { locationUUID?: string; location_uuid?: string } | undefined)?.locationUUID ??
                  (binState as { location_uuid?: string } | undefined)?.location_uuid ??
                  ""
                ).trim();
                const isSidebarLocationHover =
                  hoveredUuidNorm.length > 0 && binUuidNorm.length > 0 && binUuidNorm === hoveredUuidNorm;
                const usedDm3 = used;
                const iconX = x + w - 16;
                const iconY = y + 4;
                const showTypeIndicator = storageType === "reserve" || storageType === "damaged";
                const iconColorClass = storageType === "damaged" ? "text-red-700" : "text-slate-600";

                return (
                  <g
                    key={`${lev}-${bin}`}
                    onClick={() => onBinClick?.(lev, bin)}
                    style={{ cursor: onBinClick ? "pointer" : undefined }}
                    aria-label={`Bin ${binLabel}`}
                  >
                    <rect
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={strokeWidth}
                      rx={2}
                      opacity={typeHighlightActive && !isSameTypeHighlighted ? 0.35 : 1}
                    />
                    {isSameTypeHighlighted && (
                      <rect
                        x={x}
                        y={y}
                        width={w}
                        height={h}
                        fill="none"
                        stroke="#0ea5e9"
                        strokeWidth={2}
                        rx={2}
                      />
                    )}
                    {isSidebarLocationHover && (
                      <rect
                        x={x + 1}
                        y={y + 1}
                        width={Math.max(0, w - 2)}
                        height={Math.max(0, h - 2)}
                        fill="rgba(34,211,238,0.14)"
                        stroke="#22d3ee"
                        strokeWidth={2.5}
                        rx={2}
                        pointerEvents="none"
                        style={{ filter: "drop-shadow(0 0 4px rgba(34,211,238,0.55))" }}
                      />
                    )}
                    {showTypeIndicator && (
                      <g
                        onClick={(e) => {
                          e.stopPropagation();
                          setHighlightedStorageType((prev) => (prev === storageType ? null : storageType));
                        }}
                        style={{ cursor: "pointer", opacity: 0.7 }}
                      >
                        <title>{storageTypeLabel}</title>
                        <rect
                          x={iconX - 1}
                          y={iconY - 1}
                          width={14}
                          height={14}
                          fill="transparent"
                        />
                        <g transform={`translate(${iconX}, ${iconY})`}>
                          <StorageTypeIcon
                            storageType={storageType}
                            size={11}
                            className={iconColorClass}
                          />
                        </g>
                      </g>
                    )}
                    {/* Bin data: different products, total quantity, volume usage; then utilization bar */}
                    <text x={cx} y={line1Y} textAnchor="middle" fontSize={fontSizeSub} fill="#64748b" fontFamily="system-ui, sans-serif">
                      Różnych produktów: {uniqueCount}
                    </text>
                    <text x={cx} y={line2Y} textAnchor="middle" fontSize={fontSizeSub} fill="#64748b" fontFamily="system-ui, sans-serif">
                      Łącznie: {quantity} szt.
                    </text>
                    <text x={cx} y={line3Y} textAnchor="middle" fontSize={fontSizeSub} fill="#64748b" fontFamily="system-ui, sans-serif">
                      {typeof usedDm3 === "number" ? usedDm3.toFixed(1) : "0"} dm³
                    </text>
                    <rect x={barX} y={barY} width={barW} height={barHPx} fill="#e2e8f0" rx={1} />
                    <rect
                      x={barX}
                      y={barY}
                      width={Math.max(0, barW * Math.min(1, pct / 100))}
                      height={barHPx}
                      fill={pct <= 50 ? "#22c55e" : pct <= 80 ? "#eab308" : "#ef4444"}
                      rx={1}
                    />
                    <text x={cx} y={pctY} textAnchor="middle" fontSize={fontSizeSub} fill="#64748b" fontFamily="system-ui, sans-serif">
                      {pct.toFixed(0)}%
                    </text>
                    {showPhysicalCapacity && quantity > 0 && binMaxCapacityPieces?.[`${lev}-${bin}`] != null && (
                      <g
                        onMouseEnter={(e) => {
                          const key = `${lev}-${bin}`;
                          setHoveredBinKey(key);
                          const slotEl = e.currentTarget.parentElement;
                          const container = containerRef.current;
                          if (slotEl && container) {
                            const slotRect = slotEl.getBoundingClientRect();
                            const containerRect = container.getBoundingClientRect();
                            setTooltipPosition({
                              left: slotRect.right - containerRect.left + 8,
                              top: slotRect.top - containerRect.top,
                            });
                          }
                        }}
                        onMouseLeave={() => {
                          setHoveredBinKey(null);
                          setTooltipPosition(null);
                        }}
                      >
                        <text x={cx} y={pctY + 12} textAnchor="middle" fontSize={10} fill="#6b7280" fontFamily="system-ui, sans-serif">
                          Fizyczna poj.: {binMaxCapacityPieces[`${lev}-${bin}`]} szt.
                        </text>
                      </g>
                    )}
                  </g>
                );
              });
            })}
          </g>
        </g>
      </svg>
      {hoveredBinKey && tooltipPosition && binPackingPreview?.[hoveredBinKey] && (() => {
        const preview = binPackingPreview[hoveredBinKey]!;
        const { count, countX, countY, countZ, boxW_cm, boxD_cm, boxH_cm, productDisplayName, productSku, quantity, slotDims } = preview;
        const shapeType = (preview as { shapeType?: "box" | "cylinder" }).shapeType ?? "box";
        const maxCapacity = count;
        const hasOverflow = quantity > maxCapacity;
        const slotWidthCm = (slotDims.width_cm ?? 0) || 1;
        const slotDepthCm = (slotDims.depth_cm ?? 0) || 1;
        const slotHeightCm = (slotDims.height_cm ?? 0) || 1;
        const productFits = (boxW_cm ?? 0) <= slotWidthCm && (boxD_cm ?? 0) <= slotDepthCm && (boxH_cm ?? 0) <= slotHeightCm;
        const showWarning = count === 0 || !productFits;
        const slotStroke = "#d1d5db";
        const productFill = "#60a5fa";
        const TOP_VIEW_WIDTH_PX = 180;
        const TOP_VIEW_HEIGHT_PX = 120;
        const SIDE_VIEW_WIDTH_PX = 60;
        const productW = boxW_cm ?? 0;
        const productD = boxD_cm ?? 0;
        const layoutW = countX * productW || 1;
        const layoutH = countY * productD || 1;
        const scaleX = TOP_VIEW_WIDTH_PX / layoutW;
        const scaleY = TOP_VIEW_HEIGHT_PX / layoutH;
        const scaleTop = Math.min(scaleX, scaleY);
        const slotWidthPx = slotWidthCm * scaleTop;
        const slotDepthPx = slotDepthCm * scaleTop;
        const productWidthPx = productW * scaleTop;
        const productDepthPx = productD * scaleTop;
        const diameterPx = shapeType === "cylinder" ? productWidthPx : 0;
        const topViewBoxW = Math.max(TOP_VIEW_WIDTH_PX, slotWidthPx);
        const topViewBoxH = Math.max(TOP_VIEW_HEIGHT_PX, slotDepthPx);
        const sideSlotWidthPx = slotWidthCm * scaleTop;
        const sideSlotHeightPx = slotHeightCm * scaleTop;
        const sideProductWidthPx = productWidthPx;
        const sideProductHeightPx = (boxH_cm ?? 0) * scaleTop;
        const sideDiameterPx = shapeType === "cylinder" ? Math.min(sideProductWidthPx, sideProductHeightPx) : 0;
        const filledInLayer = Math.min(quantity, countX * countY);
        return (
          <div
            className="packing-preview"
            style={{
              position: "absolute",
              left: tooltipPosition.left,
              top: tooltipPosition.top,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              background: "white",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
              padding: 8,
              fontSize: 11,
              width: 260,
              fontFamily: "system-ui, sans-serif",
              wordWrap: "break-word",
              overflowWrap: "break-word",
              zIndex: 10,
            }}
          >
            <div style={{ marginBottom: 2, alignSelf: "stretch" }}>
              {productSku ? `SKU ${productSku}` : productDisplayName}
            </div>
            <div style={{ marginBottom: 8, color: "#64748b", alignSelf: "stretch" }}>
              {quantity} / {maxCapacity} szt.
              {hasOverflow && (
                <span style={{ display: "block", fontSize: 10, color: "#b91c1c", marginTop: 2 }}>
                  ⚠ (w slocie: {quantity})
                </span>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "row", alignItems: "stretch", gap: 8 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "1 1 180px", minWidth: 0 }}>
                <div style={{ fontSize: 9, color: "#94a3b8", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.02em" }}>Widok z góry</div>
                <svg width={TOP_VIEW_WIDTH_PX} height={TOP_VIEW_HEIGHT_PX} style={{ display: "block" }} viewBox={`0 0 ${topViewBoxW} ${topViewBoxH}`}>
                  <g transform={`translate(${(topViewBoxW - slotWidthPx) / 2}, ${(topViewBoxH - slotDepthPx) / 2})`}>
                    <rect x={0} y={0} width={slotWidthPx} height={slotDepthPx} fill="none" stroke={slotStroke} strokeWidth={1} />
                    {!showWarning && countX > 0 && countY > 0 && (shapeType === "cylinder"
                      ? Array.from({ length: countY }).map((_, iy) =>
                          Array.from({ length: countX }).map((_, ix) => {
                            const i = iy * countX + ix;
                            const isFilled = i < filledInLayer;
                            const r = diameterPx / 2;
                            const cx = ix * diameterPx + r;
                            const cy = iy * diameterPx + r;
                            return (
                              <circle key={`${ix}-${iy}`} cx={cx} cy={cy} r={r} fill={isFilled ? productFill : "none"} stroke={slotStroke} strokeWidth={1} />
                            );
                          })
                        )
                      : Array.from({ length: countY }).map((_, iy) =>
                          Array.from({ length: countX }).map((_, ix) => {
                            const i = iy * countX + ix;
                            const isFilled = i < filledInLayer;
                            return (
                              <rect
                                key={`${ix}-${iy}`}
                                x={ix * productWidthPx}
                                y={iy * productDepthPx}
                                width={productWidthPx}
                                height={productDepthPx}
                                fill={isFilled ? productFill : "none"}
                                stroke={slotStroke}
                                strokeWidth={1}
                              />
                            );
                          })
                        ))}
                    {showWarning && (
                      <text x={slotWidthPx / 2} y={slotDepthPx / 2} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="#b91c1c">
                        {count === 0 ? "Nie mieści się" : "Błąd wymiarów"}
                      </text>
                    )}
                  </g>
                </svg>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "0 0 60px" }}>
                <div style={{ fontSize: 9, color: "#94a3b8", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.02em" }}>Widok z boku</div>
                <svg
                  width={SIDE_VIEW_WIDTH_PX}
                  height={Math.round(SIDE_VIEW_WIDTH_PX * (sideSlotHeightPx / sideSlotWidthPx))}
                  style={{ display: "block" }}
                  viewBox={`0 0 ${sideSlotWidthPx} ${sideSlotHeightPx}`}
                  preserveAspectRatio="xMidYMid meet"
                >
                  <rect x={0} y={0} width={sideSlotWidthPx} height={sideSlotHeightPx} fill="none" stroke={slotStroke} strokeWidth={1} />
                  {!showWarning && countX > 0 && countZ > 0 && (shapeType === "cylinder"
                    ? Array.from({ length: countZ }).map((_, iz) =>
                        Array.from({ length: countX }).map((_, ix) => {
                          const x = ix * sideProductWidthPx;
                          const y = sideSlotHeightPx - (iz + 1) * sideProductHeightPx;
                          const w = sideProductWidthPx;
                          const h = Math.max(1, sideProductHeightPx - 1);
                          const rx = Math.min(w / 2, 2);
                          const ry = Math.min(w / 2, 2);
                          return (
                            <rect
                              key={`${ix}-${iz}`}
                              x={x}
                              y={y}
                              width={w}
                              height={h}
                              rx={rx}
                              ry={ry}
                              fill={productFill}
                              stroke={slotStroke}
                              strokeWidth={1}
                            />
                          );
                        })
                      )
                    : Array.from({ length: countZ }).map((_, iz) =>
                        Array.from({ length: countX }).map((_, ix) => (
                          <rect
                            key={`${ix}-${iz}`}
                            x={ix * sideProductWidthPx}
                            y={sideSlotHeightPx - (iz + 1) * sideProductHeightPx}
                            width={sideProductWidthPx}
                            height={Math.max(1, sideProductHeightPx - 1)}
                            fill={productFill}
                            stroke={slotStroke}
                            strokeWidth={1}
                          />
                        ))
                      ))}
                </svg>
              </div>
            </div>
            <div style={{ marginTop: 6, fontSize: 10, color: "#64748b", textAlign: "center" }}>
              {countX} × {countY} × {countZ}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
