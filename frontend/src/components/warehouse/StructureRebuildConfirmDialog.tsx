import type { StructureRemovalImpact } from "./passageStorage";
import { useEffect } from "react";

export type StructureRebuildConfirmDialogProps = {
  impacts: StructureRemovalImpact[];
  onCancel: () => void;
  onConfirm: () => void;
};

function formatCapacity(dm3: number): string {
  if (!Number.isFinite(dm3)) return "—";
  return `${Math.round(dm3)} dm³`;
}

function formatMoney(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
}

/** Confirm destructive location rebuild before layout save. Stock / active ops block confirm. */
export function StructureRebuildConfirmDialog({
  impacts,
  onCancel,
  onConfirm,
}: StructureRebuildConfirmDialogProps) {
  const hasStock = impacts.some((i) => i.hasStock);
  const hasActiveOps = impacts.some((i) => i.hasActiveOperations);
  const blocked = hasStock || hasActiveOps;
  const stockedCount = impacts.reduce(
    (s, i) => s + i.removed.filter((r) => r.hasStock).length,
    0
  );
  const allActiveOps = impacts.flatMap((i) => i.activeOperations ?? []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="structure-rebuild-title"
      onClick={onCancel}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <h2 id="structure-rebuild-title" className="text-base font-bold text-slate-900">
              {blocked ? "Przebudowa zablokowana" : "Podgląd przebudowy lokalizacji"}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {hasActiveOps
                ? "Nie można przebudować regału. Usuwane lokalizacje są wykorzystywane przez aktywne operacje magazynowe."
                : hasStock
                  ? `Nie można zapisać zmian, dopóki na usuwanych lokalizacjach jest towar (${stockedCount}). Przenieś towar, potem zapisz ponownie.`
                  : "Zmiana struktury (w tym przejazd pod regałem) zmieni lokalizacje. Nic nie zostanie zapisane bez Twojej decyzji."}
            </p>
          </div>
          <button
            type="button"
            aria-label="Zamknij"
            className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            onClick={onCancel}
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {hasActiveOps && (
            <div className="rounded-lg border-2 border-rose-400 bg-rose-50 px-3 py-3 text-sm text-rose-950">
              <p className="font-bold">Aktywne operacje magazynowe</p>
              <ul className="mt-2 space-y-1 text-[13px]">
                {allActiveOps.map((op, idx) => (
                  <li key={`${op.locationUuid}-${op.documentNumber}-${idx}`}>
                    <span className="font-mono font-semibold">{op.locationLabel}</span>
                    {" — "}
                    <span>{op.operationType}</span>
                    {" · "}
                    <span className="font-mono">{op.documentNumber}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {hasStock && (
            <div className="rounded-lg border-2 border-rose-400 bg-rose-50 px-3 py-3 text-sm text-rose-950">
              <p className="font-bold">Operacja zablokowana — towar na lokalizacjach do usunięcia</p>
              <p className="mt-1 text-[13px] text-rose-900/90">
                Poniżej widać produkt, ilość i wartość. Przenieś te pozycje na inne lokalizacje.
              </p>
            </div>
          )}

          {impacts.map((impact) => (
            <div key={impact.rackKey} className="rounded-lg border border-slate-200 p-3 space-y-3">
              <p className="text-sm font-semibold text-slate-800">Regał {impact.rackLabel}</p>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="font-semibold uppercase tracking-wide text-slate-500">Stan obecny</p>
                  <p className="mt-1 text-slate-800">
                    Lokalizacje: <span className="font-mono font-semibold">{impact.beforeLocationCount}</span>
                  </p>
                  <p className="text-slate-800">
                    Pojemność: <span className="font-mono font-semibold">{formatCapacity(impact.beforeCapacityDm3)}</span>
                  </p>
                </div>
                <div className="rounded-md border border-cyan-200 bg-cyan-50/60 px-3 py-2">
                  <p className="font-semibold uppercase tracking-wide text-cyan-700">Po zmianie</p>
                  <p className="mt-1 text-slate-800">
                    Lokalizacje: <span className="font-mono font-semibold">{impact.afterLocationCount}</span>
                  </p>
                  <p className="text-slate-800">
                    Pojemność: <span className="font-mono font-semibold">{formatCapacity(impact.afterCapacityDm3)}</span>
                  </p>
                </div>
              </div>

              {impact.created.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-emerald-800">+ Utworzone ({impact.created.length})</p>
                  <ul className="mt-1 max-h-28 overflow-y-auto space-y-0.5 text-xs text-slate-700">
                    {impact.created.map((row) => (
                      <li key={`c-${row.locationUUID ?? row.label}-${row.level_index}-${row.segment_index}`}>
                        <span className="text-emerald-700 font-semibold">+</span>{" "}
                        <span className="font-mono">{row.label || "(bez etykiety)"}</span>
                        <span className="ml-2 text-slate-500">poziom konstrukcyjny {row.constructionLevel}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {impact.removedCount > 0 && (
                <div>
                  <p className="text-xs font-semibold text-rose-800">− Usunięte ({impact.removedCount})</p>
                  <ul className="mt-1 max-h-40 overflow-y-auto space-y-2 text-xs text-slate-700">
                    {impact.removed.map((row) => (
                      <li
                        key={`r-${row.locationUUID ?? row.label}-${row.level_index}-${row.segment_index}`}
                        className={row.hasStock ? "rounded-md border border-rose-200 bg-rose-50/80 px-2 py-1.5" : ""}
                      >
                        <div>
                          <span className="text-rose-700 font-semibold">−</span>{" "}
                          <span className="font-mono">{row.label || "(bez etykiety)"}</span>
                          <span className="ml-2 text-slate-500">poziom konstrukcyjny {row.constructionLevel}</span>
                        </div>
                        {row.hasStock && row.stockLines.length === 0 && (
                          <p className="mt-0.5 text-rose-800 font-medium">{row.stockHint}</p>
                        )}
                        {row.stockLines.length > 0 && (
                          <ul className="mt-1 space-y-1 border-t border-rose-200/80 pt-1">
                            {row.stockLines.map((line, idx) => (
                              <li key={`${row.label}-stock-${idx}`} className="text-rose-950">
                                <span className="font-semibold">{line.productName}</span>
                                <span className="ml-2 font-mono">
                                  {line.quantity} {line.unit}
                                </span>
                                <span className="ml-2 text-rose-800/90">wartość: {formatMoney(line.valuePln)}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {impact.created.length === 0 && impact.removedCount === 0 && (
                <p className="text-xs text-slate-500">
                  Zmiana numeracji / indeksów bez dodawania ani usuwania lokalizacji.
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={onCancel}
          >
            Anuluj
          </button>
          {!blocked && (
            <button
              type="button"
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              onClick={onConfirm}
            >
              Przebuduj i zapisz
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
