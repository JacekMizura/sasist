import { useRef, useState, useEffect, useMemo } from "react";
import type { RackState, BinState } from "../../types/warehouse";
import { getLevelConfig } from "./warehouseUtils";
import { binUsedVolumeDm3, binVolumeDm3 } from "./warehouseUtils";
import { RESERVE_BG, RESERVE_BORDER } from "./reserveLocationStyle";

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
const RESERVE_FILL = RESERVE_BG;
const RESERVE_STROKE = RESERVE_BORDER;

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
  levelLoadKg = {},
  levelMaxLoadKg,
}: {
  rack: RackState;
  className?: string;
  onBinClick?: (level_index: number, segment_index: number) => void;
  selectedLocation?: SelectedLocation;
  binItemCounts?: Record<string, number>;
  binUniqueProductCounts?: Record<string, number>;
  /** Per-level total load in kg (from products weight_kg × quantity). */
  levelLoadKg?: Record<number, number>;
  /** Max allowed load per level in kg (from template/rack). Default 500 when missing. */
  levelMaxLoadKg?: number;
}) {
  const hasLevelMaxLoad = levelMaxLoadKg != null && levelMaxLoadKg > 0;
  const effectiveMaxKg = hasLevelMaxLoad ? levelMaxLoadKg! : DEFAULT_LEVEL_MAX_LOAD_KG;
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
    <div ref={containerRef} className={`w-full overflow-visible ${className}`} style={{ height: "100%", minHeight: 0 }}>
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
                return b?.label ?? b?.location_id ?? `L${lev + 1}-${seg + 1}`;
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
                  <g aria-label="Beam labels">
                    {addresses.map((addr, seg) => {
                      const displayAddr = String(addr).length > 12 ? String(addr).slice(0, 10) + "…" : String(addr);
                      const slotCenterX = ox + cellWLev * (seg + 0.5);
                      const rectX = slotCenterX - labelW / 2;
                      const rectY = beamCenterY - labelH / 2;
                      return (
                        <g key={seg} filter="url(#rack-beam-badge-shadow)">
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

              return Array.from({ length: locs }, (_, bin) => {
                const binState = getBinAt(rack, lev, bin);
                const vol = binState ? binVolumeDm3(binState, rack) : 0;
                const used = binState ? binUsedVolumeDm3(binState) : 0;
                const pct = vol > 0 ? (used / vol) * 100 : 0;
                const quantity = binItemCounts?.[`${lev}-${bin}`] ?? 0;
                const uniqueCount = binUniqueProductCounts?.[`${lev}-${bin}`] ?? 0;
                const isReserve = binState?.storage_type === "reserve";
                const isSelected = selectedLocation?.level_index === lev && selectedLocation?.segment_index === bin;
                const x = ox + bin * cellWLev + pad;
                const y = binRowY + pad;
                const w = cellWLev - pad * 2;
                const h = contentH;
                const cx = x + w / 2;
                const fill = isSelected ? "#eff6ff" : isReserve ? RESERVE_FILL : BIN_BG;
                const stroke = isSelected ? "#1d4ed8" : isReserve ? RESERVE_STROKE : BIN_BORDER;
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
                const binLabel = binState?.label ?? binState?.location_id ?? `L${lev + 1}-${bin + 1}`;
                const usedDm3 = used;

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
                    />
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
