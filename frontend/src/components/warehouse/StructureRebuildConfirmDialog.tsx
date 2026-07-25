import type { StructureRemovalImpact } from "./passageStorage";

export type StructureRebuildConfirmDialogProps = {
  impacts: StructureRemovalImpact[];
  onCancel: () => void;
  onConfirm: () => void;
};

/** Confirm destructive location rebuild before layout save. Stock blocks confirm. */
export function StructureRebuildConfirmDialog({
  impacts,
  onCancel,
  onConfirm,
}: StructureRebuildConfirmDialogProps) {
  const totalRemoved = impacts.reduce((s, i) => s + i.removedCount, 0);
  const hasStock = impacts.some((i) => i.hasStock);
  const stockedCount = impacts.reduce(
    (s, i) => s + i.removed.filter((r) => r.hasStock).length,
    0
  );

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="structure-rebuild-title"
      onClick={onCancel}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 id="structure-rebuild-title" className="text-base font-bold text-slate-900">
            {hasStock ? "Przebudowa zablokowana" : "Przebudowa lokalizacji regału"}
          </h2>
          {hasStock ? (
            <p className="mt-1 text-sm text-slate-600">
              Nie można przebudować regału, dopóki usuwane lokalizacje mają stan magazynowy (
              {stockedCount} {stockedCount === 1 ? "lokalizacja" : "lokalizacji"}). Opróżnij je
              (przenieś towar) albo uruchom świadomy proces migracji — potem zapisz ponownie.
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-600">
              Zmiana struktury (w tym przejazd pod regałem) usunie {totalRemoved}{" "}
              {totalRemoved === 1 ? "lokalizację" : "lokalizacji"}. Nic nie zostanie usunięte bez
              Twojej akceptacji.
            </p>
          )}
          {hasStock && (
            <p className="mt-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900">
              Operacja zablokowana — aktywny stock na lokalizacjach przeznaczonych do usunięcia.
            </p>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {impacts.map((impact) => (
            <div key={impact.rackKey} className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-800">
                Regał {impact.rackLabel} — usuwane: {impact.removedCount}
              </p>
              <ul className="mt-2 max-h-40 overflow-y-auto text-xs text-slate-700 space-y-1">
                {impact.removed.map((row) => (
                  <li key={`${row.locationUUID ?? row.label}-${row.level_index}-${row.segment_index}`}>
                    <span className="font-mono">{row.label || "(bez etykiety)"}</span>
                    <span className={row.hasStock ? "ml-2 text-rose-700 font-semibold" : "ml-2 text-slate-500"}>
                      ({row.stockHint})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={onCancel}
          >
            {hasStock ? "Zamknij" : "Anuluj"}
          </button>
          {!hasStock && (
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
