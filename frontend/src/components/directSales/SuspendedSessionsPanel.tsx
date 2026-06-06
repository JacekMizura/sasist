import type { DirectSaleSuspendedSummary } from "../../api/directSalesApi";
import { formatAgeMinutes } from "./directSalesTerminology";

type Props = {
  rows: DirectSaleSuspendedSummary[];
  loading: boolean;
  busyId: number | null;
  onRestore: (id: number) => void;
  onCancel: (id: number) => void;
};

export function SuspendedSessionsPanel({ rows, loading, busyId, onRestore, onCancel }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Zawieszone sesje</h3>
        <span className="text-[10px] text-slate-400">{loading ? "…" : rows.length}</span>
      </div>
      {!rows.length ? (
        <p className="text-xs text-slate-500">Brak zawieszonych sesji.</p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-auto">
          {rows.map((row) => (
            <li key={row.id} className="rounded border border-slate-100 bg-slate-50 p-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-slate-900">#{row.id}</div>
                  <div className="text-slate-500">
                    {row.operator_label ?? "Operator"} · {row.line_count} poz. · {row.total_amount.toFixed(2)} zł
                  </div>
                  <div className="text-[10px] text-slate-400">{formatAgeMinutes(row.age_minutes)} temu</div>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => onRestore(row.id)}
                    className="rounded bg-sky-600 px-2 py-0.5 text-[10px] font-medium text-white disabled:opacity-50"
                  >
                    Wznów
                  </button>
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => onCancel(row.id)}
                    className="rounded border border-red-200 px-2 py-0.5 text-[10px] text-red-700 disabled:opacity-50"
                  >
                    Anuluj
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
