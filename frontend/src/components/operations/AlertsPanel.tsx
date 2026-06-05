import type { OperationalAlert } from "../../api/operationalAlertsApi";

type Props = {
  alerts: OperationalAlert[];
  compact?: boolean;
  onAck?: (id: number) => void;
};

const SEV_CLASS: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-800",
  WARNING: "bg-amber-100 text-amber-900",
  INFO: "bg-slate-100 text-slate-700",
};

export function AlertsPanel({ alerts, compact, onAck }: Props) {
  const rows = compact ? alerts.slice(0, 5) : alerts;
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Alerty {alerts.length ? `(${alerts.length})` : ""}
      </div>
      <ul className="max-h-64 divide-y divide-slate-50 overflow-auto">
        {rows.length === 0 ? (
          <li className="px-3 py-4 text-sm text-slate-400">Brak otwartych alertów.</li>
        ) : (
          rows.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <span
                  className={`mr-2 inline-block rounded px-1 py-0.5 text-[10px] font-semibold ${SEV_CLASS[a.severity] ?? SEV_CLASS.INFO}`}
                >
                  {a.severity}
                </span>
                <span className="text-sm text-slate-800">{a.title}</span>
                {!compact && a.message ? (
                  <p className="mt-0.5 text-xs text-slate-500">{a.message}</p>
                ) : null}
              </div>
              {onAck ? (
                <button
                  type="button"
                  className="shrink-0 text-xs text-sky-700 hover:underline"
                  onClick={() => onAck(a.id)}
                >
                  OK
                </button>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
