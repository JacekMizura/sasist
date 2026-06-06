import type { OperationalAlert } from "../../api/operationalAlertsApi";

type Props = {
  alerts: OperationalAlert[];
  onAck: (id: number) => void;
  onCreateReplenishment?: () => void;
  onAssignPickup?: (alert: OperationalAlert) => void;
  onEscalate?: (alert: OperationalAlert) => void;
};

function suggestAction(alert: OperationalAlert): string | null {
  const t = alert.alert_type.toUpperCase();
  if (t.includes("LOW") || t.includes("REPLENISH")) return "Uzupełnij";
  if (t.includes("PICKUP")) return "Przypisz";
  if (t.includes("BLOCK")) return "Eskaluj";
  return null;
}

export function AlertsActionablePanel({
  alerts,
  onAck,
  onCreateReplenishment,
  onAssignPickup,
  onEscalate,
}: Props) {
  return (
    <ul className="divide-y divide-slate-100 rounded border border-slate-200 bg-white">
      {alerts.length === 0 ? (
        <li className="px-3 py-4 text-sm text-slate-400">Brak alertów.</li>
      ) : (
        alerts.map((a) => {
          const action = suggestAction(a);
          return (
            <li key={a.id} className="flex items-start justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900">{a.title}</div>
                {a.message ? <p className="text-xs text-slate-500">{a.message}</p> : null}
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                {action === "Uzupełnij" && onCreateReplenishment ? (
                  <button type="button" className="text-[10px] text-sky-700" onClick={onCreateReplenishment}>
                    Utwórz uzupełnienie
                  </button>
                ) : null}
                {action === "Przypisz" && onAssignPickup ? (
                  <button type="button" className="text-[10px] text-sky-700" onClick={() => onAssignPickup(a)}>
                    Przypisz operatora
                  </button>
                ) : null}
                {action === "Eskaluj" && onEscalate ? (
                  <button type="button" className="text-[10px] text-amber-700" onClick={() => onEscalate(a)}>
                    Eskaluj
                  </button>
                ) : null}
                <button type="button" className="text-[10px] text-slate-500" onClick={() => onAck(a.id)}>
                  Potwierdź
                </button>
              </div>
            </li>
          );
        })
      )}
    </ul>
  );
}
