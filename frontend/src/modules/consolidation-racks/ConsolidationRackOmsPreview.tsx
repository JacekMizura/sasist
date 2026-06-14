import { useRef, useEffect, useState } from "react";

import {
  CONSOLIDATION_PREVIEW_CELL,
  CONSOLIDATION_PREVIEW_MAX_HEIGHT_PX,
  CONSOLIDATION_PREVIEW_SELECT,
  buildOmsBayPreviewRows,
  formatPreviewDimsMultiline,
} from "./consolidationRackPreviewLayout";
import type { BayDraft, RackStructureDraft, SegmentSelection } from "./rackStructureModel";

const UPRIGHT = "#2563eb";
const SHELF = "#ea580c";
const SHELF_GREY = "#94a3b8";

type Props = {
  draft: RackStructureDraft;
  bay: BayDraft | null;
  selection?: SegmentSelection;
  onSegmentClick?: (bayClientId: string, levelClientId: string, segmentClientId: string) => void;
  className?: string;
};

/** OMS — jeden fizyczny rack (unit) w jednym obrysie, wzór z kreatora szablonów. */
export default function ConsolidationRackOmsPreview({
  draft,
  bay,
  selection = null,
  onSegmentClick,
  className = "",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(480);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 480;
      setContainerHeight(Math.max(240, Math.min(CONSOLIDATION_PREVIEW_MAX_HEIGHT_PX, h)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!bay || bay.levels.length === 0) {
    return (
      <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white text-sm text-slate-500">
        Wybierz rack lub dodaj poziom.
      </div>
    );
  }

  const rows = buildOmsBayPreviewRows(bay, draft, containerHeight);
  const rackWidth = draft.totalWidthMm ?? 2000;
  const clickable = Boolean(onSegmentClick);
  const margin = 12;
  const beamW = 6;
  const viewBoxW = 1000;
  const viewBoxH = containerHeight;
  const contentW = viewBoxW - 2 * margin - 2 * beamW;
  const contentH = viewBoxH - 2 * margin;
  const totalLevelMm = rows.reduce((s, r) => s + r.levelHeightMm, 0);
  const levelBandPx = (mm: number) => (mm / totalLevelMm) * contentH;

  let yCursor = margin;
  const shelfYs: number[] = [];

  return (
    <div className={`flex min-h-0 flex-col bg-white ${className}`}>
      <div className="flex shrink-0 items-baseline justify-between gap-2 px-1 pb-2">
        <h4 className="text-sm font-bold text-slate-600">Rack {bay.name} — podgląd fizyczny</h4>
        <span className="text-[11px] tabular-nums text-slate-500">{rackWidth} mm szer.</span>
      </div>
      <div
        ref={containerRef}
        className="min-h-[240px] flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white"
        style={{ maxHeight: CONSOLIDATION_PREVIEW_MAX_HEIGHT_PX }}
      >
        <svg
          viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full"
          role="img"
          aria-label={`Rack ${bay.name}, ${rows.length} poziomów`}
        >
          <rect
            x={margin}
            y={margin}
            width={viewBoxW - 2 * margin}
            height={viewBoxH - 2 * margin}
            fill="#ffffff"
            stroke="#cbd5e1"
            strokeWidth={2}
            rx={4}
          />
          <rect x={margin} y={margin} width={beamW} height={contentH} fill={UPRIGHT} rx={2} />
          <rect x={margin + beamW + contentW} y={margin} width={beamW} height={contentH} fill={UPRIGHT} rx={2} />

          {rows.map((row, rowIdx) => {
            const bandH = levelBandPx(row.levelHeightMm);
            const y = yCursor;
            yCursor += bandH;
            if (rowIdx < rows.length - 1) shelfYs.push(y + bandH);
            const ox = margin + beamW;

            return (
              <g key={row.key}>
                {row.cells.map((cell, cellIdx) => {
                  const pct = Math.max(0.02, cell.widthFraction);
                  const cellW = contentW * pct;
                  const offsetPct = row.cells
                    .slice(0, cellIdx)
                    .reduce((s, c) => s + c.widthFraction, 0);
                  const x = ox + contentW * offsetPct;
                  const isSelected =
                    selection?.bayClientId === bay.clientId
                    && selection.levelClientId === cell.levelClientId
                    && selection.segmentClientId === cell.key;
                  const fill = CONSOLIDATION_PREVIEW_CELL.bg;
                  const stroke = isSelected
                    ? CONSOLIDATION_PREVIEW_SELECT.segmentBorder
                    : CONSOLIDATION_PREVIEW_CELL.border;
                  const strokeW = isSelected ? CONSOLIDATION_PREVIEW_SELECT.segmentBorderWidth : 1.5;
                  const [sz, gl, wys] = formatPreviewDimsMultiline(cell.widthMm, cell.depthMm, cell.heightMm);
                  const volStr = cell.capacityDm3 != null ? `${cell.capacityDm3.toFixed(0)} dm³` : "—";
                  const compact = cellW < 70 || bandH < 56;
                  const cx = x + cellW / 2;
                  const cy = y + bandH / 2;

                  return (
                    <g
                      key={cell.key}
                      onClick={
                        clickable
                          ? () => onSegmentClick?.(bay.clientId, cell.levelClientId, cell.key)
                          : undefined
                      }
                      style={{ cursor: clickable ? "pointer" : undefined }}
                    >
                      <rect
                        x={x + 1}
                        y={y + 1}
                        width={Math.max(2, cellW - 2)}
                        height={Math.max(2, bandH - 2)}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={strokeW}
                        rx={3}
                      />
                      <title>{`${cell.label}\n${sz} · ${gl} · ${wys}\n${volStr}`}</title>
                      <text
                        x={cx}
                        y={compact ? cy : cy - 14}
                        textAnchor="middle"
                        fontSize={compact ? 11 : 14}
                        fontWeight="800"
                        fill="#0f172a"
                        fontFamily="system-ui,sans-serif"
                      >
                        {cell.label}
                      </text>
                      {!compact ? (
                        <>
                          <text x={cx} y={cy + 2} textAnchor="middle" fontSize={10} fill="#475569" fontFamily="system-ui,sans-serif">{sz}</text>
                          <text x={cx} y={cy + 14} textAnchor="middle" fontSize={10} fill="#475569" fontFamily="system-ui,sans-serif">{gl}</text>
                          <text x={cx} y={cy + 26} textAnchor="middle" fontSize={10} fill="#475569" fontFamily="system-ui,sans-serif">{wys}</text>
                          <text x={cx} y={cy + 40} textAnchor="middle" fontSize={9} fill="#64748b" fontFamily="system-ui,sans-serif">{volStr}</text>
                        </>
                      ) : (
                        <text x={cx} y={cy + 8} textAnchor="middle" fontSize={8} fill="#64748b" fontFamily="system-ui,sans-serif">
                          {Math.round(cell.widthMm)}×{Math.round(cell.depthMm)}×{Math.round(cell.heightMm)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}

          {shelfYs.map((sy, i) => (
            <line
              key={`shelf-${i}`}
              x1={margin + beamW}
              y1={sy}
              x2={margin + beamW + contentW}
              y2={sy}
              stroke={SHELF}
              strokeWidth={1.5}
              strokeOpacity={0.5}
            />
          ))}
          {rows.map((row, rowIdx) => {
            const bandH = levelBandPx(row.levelHeightMm);
            const rowY =
              margin
              + rows.slice(0, rowIdx).reduce((s, r) => s + levelBandPx(r.levelHeightMm), 0);
            if (row.cells.length <= 1) return null;
            let acc = 0;
            return row.cells.slice(0, -1).map((cell, i) => {
              acc += cell.widthFraction;
              const lx = margin + beamW + contentW * acc;
              return (
                <line
                  key={`div-${row.key}-${i}`}
                  x1={lx}
                  y1={rowY + 2}
                  x2={lx}
                  y2={rowY + bandH - 2}
                  stroke={SHELF_GREY}
                  strokeWidth={1}
                  opacity={0.7}
                />
              );
            });
          })}
        </svg>
      </div>
    </div>
  );
}
