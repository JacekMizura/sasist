import type { RackStructureDraft } from "./rackStructureModel";
import {
  buildConsolidationPreviewRows,
  CONSOLIDATION_PREVIEW_CELL,
  CONSOLIDATION_PREVIEW_MAX_HEIGHT_PX,
} from "./consolidationRackPreviewLayout";

type Props = {
  draft: RackStructureDraft;
  className?: string;
  showOccupancy?: boolean;
  occupancyBySegmentId?: Map<number, { orderNumber?: string | null; tone?: string }>;
};

/**
 * Podgląd regału kompletacyjnego — wzorowany na `RackPreview` z Twórcy szablonu:
 * poziomy z etykietą, segmenty z nazwą + wymiary + pojemność, fit-to-view (max ~640px).
 */
export default function ConsolidationRackStructurePreview({
  draft,
  className = "",
  showOccupancy = false,
  occupancyBySegmentId,
}: Props) {
  const rows = buildConsolidationPreviewRows(draft);

  if (rows.length === 0) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500">
        Dodaj poziom regału.
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${className}`}>
      <h4 className="shrink-0 px-1 pb-2 text-sm font-bold text-slate-600">Podgląd regału — na żywo</h4>
      <div
        className="overflow-y-auto rounded-xl border border-slate-200/35 bg-slate-50/20 p-3"
        style={{ maxHeight: CONSOLIDATION_PREVIEW_MAX_HEIGHT_PX }}
      >
        <div className="space-y-4">
          {rows.map((row) => (
            <section key={row.key}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <h5 className="text-xs font-bold uppercase tracking-wide text-slate-600">{row.levelLabel}</h5>
                <span className="text-[11px] tabular-nums text-slate-500">WYS {Math.round(row.levelHeightMm)} mm</span>
              </div>
              <div
                className="flex min-h-[88px] gap-1 rounded-lg border border-slate-200/80 bg-white p-1 shadow-sm"
                role="img"
                aria-label={`${row.levelLabel}, ${row.segments.length} segmentów`}
              >
                {row.segments.map((cell) => {
                  const occ = cell.segmentId != null ? occupancyBySegmentId?.get(cell.segmentId) : undefined;
                  const isOccupied = Boolean(occ?.orderNumber);
                  const fill = isOccupied ? CONSOLIDATION_PREVIEW_CELL.occupiedBg : CONSOLIDATION_PREVIEW_CELL.bg;
                  const stroke = isOccupied ? CONSOLIDATION_PREVIEW_CELL.occupiedBorder : CONSOLIDATION_PREVIEW_CELL.border;
                  const isCompact = cell.flexGrow < 0.12;
                  const volStr =
                    cell.capacityDm3 != null ? `${cell.capacityDm3.toFixed(0)} dm³` : "— dm³";
                  const dimsLine = `SZ ${Math.round(cell.widthMm)} · GŁ ${Math.round(cell.depthMm)} · WYS ${Math.round(cell.heightMm)}`;

                  return (
                    <div
                      key={cell.key}
                      className="flex min-w-[52px] flex-col items-center justify-center rounded-md px-1 py-2 text-center transition-colors"
                      style={{
                        flex: `${cell.flexGrow} 1 0`,
                        backgroundColor: fill,
                        border: `1.5px solid ${stroke}`,
                      }}
                      title={`${cell.label}\n${dimsLine}\n${volStr}`}
                    >
                      <span className="font-sans text-base font-extrabold leading-tight text-slate-900 sm:text-lg">
                        {cell.label}
                      </span>
                      {!isCompact ? (
                        <>
                          <span className="mt-1 font-sans text-[11px] leading-snug text-slate-600 sm:text-xs">
                            {dimsLine}
                          </span>
                          <span className="mt-0.5 font-sans text-[10px] text-slate-500 sm:text-[11px]">
                            {volStr}
                          </span>
                        </>
                      ) : (
                        <span className="mt-0.5 font-sans text-[9px] text-slate-500">{volStr}</span>
                      )}
                      {showOccupancy && occ?.orderNumber ? (
                        <span className="mt-1 max-w-full truncate font-sans text-[9px] font-semibold text-orange-900">
                          {occ.orderNumber}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
      <p className="mt-2 shrink-0 px-1 text-[11px] text-slate-500">
        Podgląd skalowany do czytelności (max {CONSOLIDATION_PREVIEW_MAX_HEIGHT_PX}px). Szerokości segmentów są
        proporcjonalne; wysokość pasa poziomu nie odwzorowuje mm 1:1.
      </p>
    </div>
  );
}
