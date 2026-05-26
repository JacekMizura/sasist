import { BULK_ACTION_GROUPS } from "./ProductBulkActionModal";
import type { ProductBulkHubChoice } from "./productBulkHubTypes";

type Props = {
  open: boolean;
  /** Liczba produktów objętych operacją */
  affectedCount: number;
  onClose: () => void;
  /** Wybór akcji — nadrzędny ekran zamyka się, otwiera się formularz akcji */
  onSelectAction: (action: ProductBulkHubChoice) => void;
};

/**
 * Centralny hub multiakcji — wszystkie operacje masowe w jednym czytelnym panelu (bez dropdown w toolbarze).
 */
export function ProductBulkHubModal({ open, affectedCount, onClose, onSelectAction }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[260] flex items-center justify-center bg-black/45 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-bulk-hub-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(92vh,880px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-5 py-5 sm:px-7">
          <h2 id="product-bulk-hub-title" className="text-2xl font-black tracking-tight text-slate-900">
            Multiakcje
          </h2>
          <p className="mt-2 text-base font-semibold text-violet-900">
            Wybrano{" "}
            <span className="tabular-nums text-violet-950">{affectedCount}</span>{" "}
            {affectedCount === 1 ? "produkt" : "produktów"}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Wybierz operację — następnie uzupełnisz szczegóły i potwierdzisz zmianę.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex flex-col gap-8">
            {BULK_ACTION_GROUPS.map((group, gi) => (
              <section key={group.label} aria-labelledby={`bulk-gr-${gi}`}>
                <h3
                  id={`bulk-gr-${gi}`}
                  className="mb-3 border-b border-slate-200 pb-2 text-xs font-bold uppercase tracking-wider text-slate-500"
                >
                  {group.label}
                </h3>
                <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {group.actions.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        className={`w-full rounded-xl border-2 px-4 py-4 text-left text-base font-semibold shadow-sm transition active:scale-[0.99] ${
                          a.danger
                            ? "border-red-200 bg-white text-red-900 hover:border-red-400 hover:bg-red-50/70"
                            : "border-slate-200 bg-white text-slate-900 hover:border-violet-400 hover:bg-violet-50/60"
                        }`}
                        onClick={() => onSelectAction(a.id)}
                      >
                        {a.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-7">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-semibold text-slate-800 hover:bg-slate-100 sm:w-auto"
          >
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}
