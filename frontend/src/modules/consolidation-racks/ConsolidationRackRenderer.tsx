import type { CSSProperties, ReactNode, RefObject } from "react";

import type { RackLayoutCell, RackLayoutRow } from "./consolidationRackPreviewLayout";

const UPRIGHT = "#2563eb";

export type RackLayoutCellRenderContext = {
  bandHeightPx: number;
  cellCount: number;
  cellIndex: number;
};

export type ConsolidationRackRendererProps = {
  rows: RackLayoutRow[];
  header?: {
    title: string;
    widthMm?: number | null;
    meta?: string;
  };
  selectedCellKey?: string | null;
  onCellClick?: (cell: RackLayoutCell) => void;
  renderCell: (cell: RackLayoutCell, ctx: RackLayoutCellRenderContext) => ReactNode;
  getCellContainerClassName?: (cell: RackLayoutCell, ctx: RackLayoutCellRenderContext) => string;
  getCellContainerStyle?: (cell: RackLayoutCell, ctx: RackLayoutCellRenderContext) => CSSProperties | undefined;
  footer?: ReactNode;
  emptyMessage?: string;
  className?: string;
  scrollRef?: RefObject<HTMLDivElement | null>;
};

/**
 * Wspólna geometria regału kompletacyjnego (OMS + WMS).
 * Odpowiada wyłącznie za układ poziomów, segmentów i proporcji — bez logiki modułu.
 */
export default function ConsolidationRackRenderer({
  rows,
  header,
  selectedCellKey = null,
  onCellClick,
  renderCell,
  getCellContainerClassName,
  getCellContainerStyle,
  footer,
  emptyMessage = "Brak poziomów w regale.",
  className = "",
  scrollRef,
}: ConsolidationRackRendererProps) {
  const clickable = Boolean(onCellClick);

  if (rows.length === 0) {
    return (
      <div className="flex min-h-[280px] w-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white text-sm text-slate-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`flex h-full min-h-0 w-full flex-col ${className}`}>
      {header ? (
        <div className="flex shrink-0 items-baseline justify-between gap-2 pb-2">
          <h4 className="text-sm font-bold text-slate-700">{header.title}</h4>
          <div className="flex items-baseline gap-2 text-[11px] tabular-nums text-slate-500">
            {header.meta ? <span>{header.meta}</span> : null}
            {header.widthMm != null ? <span>{header.widthMm} mm</span> : null}
          </div>
        </div>
      ) : null}

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
                  const ctx: RackLayoutCellRenderContext = {
                    bandHeightPx: row.bandHeightPx,
                    cellCount: row.cells.length,
                    cellIndex: cellIdx,
                  };
                  const flexGrow = Math.max(0.001, cell.widthFraction);
                  const isSelected = selectedCellKey === cell.key;
                  const extraClass = getCellContainerClassName?.(cell, ctx) ?? "";
                  const extraStyle = getCellContainerStyle?.(cell, ctx);

                  return (
                    <div
                      key={cell.key}
                      role={clickable ? "button" : undefined}
                      tabIndex={clickable ? 0 : undefined}
                      onClick={clickable ? () => onCellClick?.(cell) : undefined}
                      onKeyDown={
                        clickable
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onCellClick?.(cell);
                              }
                            }
                          : undefined
                      }
                      data-selected={isSelected || undefined}
                      className={`flex min-w-[32px] flex-col items-center justify-center overflow-hidden px-1 text-center ${
                        clickable ? "cursor-pointer hover:brightness-[0.98]" : ""
                      } ${cellIdx > 0 ? "border-l border-slate-300/80" : ""} ${extraClass}`}
                      style={{
                        flex: `${flexGrow} 1 0`,
                        borderRadius: 3,
                        ...extraStyle,
                      }}
                    >
                      {renderCell(cell, ctx)}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {footer}
    </div>
  );
}
