import type { PurchaseHistoryFilterOptions, PurchaseHistoryQueryFilters } from "../../../api/customerPurchaseHistoryApi";
import { AppFilterPanel } from "../../../components/app-shell/AppFilterPanel";

const inp =
  "min-h-[40px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30";

type Props = {
  draft: PurchaseHistoryQueryFilters;
  options: PurchaseHistoryFilterOptions | null;
  onChange: (patch: Partial<PurchaseHistoryQueryFilters>) => void;
  onApply: () => void;
  onClear: () => void;
};

export function CustomerPurchaseHistoryFilters({ draft, options, onChange, onApply, onClear }: Props) {
  return (
    <AppFilterPanel onApply={onApply} onClear={onClear}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-xs font-medium text-slate-600">
          Data od
          <input
            type="date"
            className={inp}
            value={draft.date_from ?? ""}
            onChange={(e) => onChange({ date_from: e.target.value || undefined })}
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Data do
          <input
            type="date"
            className={inp}
            value={draft.date_to ?? ""}
            onChange={(e) => onChange({ date_to: e.target.value || undefined })}
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Kwota brutto od
          <input
            type="number"
            min={0}
            step="0.01"
            className={inp}
            value={draft.gross_min ?? ""}
            onChange={(e) =>
              onChange({ gross_min: e.target.value === "" ? undefined : Number(e.target.value) })
            }
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Kwota brutto do
          <input
            type="number"
            min={0}
            step="0.01"
            className={inp}
            value={draft.gross_max ?? ""}
            onChange={(e) =>
              onChange({ gross_max: e.target.value === "" ? undefined : Number(e.target.value) })
            }
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Status zamówienia
          <select
            className={inp}
            value={draft.order_ui_status_id ?? ""}
            onChange={(e) =>
              onChange({ order_ui_status_id: e.target.value ? Number(e.target.value) : undefined })
            }
          >
            <option value="">— wszystkie —</option>
            {(options?.statuses ?? []).map((s) => (
              <option key={String(s.id)} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Magazyn
          <select
            className={inp}
            value={draft.warehouse_id ?? ""}
            onChange={(e) =>
              onChange({ warehouse_id: e.target.value ? Number(e.target.value) : undefined })
            }
          >
            <option value="">— wszystkie —</option>
            {(options?.warehouses ?? []).map((w) => (
              <option key={String(w.id)} value={String(w.id)}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Operator
          <select
            className={inp}
            value={draft.operator_user_id ?? ""}
            onChange={(e) =>
              onChange({ operator_user_id: e.target.value ? Number(e.target.value) : undefined })
            }
          >
            <option value="">— wszyscy —</option>
            {(options?.operators ?? []).map((o) => (
              <option key={String(o.id)} value={String(o.id)}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Kanał sprzedaży
          <select
            className={inp}
            value={draft.order_channel ?? ""}
            onChange={(e) => onChange({ order_channel: e.target.value || undefined })}
          >
            <option value="">— wszystkie —</option>
            {(options?.channels ?? []).map((c) => (
              <option key={String(c.id)} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-4">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="rounded border-slate-300"
            checked={!!draft.paid_only}
            onChange={(e) => onChange({ paid_only: e.target.checked || undefined })}
          />
          Tylko opłacone
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="rounded border-slate-300"
            checked={!!draft.completed_only}
            onChange={(e) => onChange({ completed_only: e.target.checked || undefined })}
          />
          Tylko zakończone
        </label>
      </div>
    </AppFilterPanel>
  );
}
