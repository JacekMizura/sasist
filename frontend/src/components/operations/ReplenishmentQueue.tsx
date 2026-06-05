import type { WmsOperationalTaskApi } from "../../api/wmsOperationalTasksApi";

type Props = {
  tasks: WmsOperationalTaskApi[];
  loading?: boolean;
  onAssign?: (taskId: number) => void;
  onStart?: (taskId: number) => void;
  compact?: boolean;
};

export function ReplenishmentQueue({ tasks, loading, onAssign, onStart, compact }: Props) {
  const rows = compact ? tasks.slice(0, 6) : tasks;
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Uzupełnienia {tasks.length ? `(${tasks.length})` : ""}
      </div>
      {loading ? <p className="px-3 py-4 text-sm text-slate-400">Ładowanie…</p> : null}
      <ul className="divide-y divide-slate-50">
        {rows.length === 0 && !loading ? (
          <li className="px-3 py-4 text-sm text-slate-400">Brak zadań uzupełnienia.</li>
        ) : (
          rows.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-900">
                  {t.product_name || `Produkt #${t.product_id}`}
                </div>
                <div className="text-xs text-slate-500">
                  {t.task_type} · {t.quantity_remaining}/{t.quantity_required} · P{t.priority}
                </div>
              </div>
              {!compact ? (
                <div className="flex shrink-0 gap-1">
                  {onAssign ? (
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-2 py-0.5 text-xs"
                      onClick={() => onAssign(t.id)}
                    >
                      Przypisz
                    </button>
                  ) : null}
                  {onStart ? (
                    <button
                      type="button"
                      className="rounded bg-slate-800 px-2 py-0.5 text-xs text-white"
                      onClick={() => onStart(t.id)}
                    >
                      Start
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
