import { useNavigate } from "react-router-dom";

import type { OperationalAlert } from "../../../api/operationalAlertsApi";
import { WMS_ROUTES } from "../../../pages/wms/wmsRoutes";
import {
  alertSeverityEmoji,
  taskTypeLabel,
} from "../../../services/operations/operationsTerminology";
import { safeIncludes, safeUpper } from "../../../utils/safeStrings";

type Props = {
  alerts: OperationalAlert[];
  onAck: (id: number) => void;
  onCreateReplenishment?: () => void;
  onEscalate?: (alert: OperationalAlert) => void;
};

function describeAlert(a: OperationalAlert): string {
  if (a.message) return a.message;
  const t = safeUpper(a.alert_type);
  if (safeIncludes(t, "LOW") || safeIncludes(t, "REPLENISH")) {
    return "Produkt wymaga uzupełnienia na półce sprzedażowej.";
  }
  if (safeIncludes(t, "SLA")) return "Zamówienie zbliża się do limitu czasu realizacji.";
  if (safeIncludes(t, "IDLE")) return "Operator długo bez aktywności.";
  if (safeIncludes(t, "BLOCK")) return "Zadanie zablokowane — wymaga decyzji.";
  return a.title;
}

function severityBorder(severity: string): string {
  const s = safeUpper(severity);
  if (s === "CRITICAL" || s === "HIGH") return "border-l-red-500 bg-red-50/40";
  if (s === "WARNING" || s === "MEDIUM") return "border-l-amber-500 bg-amber-50/40";
  return "border-l-sky-500";
}

export function AlertsFeed({ alerts, onAck, onCreateReplenishment, onEscalate }: Props) {
  const navigate = useNavigate();

  return (
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
      {alerts.length === 0 ? (
        <li className="px-4 py-10 text-center">
          <p className="text-sm font-medium text-slate-700">Brak aktywnych alertów</p>
          <p className="mt-1 text-xs text-slate-500">
            System nie wykrył sytuacji wymagających natychmiastowej reakcji.
          </p>
        </li>
      ) : (
        alerts.map((a) => {
          const isReplenish = safeIncludes(a.alert_type, "LOW") || safeIncludes(a.alert_type, "REPLENISH");
          return (
            <li
              key={a.id}
              className={`border-l-4 px-3 py-3 ${severityBorder(a.severity)}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span aria-hidden>{alertSeverityEmoji(a.severity)}</span>
                    <span className="text-sm font-semibold text-slate-900">{a.title}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-600">{describeAlert(a)}</p>
                  {a.entity_id ? (
                    <p className="mt-1 text-[10px] text-slate-400">
                      Dotyczy: {taskTypeLabel(a.entity_type)} #{a.entity_id}
                    </p>
                  ) : null}
                  {a.created_at ? (
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {new Date(a.created_at).toLocaleString("pl-PL")}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => navigate(WMS_ROUTES.operationsReplenishment)}
                    className="rounded bg-slate-800 px-2 py-1 text-[10px] font-medium text-white"
                  >
                    Otwórz
                  </button>
                  {isReplenish && onCreateReplenishment ? (
                    <button
                      type="button"
                      className="rounded border border-slate-200 px-2 py-1 text-[10px]"
                      onClick={onCreateReplenishment}
                    >
                      Uzupełnij
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="rounded border border-slate-200 px-2 py-1 text-[10px]"
                      onClick={() => navigate(WMS_ROUTES.operationsTasks)}
                    >
                      Przypisz
                    </button>
                  )}
                  {onEscalate ? (
                    <button
                      type="button"
                      className="text-[10px] text-amber-700"
                      onClick={() => onEscalate(a)}
                    >
                      Eskaluj
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="text-[10px] text-slate-500"
                    onClick={() => onAck(a.id)}
                  >
                    Rozwiąż
                  </button>
                </div>
              </div>
            </li>
          );
        })
      )}
    </ul>
  );
}
