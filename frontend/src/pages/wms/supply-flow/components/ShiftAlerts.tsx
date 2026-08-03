import { Link } from "react-router-dom";
import { AlertTriangle, Ban } from "lucide-react";
import type { AlertView } from "../utils/shiftBoard";
import { markLeavingForWork } from "../utils/shiftBoard";

type Props = { alerts: AlertView[] };

export function ShiftAlerts({ alerts }: Props) {
  if (!alerts.length) return null;
  return (
    <div className="space-y-2">
      {alerts.map((a, i) => (
        <div
          key={`${a.title}-${i}`}
          className={`rounded-xl border px-4 py-3 ${
            a.severity === "critical"
              ? "border-rose-300 bg-rose-50 text-rose-950"
              : "border-amber-300 bg-amber-50 text-amber-950"
          }`}
          role="alert"
        >
          <div className="flex gap-3">
            {a.severity === "critical" ? (
              <AlertTriangle className="shrink-0 mt-0.5" size={20} />
            ) : (
              <Ban className="shrink-0 mt-0.5" size={20} />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black">{a.title}</p>
              {a.detail ? <p className="text-xs mt-0.5 opacity-90">{a.detail}</p> : null}
              <Link
                to={a.ctaHref}
                onClick={() =>
                  markLeavingForWork({
                    leftAt: Date.now(),
                    title: a.title,
                    deliveryId: null,
                  })
                }
                className="inline-flex mt-2 text-xs font-black underline underline-offset-2"
              >
                {a.ctaLabel} →
              </Link>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
