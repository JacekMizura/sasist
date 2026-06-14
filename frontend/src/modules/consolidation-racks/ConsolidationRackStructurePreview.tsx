import type { RackStructureDraft } from "./rackStructureModel";
import type { SegmentSelection } from "./rackStructureModel";
import {
  buildConsolidationPreviewRows,
  CONSOLIDATION_PREVIEW_CELL,
  CONSOLIDATION_PREVIEW_MAX_HEIGHT_PX,
  CONSOLIDATION_PREVIEW_SELECT,
  formatPreviewDimsLine,
  formatPreviewDimsMultiline,
  type SegmentOccupancyInfo,
} from "./consolidationRackPreviewLayout";

const UPRIGHT = "#2563eb";

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
      <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white text-sm text-slate-500">
        Dodaj poziom regału.
      </div>
    );
  }

  return (
    <div className={`flex min-h-0 flex-col bg-white ${className}`}>
      <h4 className="shrink-0 px-1 pb-2 text-sm font-bold text-slate-600">Podgląd regału — na żywo</h4>
      <div
        className="min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3"
        style={{ maxHeight: CONSOLIDATION_PREVIEW_MAX_HEIGHT_PX }}
      >
        <div className="space-y-0">
          {rows.map((row, rowIdx) => {
            const levelActive = selection?.levelClientId === row.key;
            return (
              <section key={row.key} className={rowIdx > 0 ? "border-t-2 border-orange-500/45 pt-2" : ""}>
                <div
                  className={`mb-1.5 flex items-baseline justify-between gap-2 px-0.5 transition-shadow ${
                    levelActive ? CONSOLIDATION_PREVIEW_SELECT.levelRing : ""
                  }`}
                >
                  <h5 className="text-xs font-bold uppercase tracking-wide text-slate-600">{row.levelLabel}</h5>
                  <span className="text-[11px] tabular-nums text-slate-500">WYS {Math.round(row.levelHeightMm)} mm</span>
                </div>
                <div className="flex gap-1" style={{ height: row.bandHeightPx, minHeight: row.bandHeightPx }}>
                  <div className="w-1.5 shrink-0 rounded-sm" style={{ backgroundColor: UPRIGHT }} aria-hidden />
                  <div
                    className={`flex min-w-0 flex-1 gap-0.5 rounded-sm border bg-white p-0.5 ${
                      levelActive ? "border-orange-300" : "border-slate-200"
                    }`}
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
                      const isCompact = pctWidth < 0.1 || row.bandHeightPx < 80;
                      const isMedium = !isCompact && (pctWidth < 0.14 || row.bandHeightPx < 100);
                      const volStr =
                        cell.capacityDm3 != null ? `${cell.capacityDm3.toFixed(0)} dm³` : "— dm³";
                      const [sz, gl, wys] = formatPreviewDimsMultiline(
                        cell.widthMm,
                        cell.depthMm,
                        cell.heightMm,
                      );
                      const dimsOneLine = formatPreviewDimsLine(
                        cell.widthMm,
                        cell.depthMm,
                        cell.heightMm,
                        isMedium,
                      );

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
                          className={`flex min-w-[32px] flex-col items-center justify-center overflow-hidden rounded px-0.5 py-0.5 text-center ${
                            clickable ? "cursor-pointer hover:brightness-[0.98]" : ""
                          }`}
                          style={{
                            flex: `${Math.max(0.02, cell.widthFraction)} 0 0`,
                            backgroundColor: fill,
                            border: `${borderWidth}px solid ${stroke}`,
                          }}
                          title={`${cell.label}\n${sz} · ${gl.replace("GŁ ", "GŁ ")} · ${wys}\n${volStr}`}
                        >
                          <span className="w-full truncate font-sans text-sm font-extrabold leading-tight text-slate-900">
                            {cell.label}
                          </span>
                          {isCompact ? (
                            <>
                              <span className="mt-0.5 font-sans text-[8px] tabular-nums leading-tight text-slate-600">
                                {dimsOneLine}
                              </span>
                              <span className="font-sans text-[8px] tabular-nums text-slate-500">{volStr}</span>
                            </>
                          ) : isMedium ? (
                            <>
                              <span className="mt-0.5 font-sans text-[9px] tabular-nums text-slate-600">{dimsOneLine}</span>
                              <span className="mt-0.5 font-sans text-[9px] font-medium tabular-nums text-slate-500">
                                {volStr}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="mt-0.5 font-sans text-[10px] tabular-nums text-slate-600">{sz}</span>
                              <span className="font-sans text-[10px] tabular-nums text-slate-600">{gl}</span>
                              <span className="font-sans text-[10px] tabular-nums text-slate-600">{wys}</span>
                              <span className="mt-0.5 font-sans text-[10px] font-medium tabular-nums text-slate-500">
                                {volStr}
                              </span>
                            </>
                          )}
                          {showOccupancy ? (
                            <span
                              className={`mt-0.5 rounded px-0.5 text-[7px] font-bold uppercase ${
                                isOccupied ? "bg-orange-100 text-orange-900" : "bg-emerald-100 text-emerald-900"
                              }`}
                            >
                              {isOccupied ? "Zaj." : "Wol."}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  <div className="w-1.5 shrink-0 rounded-sm" style={{ backgroundColor: UPRIGHT }} aria-hidden />
                </div>
              </section>
            );
          })}
        </div>
      </div>
      <p className="mt-2 shrink-0 px-1 text-[11px] text-slate-500">
        {clickable ? "Kliknij segment w podglądzie, aby otworzyć panel edycji. " : null}
        Skala proporcjonalna (max {CONSOLIDATION_PREVIEW_MAX_HEIGHT_PX}px). Szer. regału: {rackWidth} mm.
      </p>
    </div>
  );
}
