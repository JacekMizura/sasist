import { useRef, useState, useEffect, useMemo } from "react";
import type { RackState, BinState } from "../../types/warehouse";
import { getLevelConfig } from "./warehouseUtils";
import { binUsedVolumeDm3, binVolumeDm3 } from "./warehouseUtils";
import { RESERVE_BG, RESERVE_BORDER } from "./reserveLocationStyle";

const UPRIGHT_BLUE = "#2563eb";
const SHELF_ORANGE = "#ea580c";
const SHELF_GREY = "#64748b";
const CELL_STROKE = "#cbd5e1";
const RESERVE_FILL = RESERVE_BG;
const RESERVE_STROKE = RESERVE_BORDER;

function getBinAt(rack: RackState, levelIndex: number, segmentIndex: number): BinState | undefined {
  return rack.bins.find((b) => b.level_index === levelIndex && b.segment_index === segmentIndex);
}

export type SelectedLocation = { level_index: number; segment_index: number } | null;

/**
 * Single unified SVG grid of the rack (side view): one vertical rectangle subdivided into levels and bins.
 * Contained in a single non-scrolling area. levelHeight = availableHeight / levels (parent reserves header space).
 * Wireframe: open top, no floor beam. All cells clickable; selected cell has blue border.
 * Each cell: Bin ID (bold), progress bar, occupancy (0.00%); stacked and centered, scales down if small.
 */
