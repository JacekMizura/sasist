import { Clock, Receipt } from "lucide-react";
import type { DirectSaleHistoryEntry } from "../../../types/directSalesCompletion";
import { formatMoneyPl } from "../directSalesTerminology";
import { DocumentStatusBadge } from "../documents/DocumentStatusBadge";
import { PaymentStatusBadge } from "../documents/PaymentStatusBadge";

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

function receiptLabel(row: DirectSaleHistoryEntry): string {
  if (row.document_number) return row.document_number;
  if (row.order_number) return row.order_number;
  if (row.order_id) return `#${row.order_id}`;
  return `Sesja #${row.session_id}`;
}

export function DirectSalesHistoryPanel({
  rows,
  loading,
  todayOnly,
  onToggleToday,
  onSelect,
}: Props) {
  return (
    <div className="mb-4 flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex shrink-0 items-end justify-between border-b border-blue-50 pb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-blue-900/50">Poprzednie transakcje</h3>
        <button
          type="button"
          onClick={onToggleToday}
          className="text-xs font-semibold text-blue-600 transition-colors hover:text-blue-800"
        >
          {todayOnly ? "Zobacz wszystkie" : "Tylko dziś"}
        </button>
      </div>

      {loading ? (
        <p className="py-2 text-xs font-medium text-blue-400 animate-pulse">Ładuję…</p>
      ) : null}

      {!loading && !rows.length ? (
        <p className="py-2 text-xs italic text-slate-400">Brak zakończonych transakcji.</p>
      ) : null}

      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
        {rows.map((row) => (
          <li key={row.session_id}>
            <button
              type="button"
              onClick={() => onSelect?.(row.session_id)}
              className="group w-full rounded-2xl border border-blue-50 bg-white p-3 text-left shadow-sm transition-all hover:border-blue-100 hover:shadow-md"
            >
              <div className="mb-1.5 flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Receipt size={14} className="shrink-0 text-blue-400" />
                  <span className="truncate text-sm font-bold text-slate-800 group-hover:text-blue-700">
                    {receiptLabel(row)}
                  </span>
                </div>
                <span className="shrink-0 text-sm font-black tabular-nums text-slate-900">
                  {formatMoneyPl(row.total_amount)}
                </span>
              </div>

              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-blue-900/40 flex items-center gap-1">
                  <Clock size={11} />
                  {formatAt(row.completed_at)}
                </span>
                <PaymentStatusBadge status={row.payment_status} />
              </div>

              {row.document_status ? (
                <DocumentStatusBadge status={row.document_status} />
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
