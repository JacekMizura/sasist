import { PlayCircle, Trash2, Clock } from "lucide-react";
import type { DirectSaleSuspendedSummary } from "../../api/directSalesApi";
import { formatAgeMinutes, formatMoneyPl } from "./directSalesTerminology";

type Props = {
  rows: DirectSaleSuspendedSummary[];
  loading: boolean;
  busyId: number | null;
  onRestore: (id: number) => void;
  onCancel: (id: number) => void;
};

export function SuspendedSessionsPanel({ rows, loading, busyId, onRestore, onCancel }: Props) {
  // Stan pusty - "wtopiony", o którym mówiliśmy wcześniej, żeby nie zajmował uwagi
  if (!rows.length && !loading) {
    return (
      <div className="flex justify-between items-center opacity-40 px-1 mb-4">
        <h2 className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
          Zawieszone sesje
        </h2>
        <span className="text-[10px] font-bold text-slate-500">0</span>
      </div>
    );
  }

  // Stan z danymi (lub ładowaniem)
  return (
    <div className="mb-6">
      <div className="flex justify-between items-end mb-4 border-b border-blue-50 pb-2">
        <h3 className="text-xs font-semibold text-blue-900/50 uppercase tracking-wider">
          Zawieszone sesje
        </h3>
        <span className="text-xs font-bold text-blue-600">
          {loading ? "…" : rows.length}
        </span>
      </div>

      <ul className="max-h-[35vh] overflow-y-auto pr-1 space-y-3 custom-scrollbar">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-col bg-white border border-blue-50 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all"
          >
            {/* Nagłówek karty z czasem */}
            <div className="flex justify-between items-start mb-2">
              <div className="font-bold text-slate-800 text-sm">#{row.id}</div>
              <div className="text-[11px] font-medium text-blue-900/40 flex items-center gap-1">
                <Clock size={12} /> {formatAgeMinutes(row.age_minutes)} temu
              </div>
            </div>

            {/* Informacje o sesji */}
            <div className="text-xs text-slate-500 font-medium mb-4">
              {row.operator_label ?? "Operator"} · {row.line_count} poz. ·{" "}
              <span className="text-slate-700 font-bold">
                {formatMoneyPl(row.total_amount)}
              </span>
            </div>

            {/* Przyciski akcji zoptymalizowane pod dotyk i czytelność */}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busyId === row.id}
                onClick={() => onRestore(row.id)}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-blue-50 px-2 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50 disabled:hover:bg-blue-50 transition-colors"
              >
                <PlayCircle size={16} /> Wznów
              </button>
              <button
                type="button"
                disabled={busyId === row.id}
                onClick={() => onCancel(row.id)}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-red-100 bg-red-50 px-2 py-2 text-xs font-bold text-red-600 hover:bg-red-100 disabled:opacity-50 disabled:hover:bg-red-50 transition-colors"
              >
                <Trash2 size={16} /> Anuluj
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}