/** Key for binItemCounts / binUniqueProductCounts: `${level_index}-${segment_index}` */
export function RackSideViewGrid({
  rack,
  className = "",
  onBinClick,
  selectedLocation,
  binItemCounts,
  binUniqueProductCounts,
}: {
  rack: RackState;
  className?: string;
  onBinClick?: (level_index: number, segment_index: number) => void;
  selectedLocation?: SelectedLocation;
  /** Optional map from "level_index-segment_index" to total item count (szt.) */
  binItemCounts?: Record<string, number>;
  /** Optional map from "level_index-segment_index" to count of unique products in bin */
  binUniqueProductCounts?: Record<string, number>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(400);
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

  const margin = 8;
  const padding = 8;
  const beamW = 8;
  const viewBoxW = 1000;
  const availableHeight = Math.max(100, containerHeight - 2 * padding);
  const viewBoxH = availableHeight;
  const contentW = viewBoxW - 2 * margin - 2 * beamW;
  const contentAreaH = viewBoxH - 2 * margin;
  const levelHeight = contentAreaH / Math.max(1, L);
  const pad = 2;
  const ox = margin + beamW;
  const contentAreaY = margin;
  const levelToY = (level: number) => contentAreaY + (L - 1 - level) * levelHeight + pad;
  const cellInsetH = Math.max(0, levelHeight - pad * 2);
  const textPadding = 5;

  const floorY = levelToY(0) + cellInsetH;
  const topLevelRowBottomY = levelToY(L - 1) + cellInsetH;
  const uprightTopY = topLevelRowBottomY;
  const uprightHeight = floorY - topLevelRowBottomY;
  const internalShelfYs = Array.from({ length: L - 1 }, (_, i) => levelToY(L - 2 - i));

  return (
    <div ref={containerRef} className={`w-full overflow-hidden ${className}`} style={{ height: "100%" }}>
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
          <clipPath id="rack-sideview-clip">
            <rect x={ox} y={contentAreaY} width={contentW} height={contentAreaH} />
          </clipPath>
        </defs>
        <g filter="url(#rack-sideview-shadow)">
          <rect x={margin} y={uprightTopY} width={beamW} height={uprightHeight} fill={UPRIGHT_BLUE} rx={2} />
          <rect x={margin + beamW + contentW} y={uprightTopY} width={beamW} height={uprightHeight} fill={UPRIGHT_BLUE} rx={2} />
          {internalShelfYs.map((y, i) => (
            <line key={`shelf-${i}`} x1={ox} y1={y} x2={ox + contentW} y2={y} stroke={SHELF_ORANGE} strokeWidth={1} strokeLinecap="butt" />
          ))}
          <g clipPath="url(#rack-sideview-clip)">
            {levelConfig.map((row, lev) => {
              const locs = Math.max(1, row.locations);
              if (locs <= 1) return null;
              const cellWLev = contentW / locs;
              const yStart = levelToY(lev);
              const yEnd = yStart + cellInsetH;
              return Array.from({ length: locs - 1 }, (_, i) => (
                <line
                  key={`div-${lev}-${i}`}
                  x1={ox + (i + 1) * cellWLev}
                  y1={yStart}
                  x2={ox + (i + 1) * cellWLev}
                  y2={yEnd}
                  stroke={SHELF_GREY}
                  strokeWidth={1}
                  opacity={0.9}
                />
              ));
            })}
            {levelConfig.map((row, lev) => {
              const locs = Math.max(1, row.locations);
              const cellWLev = contentW / locs;
              const contentH = Math.max(0, cellInsetH - 2 * textPadding);
              const line1H = 14;
              const line2H = 10;
              const line3H = 10;
              const barH = 4;
              const gap = 4;
              const blockH = line1H + gap + line2H + gap + line3H + gap + barH + gap + 10;
              const scale = contentH >= blockH ? 1 : Math.max(0.5, contentH / blockH);
              const line1Px = line1H * scale;
              const line2Px = line2H * scale;
              const line3Px = line3H * scale;
              const barHPx = Math.max(2, barH * scale);
              const gapPx = gap * scale;
              const totalBlock = line1Px + gapPx + line2Px + gapPx + line3Px + gapPx + barHPx + gapPx + 10 * scale;
              const startOff = (contentH - totalBlock) / 2;
              const barPad = 10;
              return Array.from({ length: locs }, (_, bin) => {
                const binState = getBinAt(rack, lev, bin);
                const label = binState?.label ?? `L${lev + 1}-${bin + 1}`;
                const vol = binState ? binVolumeDm3(binState, rack) : 0;
                const used = binState ? binUsedVolumeDm3(binState) : 0;
                const pct = vol > 0 ? (used / vol) * 100 : 0;
                const quantity = binItemCounts?.[`${lev}-${bin}`] ?? 0;
                const uniqueCount = binUniqueProductCounts?.[`${lev}-${bin}`] ?? 0;
                const isReserve = binState?.storage_type === "reserve";
                const isSelected = selectedLocation?.level_index === lev && selectedLocation?.segment_index === bin;
                const x = ox + bin * cellWLev + pad;
                const y = levelToY(lev);
                const w = cellWLev - pad * 2;
                const h = cellInsetH;
                const cx = x + w / 2;
                const fill = isSelected ? "#eff6ff" : isReserve ? RESERVE_FILL : "white";
                const stroke = isSelected ? "#1d4ed8" : isReserve ? RESERVE_STROKE : CELL_STROKE;
                const strokeWidth = isSelected ? 4 : 1;
                const line1Y = y + textPadding + startOff + line1Px;
                const line2Y = line1Y + gapPx + line2Px;
                const line3Y = line2Y + gapPx + line3Px;
                const barY = line3Y + gapPx;
                const pctY = barY + barHPx + gapPx + 8 * scale;
                const barW = Math.max(0, w - 2 * barPad);
                const barX = x + barPad;
                const fontSize = Math.max(8, Math.min(14, w * 0.26, (h - 24) * 0.2) * scale);
                const fontSizeSub = Math.max(7, fontSize - 2);
                const displayLabel = label.length > 12 ? label.slice(0, 10) + "…" : label;
                return (
                  <g
                    key={`${lev}-${bin}`}
                    onClick={() => onBinClick?.(lev, bin)}
                    style={{ cursor: onBinClick ? "pointer" : undefined }}
                  >
                    <rect x={x} y={y} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={strokeWidth} rx={2} />
                    <text x={cx} y={line1Y} textAnchor="middle" fontSize={fontSize} fill="#0f172a" fontFamily="system-ui, sans-serif" fontWeight="700">
                      {displayLabel}
                    </text>
                    <text x={cx} y={line2Y} textAnchor="middle" fontSize={fontSizeSub} fill="#64748b" fontFamily="system-ui, sans-serif">
                      Różnych produktów: {uniqueCount}
                    </text>
                    <text x={cx} y={line3Y} textAnchor="middle" fontSize={fontSizeSub} fill="#64748b" fontFamily="system-ui, sans-serif">
                      Łącznie: {quantity} szt.
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
                      {pct.toFixed(2)}%
                    </text>
                  </g>
                );
              });
            })}
          </g>
        </g>
      </svg>
    </div>
  );
}
