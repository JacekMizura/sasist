import { useNavigate } from "react-router-dom";

import type { ActionFeedItem } from "../../../hooks/operations/useOperationsDashboard";
import { WMS_ROUTES } from "../../../pages/wms/wmsRoutes";

const SEV_BORDER: Record<ActionFeedItem["severity"], string> = {
  critical: "border-l-red-500",
  warning: "border-l-amber-500",
  info: "border-l-sky-500",
};

type Props = {
  items: ActionFeedItem[];
  onAckAlert?: (id: number) => void;
};

function routeForAction(action: string): string | null {
  switch (action) {
    case "replenishment":
      return WMS_ROUTES.operationsReplenishment;
    case "tasks":
      return WMS_ROUTES.operationsTasks;
    case "operators":
      return WMS_ROUTES.operationsOperators;
    case "alerts":
      return WMS_ROUTES.operationsAlerts;
    default:
      return null;
  }
}

export function ActionFeedPanel({ items, onAckAlert }: Props) {
  const navigate = useNavigate();

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 px-3 py-2">
        <h2 className="text-sm font-semibold text-slate-900">Wymaga reakcji</h2>
        <p className="text-[11px] text-slate-500">Co powinien zrobić magazyn teraz?</p>
      </header>
      <ul className="min-h-0 flex-1 divide-y divide-slate-50 overflow-auto">
        {items.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-slate-500">
            <p className="font-medium text-slate-700">Wszystko pod kontrolą</p>
            <p className="mt-1 text-xs">Brak pilnych sytuacji wymagających interwencji.</p>
          </li>
        ) : (
          items.map((it) => (
            <li
              key={it.id}
              className={`border-l-4 px-3 py-2.5 ${SEV_BORDER[it.severity]}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-slate-900">{it.text}</p>
                  {it.at ? (
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {new Date(it.at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  {it.ctaPrimary ? (
                    <button
                      type="button"
                      onClick={() => {
                        const to = routeForAction(it.ctaPrimary!.action);
                        if (to) navigate(to);
                        else if (it.alertId && onAckAlert) onAckAlert(it.alertId);
                      }}
                      className="rounded bg-slate-800 px-2 py-1 text-[10px] font-medium text-white"
                    >
                      {it.ctaPrimary.label}
                    </button>
                  ) : null}
                  {it.ctaSecondary ? (
                    <button
                      type="button"
                      onClick={() => navigate(WMS_ROUTES.operationsAlerts)}
                      className="rounded border border-slate-200 px-2 py-1 text-[10px] text-slate-600"
                    >
                      {it.ctaSecondary.label}
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
