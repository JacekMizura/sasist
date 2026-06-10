import { useState } from "react";
import { ChevronDown } from "lucide-react";

import type { PurchaseHistoryFilterOptions, PurchaseHistoryQueryFilters } from "../../../api/customerPurchaseHistoryApi";

const inp =
  "mt-1 min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30";

const labelClass = "block text-xs font-medium text-slate-600";

type Props = {
  draft: PurchaseHistoryQueryFilters;
  options: PurchaseHistoryFilterOptions | null;
  onChange: (patch: Partial<PurchaseHistoryQueryFilters>) => void;
  onApply: () => void;
  onClear: () => void;
};

export function CustomerPurchaseHistoryFilters({ draft, options, onChange, onApply, onClear }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const hasMoreActive =
    draft.order_ui_status_id != null || draft.warehouse_id != null;

  return (
    <section className="rounded-lg border border-slate-200/90 bg-white p-4 shadow-none">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className={labelClass}>
          Data od
          <input
            type="date"
            className={inp}
            value={draft.date_from ?? ""}
            onChange={(e) => onChange({ date_from: e.target.value || undefined })}
          />
        </label>
        <label className={labelClass}>
          Data do
          <input
            type="date"
            className={inp}
            value={draft.date_to ?? ""}
            onChange={(e) => onChange({ date_to: e.target.value || undefined })}
          />
        </label>
        <label className={labelClass}>
          Kwota brutto od
          <input
            type="number"
            min={0}
            step="0.01"
            className={inp}
            placeholder="0,00"
            value={draft.gross_min ?? ""}
            onChange={(e) =>
              onChange({ gross_min: e.target.value === "" ? undefined : Number(e.target.value) })
            }
          />
        </label>
        <label className={labelClass}>
          Kwota brutto do
          <input
            type="number"
            min={0}
            step="0.01"
            className={inp}
            placeholder="0,00"
            value={draft.gross_max ?? ""}
            onChange={(e) =>
              onChange({ gross_max: e.target.value === "" ? undefined : Number(e.target.value) })
            }
          />
        </label>
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-slate-900"
          aria-expanded={moreOpen}
        >
          Więcej filtrów
          {hasMoreActive ? (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800">
              aktywne
            </span>
          ) : null}
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${moreOpen ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>

        {moreOpen ? (
          <div className="mt-3 grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
            <label className={labelClass}>
              Status dokumentu
              <select
                className={inp}
                value={draft.order_ui_status_id ?? ""}
                onChange={(e) =>
                  onChange({ order_ui_status_id: e.target.value ? Number(e.target.value) : undefined })
                }
              >
                <option value="">Wszystkie</option>
                {(options?.statuses ?? []).map((s) => (
                  <option key={String(s.id)} value={String(s.id)}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Magazyn
              <select
                className={inp}
                value={draft.warehouse_id ?? ""}
                onChange={(e) =>
                  onChange({ warehouse_id: e.target.value ? Number(e.target.value) : undefined })
                }
              >
                <option value="">Wszystkie</option>
                {(options?.warehouses ?? []).map((w) => (
                  <option key={String(w.id)} value={String(w.id)}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onApply}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Filtruj
        </button>
        <button
          type="button"
          onClick={() => {
            setMoreOpen(false);
            onClear();
          }}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Wyczyść filtry
        </button>
      </div>
    </section>
  );
}
