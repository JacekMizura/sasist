import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import type { AlertView } from "../wms/supply-flow/utils/shiftBoard";
import { markLeavingForWork } from "../wms/supply-flow/utils/shiftBoard";

type Props = {
  alerts: AlertView[];
  blockedOrders?: number;
};

const MAX_ALERTS = 3;

/** Tylko rzeczy wymagające reakcji — bez ściany informacji. */
export function PulpitActionAlerts({ alerts, blockedOrders = 0 }: Props) {
  const actionable = alerts.filter((a) => a.severity === "critical" || a.severity === "warning").slice(0, MAX_ALERTS);
  const showBlocked = blockedOrders > 0 && actionable.length < MAX_ALERTS;

  if (!actionable.length && !showBlocked) {
    return <p className="text-sm text-slate-500">Brak alertów wymagających reakcji.</p>;
  }

  return (
    <ul className="space-y-2">
      {actionable.map((a, i) => (
        <li
          key={`${a.title}-${i}`}
          className={`flex flex-wrap items-start justify-between gap-2 rounded-xl border px-3 py-2.5 ${
            a.severity === "critical"
              ? "border-rose-200 bg-rose-50"
              : "border-amber-200 bg-amber-50"
          }`}
        >
          <div className="flex min-w-0 gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 opacity-80" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900">{a.title}</p>
              {a.detail ? <p className="text-xs text-slate-600 mt-0.5">{a.detail}</p> : null}
            </div>
          </div>
          <Link
            to={a.ctaHref}
            onClick={() =>
              markLeavingForWork({ leftAt: Date.now(), title: a.title, deliveryId: null })
            }
            className="shrink-0 text-xs font-bold underline underline-offset-2"
          >
            {a.ctaLabel}
          </Link>
        </li>
      ))}
      {showBlocked ? (
        <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-sm font-bold text-slate-900">
            Zablokowane zamówienia: {blockedOrders}
          </p>
          <Link to="/wms/braki" className="text-xs font-bold underline underline-offset-2">
            Otwórz braki
          </Link>
        </li>
      ) : null}
    </ul>
  );
}
