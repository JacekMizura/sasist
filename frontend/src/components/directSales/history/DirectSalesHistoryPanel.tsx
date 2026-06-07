import { Clock } from "lucide-react";
import type { DirectSaleHistoryEntry } from "../../../types/directSalesCompletion";
import { formatMoneyPl, paymentMethodPl } from "../directSalesTerminology";
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
    return new Date(iso).toLocaleString("pl-PL", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function DirectSalesHistoryPanel({
  rows,
  loading,
  todayOnly,
  onToggleToday,
  onSelect,
}: Props) {
  return (
    <div className="mb-6">
      {/* Nagłówek sekcji */}
      <div className="flex justify-between items-end mb-4 border-b border-blue-50 pb-2">
        <h3 className="text-xs font-semibold text-blue-900/50 uppercase tracking-wider">
          Historia sprzedaży
        </h3>
        <button
          type="button"
          onClick={onToggleToday}
          className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
        >
          {todayOnly ? "Wszystkie" : "Dziś"}
        </button>
      </div>

      {loading ? (
        <p className="text-xs font-medium text-blue-400 animate-pulse py-2">
          Ładuję…
        </p>
      ) : null}

      {!loading && !rows.length ? (
        <p className="text-xs text-slate-400 italic py-2">
          Brak zakończonych sprzedaży.
        </p>
      ) : null}

      {/* Lista historii */}
      <ul className="max-h-[35vh] overflow-y-auto pr-1 space-y-3 custom-scrollbar">
        {rows.map((row) => (
          <li key={row.session_id}>
            <button
              type="button"
              onClick={() => onSelect?.(row.session_id)}
              className="w-full flex flex-col bg-white border border-blue-50 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-blue-100 transition-all text-left group"
            >
              <div className="flex justify-between items-start w-full mb-2 gap-2">
                <span className="font-bold text-slate-800 text-sm group-hover:text-blue-700 transition-colors">
                  {row.order_number ?? `#${row.order_id}`} · {formatMoneyPl(row.total_amount)}
                </span>
                <span className="text-[11px] font-medium text-blue-900/40 flex items-center gap-1 flex-shrink-0">
                  <Clock size={12} />
                  {formatAt(row.completed_at)}
                </span>
              </div>
              
              <div className="text-xs text-slate-500 font-medium">
                {row.operator_label ?? "—"} · {paymentMethodPl(row.payment_method)}
                {row.document_number ? ` · ${row.document_number}` : ""}
              </div>

              {row.document_status ? (
                <div className="mt-3">
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