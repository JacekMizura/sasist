import type { RackStructureDraft } from "./rackStructureModel";
import type { SegmentSelection } from "./rackStructureModel";
import {
  buildConsolidationPreviewRows,
  CONSOLIDATION_PREVIEW_CELL,
  CONSOLIDATION_PREVIEW_MAX_HEIGHT_PX,
  CONSOLIDATION_PREVIEW_SELECT,
  type SegmentOccupancyInfo,
} from "./consolidationRackPreviewLayout";

type Props = {
  draft: RackStructureDraft;
  className?: string;
  showOccupancy?: boolean;
  occupancyBySegmentId?: Map<number, SegmentOccupancyInfo>;
  selection?: SegmentSelection;
  onSegmentClick?: (levelClientId: string, segmentClientId: string) => void;
  interactive?: boolean;
};

export default function ConsolidationRackStructurePreview({
  draft,
  className = "",
  showOccupancy = false,
  occupancyBySegmentId,
  selection = null,
  onSegmentClick,
  interactive = false,
}: Props) {
  const rows = buildConsolidationPreviewRows(draft);
  const rackWidth = draft.totalWidthMm ?? 2000;
  const clickable = interactive && Boolean(onSegmentClick);

  if (rows.length === 0) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500">
        Dodaj poziom regału.
      </div>
    );
  }

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      <h4 className="shrink-0 px-1 pb-2 text-sm font-bold text-slate-600">Podgląd regału — na żywo</h4>
      <div
        className="min-h-0 overflow-y-auto rounded-xl border border-slate-200/35 bg-slate-50/20 p-3"
        style={{ maxHeight: CONSOLIDATION_PREVIEW_MAX_HEIGHT_PX }}
      >
        <div className="space-y-3">
          {rows.map((row) => {
            const levelActive = selection?.levelClientId === row.key;
            return (
              <section
                key={row.key}
                className={`rounded-lg transition-shadow ${levelActive ? CONSOLIDATION_PREVIEW_SELECT.levelRing : ""}`}
              >
                <div className="mb-1.5 flex items-baseline justify-between gap-2 px-0.5">
                  <h5 className="text-xs font-bold uppercase tracking-wide text-slate-600">{row.levelLabel}</h5>
                  <span className="text-[11px] tabular-nums text-slate-500">WYS {Math.round(row.levelHeightMm)} mm</span>
                </div>
                <div
                  className={`flex gap-0.5 rounded-lg border bg-white p-1 shadow-sm ${
                    levelActive ? "border-orange-300 bg-orange-50/20" : "border-slate-200/80"
                  }`}
                  style={{ height: row.bandHeightPx, minHeight: row.bandHeightPx }}
                  role="img"
                  aria-label={`${row.levelLabel}, ${row.segments.length} segmentów`}
                >
                  {row.segments.map((cell) => {
                    const occ = cell.segmentId != null ? occupancyBySegmentId?.get(cell.segmentId) : undefined;
                    const isOccupied = showOccupancy && (occ?.isOccupied ?? false);
                    const isSelected =
                      selection?.levelClientId === row.key && selection.segmentClientId === cell.key;
                    const fill = isOccupied
                      ? CONSOLIDATION_PREVIEW_CELL.occupiedBg
                      : showOccupancy
                        ? CONSOLIDATION_PREVIEW_CELL.freeBg
                        : CONSOLIDATION_PREVIEW_CELL.bg;
                    let stroke = isOccupied
                      ? CONSOLIDATION_PREVIEW_CELL.occupiedBorder
                      : showOccupancy
                        ? CONSOLIDATION_PREVIEW_CELL.freeBorder
                        : CONSOLIDATION_PREVIEW_CELL.border;
                    let borderWidth = 1.5;
                    if (isSelected) {
                      stroke = CONSOLIDATION_PREVIEW_SELECT.segmentBorder;
                      borderWidth = CONSOLIDATION_PREVIEW_SELECT.segmentBorderWidth;
                    }
                    const pctWidth = Math.max(0.04, cell.widthFraction);
                    const isCompact = pctWidth < 0.08 || row.bandHeightPx < 64;
                    const volStr =
                      cell.capacityDm3 != null ? `${cell.capacityDm3.toFixed(0)} dm³` : "— dm³";

                    return (
                      <div
                        key={cell.key}
                        role={clickable ? "button" : undefined}
                        tabIndex={clickable ? 0 : undefined}
                        onClick={clickable ? () => onSegmentClick?.(row.key, cell.key) : undefined}
                        onKeyDown={
                          clickable
                            ? (e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  onSegmentClick?.(row.key, cell.key);
                                }
                              }
                            : undefined
                        }
                        className={`flex min-w-[28px] flex-col items-center justify-center overflow-hidden rounded-md px-0.5 py-0.5 text-center ${
                          clickable ? "cursor-pointer hover:brightness-[0.97]" : ""
                        }`}
                        style={{
                          flex: `${Math.max(0.02, cell.widthFraction)} 0 0`,
                          backgroundColor: fill,
                          border: `${borderWidth}px solid ${stroke}`,
                        }}
                        title={`${cell.label}\nSZ ${Math.round(cell.widthMm)} mm · WYS ${Math.round(cell.heightMm)} mm\n${volStr}`}
                      >
                        <span className="w-full truncate font-sans text-xs font-extrabold leading-tight text-slate-900 sm:text-sm">
                          {cell.label}
                        </span>
                        {!isCompact ? (
                          <>
                            <span className="mt-0.5 font-sans text-[9px] tabular-nums text-slate-600 sm:text-[10px]">
                              {Math.round(cell.widthMm)} mm
                            </span>
                            <span className="font-sans text-[9px] tabular-nums text-slate-600 sm:text-[10px]">
                              WYS {Math.round(cell.heightMm)}
                            </span>
                            <span className="mt-0.5 font-sans text-[9px] font-medium tabular-nums text-slate-500">
                              {volStr}
                            </span>
                          </>
                        ) : (
                          <span className="mt-0.5 font-sans text-[8px] tabular-nums text-slate-500">{volStr}</span>
                        )}
                        {showOccupancy ? (
                          <div className="mt-0.5 flex w-full flex-col items-center gap-0.5">
                            <span
                              className={`rounded px-0.5 py-px text-[8px] font-bold uppercase ${
                                isOccupied ? "bg-orange-100 text-orange-900" : "bg-emerald-100 text-emerald-900"
                              }`}
                            >
                              {isOccupied ? "Zaj." : "Wol."}
                            </span>
                            {isOccupied && occ?.orderNumber && !isCompact ? (
                              <span className="max-w-full truncate font-sans text-[8px] font-semibold text-orange-950">
                                {occ.orderNumber}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      <p className="mt-2 shrink-0 px-1 text-[11px] text-slate-500">
        {clickable ? "Kliknij segment w podglądzie, aby go edytować. " : null}
        Skala proporcjonalna (max {CONSOLIDATION_PREVIEW_MAX_HEIGHT_PX}px, przewijanie wewnętrzne). Szer. regału: {rackWidth} mm.
      </p>
    </div>
  );
}
