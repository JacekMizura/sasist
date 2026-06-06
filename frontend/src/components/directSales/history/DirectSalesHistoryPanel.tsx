import type { DirectSaleHistoryEntry } from "../../../types/directSalesCompletion";
import { paymentMethodPl } from "../directSalesTerminology";
import { DocumentStatusBadge } from "../documents/DocumentStatusBadge";

type Props = {
  rows: DirectSaleHistoryEntry[];
  loading: boolean;
  todayOnly: boolean;
  onToggleToday: () => void;
  onSelect?: (sessionId: number) => void;
};

function formatAt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export function DirectSalesHistoryPanel({ rows, loading, todayOnly, onToggleToday, onSelect }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Historia sprzedaży</h3>
        <button type="button" onClick={onToggleToday} className="text-[10px] text-sky-700">
          {todayOnly ? "Wszystkie" : "Dziś"}
        </button>
      </div>
      {loading ? <p className="text-xs text-slate-400">Ładuję…</p> : null}
      {!loading && !rows.length ? <p className="text-xs text-slate-500">Brak zakończonych sprzedaży.</p> : null}
      <ul className="max-h-44 space-y-1 overflow-auto">
        {rows.map((row) => (
          <li key={row.session_id}>
            <button
              type="button"
              onClick={() => onSelect?.(row.session_id)}
              className="flex w-full flex-col rounded border border-slate-100 bg-slate-50 px-2 py-1.5 text-left text-xs hover:bg-sky-50"
            >
              <div className="flex justify-between gap-2">
                <span className="font-medium text-slate-900">
                  {row.order_number ?? `#${row.order_id}`} · {row.total_amount.toFixed(2)} zł
                </span>
                <span className="text-slate-400">{formatAt(row.completed_at)}</span>
              </div>
              <div className="text-slate-500">
                {row.operator_label ?? "—"} · {paymentMethodPl(row.payment_method)}
                {row.document_number ? ` · ${row.document_number}` : ""}
              </div>
              {row.document_status ? (
                <div className="mt-0.5">
                  <DocumentStatusBadge status={row.document_status} />
                </div>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
