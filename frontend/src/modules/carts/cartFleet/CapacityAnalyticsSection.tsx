import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import {
  fetchCartLatestCapacityRun,
  type CapacityAnalyticsRun,
} from "../../../api/capacityAnalyticsApi";
import { useAuth } from "../../../context/AuthContext";
import { isSuperRole } from "../../../auth/isSuperRole";
import { ADMIN_RELEASE_CART_PERMISSION } from "../../../components/carts/AdminReleaseCartButton";

const ADMIN_ALT = "warehouse.picking.override";

type CapacityAnalyticsSectionProps = {
  cartId: number | null;
  refreshKey?: number;
};

function formatRunWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Prefer stored Polish reason_label from the run (no FE translation map). */
function stopReasonLabel(run: CapacityAnalyticsRun): string {
  if (!run.reasons?.length) return "—";
  const sorted = [...run.reasons].sort((a, b) => b.count - a.count);
  return sorted[0]?.reason_label?.trim() || "—";
}

/**
 * Historical Capacity Engine summary — last run only.
 * Default collapsed: operators rarely need this; admins expand on demand.
 * Never presents as current cart occupancy.
 */
export function CapacityAnalyticsSection({ cartId, refreshKey = 0 }: CapacityAnalyticsSectionProps) {
  const { user, hasPermission } = useAuth();
  const allowed =
    isSuperRole(user?.role ?? "") ||
    hasPermission(ADMIN_RELEASE_CART_PERMISSION) ||
    hasPermission(ADMIN_ALT);

  const [collapsed, setCollapsed] = useState(true);
  const [run, setRun] = useState<CapacityAnalyticsRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed || cartId == null || collapsed) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchCartLatestCapacityRun(cartId)
      .then((latest) => {
        if (!cancelled) setRun(latest);
      })
      .catch(() => {
        if (!cancelled) {
          setRun(null);
          setError("Nie udało się wczytać historii doboru.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, cartId, refreshKey, collapsed]);

  if (!allowed || cartId == null) return null;

  return (
    <div className="border-t border-slate-100 pt-3">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        )}
        <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">
          Analiza Capacity
        </span>
      </button>

      {!collapsed ? (
        <div className="mt-3 space-y-3 pl-6">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
            Ostatni dobór zamówień
          </p>

          {loading ? <p className="text-sm text-slate-400">Ładowanie…</p> : null}
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          {!loading && !run ? (
            <p className="text-sm text-slate-500">Brak zapisanych uruchomień doboru dla tego wózka.</p>
          ) : null}

          {run ? (
            <dl className="space-y-2 text-sm text-slate-800">
              <div>
                <dt className="sr-only">Data uruchomienia</dt>
                <dd className="font-semibold tabular-nums text-slate-900">
                  {formatRunWhen(run.occurred_at)}
                </dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-semibold text-slate-500">Przeanalizowano:</dt>
                <dd className="tabular-nums font-semibold text-slate-900">{run.candidates_count}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-semibold text-slate-500">Przypisano:</dt>
                <dd className="tabular-nums font-semibold text-slate-900">{run.assigned_count}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-semibold text-slate-500">Powód zakończenia:</dt>
                <dd className="text-slate-900">{stopReasonLabel(run)}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
