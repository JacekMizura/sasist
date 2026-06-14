import { useRef, useEffect, useState } from "react";
import { Plus } from "lucide-react";

import {
  CONSOLIDATION_PREVIEW_CELL,
  CONSOLIDATION_PREVIEW_SELECT,
  buildOmsPreviewRows,
  formatPreviewDimsCompact,
} from "./consolidationRackPreviewLayout";
import { computeCapacityDm3 } from "./rackLayoutUtils";
import type { RackStructureDraft, SegmentSelection } from "./rackStructureModel";

const UPRIGHT = "#2563eb";

type Props = {
  draft: RackStructureDraft;
  selection?: SegmentSelection;
  readOnly?: boolean;
  structureLocked?: boolean;
  onSegmentClick?: (levelClientId: string, segmentClientId: string) => void;
  onAddLevel?: () => void;
  className?: string;
};

/**
 * OMS — wizualizacja regału (poziomy × segmenty), klik → panel boczny.
 * Ten sam widok w edycji i podglądzie — jak RackPreview w kreatorze szablonów.
 */
export default function ConsolidationRackOmsPreview({
  draft,
  selection = null,
  readOnly = false,
  structureLocked = false,
  onSegmentClick,
  onAddLevel,
  className = "",
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewportHeight, setViewportHeight] = useState(520);
  const canEditStructure = !readOnly && !structureLocked;
  const clickable = Boolean(onSegmentClick);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 520;
      setViewportHeight(Math.max(280, h));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (draft.levels.length === 0) {
    return (
      <div className="flex min-h-[280px] w-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white text-sm text-slate-500">
        Dodaj poziom w panelu bocznym.
      </div>
    );
  }

  const rows = buildOmsPreviewRows(draft, viewportHeight);
  const rackWidth = draft.totalWidthMm ?? 2000;
  const totalLocations = rows.reduce((s, r) => s + r.cells.length, 0);
  const rackTitle = draft.rackName.trim() || "RK-XX";

  return (
    <div className={`flex h-full min-h-0 w-full flex-col ${className}`}>
      <div className="flex shrink-0 items-baseline justify-between gap-2 pb-2">
        <h4 className="text-sm font-bold text-slate-700">
          {rackTitle} — {rows.length} {rows.length === 1 ? "poziom" : "poziomów"} · {totalLocations} segmentów
        </h4>
        <span className="text-[11px] tabular-nums text-slate-500">{rackWidth} mm</span>
      </div>

      <div
        ref={scrollRef}
        className="relative min-h-[280px] flex-1 overflow-y-auto rounded-lg border-2 border-slate-300 bg-white"
      >
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

        <div className="flex min-h-full w-full flex-col pl-2 pr-2">
          {rows.map((row, rowIdx) => (
            <div
              key={row.key}
              className={`flex w-full min-w-0 ${rowIdx > 0 ? "border-t-2 border-orange-400/55" : ""}`}
              style={{ height: row.bandHeightPx, minHeight: row.bandHeightPx }}
            >
              <div className="flex min-w-0 flex-1 gap-px py-px">
                {row.cells.map((cell, cellIdx) => {
                  const isSelected =
                    selection?.levelClientId === cell.levelClientId
                    && selection.segmentClientId === cell.key;
                  const flexGrow = Math.max(0.001, cell.widthFraction);
                  const dims = formatPreviewDimsCompact(cell.widthMm, cell.depthMm, cell.heightMm);
                  const cap = cell.capacityDm3 ?? computeCapacityDm3(cell.depthMm, cell.widthMm, cell.heightMm);
                  const isCompact = row.cells.length >= 10 || row.bandHeightPx < 56;
                  const isMedium = !isCompact && (row.cells.length >= 6 || row.bandHeightPx < 72);

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
                          ? () => onSegmentClick?.(cell.levelClientId, cell.key)
                          : undefined
                      }
                      onKeyDown={
                        clickable
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onSegmentClick?.(cell.levelClientId, cell.key);
                              }
                            }
                          : undefined
                      }
                      className={`flex min-w-[32px] flex-col items-center justify-center overflow-hidden px-1 text-center ${
                        clickable ? "cursor-pointer hover:brightness-[0.98]" : ""
                      } ${cellIdx > 0 ? "border-l border-slate-300/80" : ""}`}
                      style={{
                        flex: `${flexGrow} 1 0`,
                        backgroundColor: isSelected ? "#fff7ed" : CONSOLIDATION_PREVIEW_CELL.bg,
                        border: `${borderWidth}px solid ${borderColor}`,
                        borderRadius: 3,
                      }}
                      title={`${cell.label}\n${dims}${cap != null ? `\n${cap.toFixed(0)} dm³` : ""}`}
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
                          {cap != null ? (
                            <span className="font-sans text-[9px] font-semibold tabular-nums text-violet-800">
                              {cap.toFixed(0)} dm³
                            </span>
                          ) : null}
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

      {canEditStructure && onAddLevel ? (
        <button
          type="button"
          onClick={onAddLevel}
          className="mt-2 inline-flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-sm font-medium text-slate-600 hover:border-violet-300 hover:text-violet-900"
        >
          <Plus className="h-4 w-4" />
          Dodaj poziom
        </button>
      ) : null}
    </div>
  );
}
