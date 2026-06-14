import { useRef, useEffect, useState } from "react";

import {
  CONSOLIDATION_PREVIEW_CELL,
  CONSOLIDATION_PREVIEW_MAX_HEIGHT_PX,
  CONSOLIDATION_PREVIEW_SELECT,
  buildOmsBayPreviewRows,
  formatPreviewDimsCompact,
} from "./consolidationRackPreviewLayout";
import type { BayDraft, RackStructureDraft, SegmentSelection } from "./rackStructureModel";

const UPRIGHT = "#2563eb";

type Props = {
  draft: RackStructureDraft;
  bay: BayDraft | null;
  selection?: SegmentSelection;
  onSegmentClick?: (bayClientId: string, levelClientId: string, segmentClientId: string) => void;
  className?: string;
};

/**
 * OMS — fizyczny rack w jednym obrysie.
 * CSS flex (100% szerokości wiersza); segmenty ∝ width_mm w obrębie poziomu.
 */
export default function ConsolidationRackOmsPreview({
  draft,
  bay,
  selection = null,
  onSegmentClick,
  className = "",
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewportHeight, setViewportHeight] = useState(520);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 520;
      setViewportHeight(Math.max(240, h));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!bay || bay.levels.length === 0) {
    return (
      <div className="flex min-h-[240px] w-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white text-sm text-slate-500">
        Wybierz rack lub dodaj poziom.
      </div>
    );
  }

  const rows = buildOmsBayPreviewRows(bay, draft, viewportHeight);
  const rackWidth = draft.totalWidthMm ?? 2000;
  const totalLocations = rows.reduce((s, r) => s + r.cells.length, 0);
  const clickable = Boolean(onSegmentClick);

  return (
    <div className={`flex h-full min-h-0 w-full flex-col bg-white ${className}`}>
      <div className="flex shrink-0 items-baseline justify-between gap-2 px-0.5 pb-2">
        <h4 className="text-sm font-bold text-slate-600">
          Rack {bay.name} — {rows.length} poziomów · {totalLocations} lokalizacji
        </h4>
        <span className="text-[11px] tabular-nums text-slate-500">{rackWidth} mm</span>
      </div>

      {/* Jedna obudowa regału — pełna szerokość kontenera */}
      <div
        ref={scrollRef}
        className="relative min-h-[240px] flex-1 overflow-y-auto rounded-lg border-2 border-slate-300 bg-white"
        style={{ maxHeight: CONSOLIDATION_PREVIEW_MAX_HEIGHT_PX }}
      >
        {/* Słupki — pełna wysokość scrollowanej zawartości */}
        <div
          className="pointer-events-none absolute bottom-0 left-0 top-0 z-10 w-2 rounded-sm"
          style={{ backgroundColor: UPRIGHT }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute bottom-0 right-0 top-0 z-10 w-2 rounded-sm"
          style={{ backgroundColor: UPRIGHT }}
          aria-hidden
        />

        <div className="flex min-h-full flex-col pl-2 pr-2">
          {rows.map((row, rowIdx) => (
            <div
              key={row.key}
              className={`flex w-full min-w-0 ${rowIdx > 0 ? "border-t-2 border-orange-400/55" : ""}`}
              style={{ height: row.bandHeightPx, minHeight: row.bandHeightPx }}
            >
              <div className="flex min-w-0 flex-1 gap-px py-px">
                {row.cells.map((cell, cellIdx) => {
                  const isSelected =
                    selection?.bayClientId === bay.clientId
                    && selection.levelClientId === cell.levelClientId
                    && selection.segmentClientId === cell.key;
                  const flexGrow = Math.max(0.001, cell.widthFraction);
                  const dims = formatPreviewDimsCompact(cell.widthMm, cell.depthMm, cell.heightMm);
                  const isCompact = row.cells.length >= 12 || row.bandHeightPx < 48;
                  const isMedium = !isCompact && (row.cells.length >= 8 || row.bandHeightPx < 64);

                  let borderColor = CONSOLIDATION_PREVIEW_CELL.border;
                  let borderWidth = 1.5;
                  if (isSelected) {
                    borderColor = CONSOLIDATION_PREVIEW_SELECT.segmentBorder;
                    borderWidth = CONSOLIDATION_PREVIEW_SELECT.segmentBorderWidth;
                  }

                  return (
                    <div
                      key={cell.key}
                      role={clickable ? "button" : undefined}
                      tabIndex={clickable ? 0 : undefined}
                      onClick={
                        clickable
                          ? () => onSegmentClick?.(bay.clientId, cell.levelClientId, cell.key)
                          : undefined
                      }
                      onKeyDown={
                        clickable
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onSegmentClick?.(bay.clientId, cell.levelClientId, cell.key);
                              }
                            }
                          : undefined
                      }
                      className={`flex min-w-[28px] flex-col items-center justify-center overflow-hidden px-0.5 text-center ${
                        clickable ? "cursor-pointer hover:brightness-[0.98]" : ""
                      } ${cellIdx > 0 ? "border-l border-slate-300/80" : ""}`}
                      style={{
                        flex: `${flexGrow} 1 0`,
                        backgroundColor: CONSOLIDATION_PREVIEW_CELL.bg,
                        border: `${borderWidth}px solid ${borderColor}`,
                        borderRadius: 3,
                      }}
                      title={`${cell.label}\n${dims}`}
                    >
                      <span className="w-full truncate font-sans text-sm font-extrabold leading-tight text-slate-900">
                        {cell.label}
                      </span>
                      {isCompact ? (
                        <span className="mt-0.5 font-sans text-[8px] tabular-nums leading-tight text-slate-600">
                          {dims}
                        </span>
                      ) : isMedium ? (
                        <span className="mt-0.5 font-sans text-[9px] tabular-nums text-slate-600">{dims}</span>
                      ) : (
                        <>
                          <span className="mt-0.5 font-sans text-[10px] tabular-nums text-slate-600">
                            SZ {Math.round(cell.widthMm)}
                          </span>
                          <span className="font-sans text-[10px] tabular-nums text-slate-600">
                            GŁ {Math.round(cell.depthMm)}
                          </span>
                          <span className="font-sans text-[10px] tabular-nums text-slate-600">
                            WYS {Math.round(cell.heightMm)}
                          </span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
