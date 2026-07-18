import { useEffect, useState } from "react";

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

/** Prefer stored Polish reason_label from the run (no FE translation map). */
function stopReasonLabel(run: CapacityAnalyticsRun): string {
  if (!run.reasons?.length) return "—";
  const sorted = [...run.reasons].sort((a, b) => b.count - a.count);
  return sorted[0]?.reason_label?.trim() || "—";
}

/**
 * Short Capacity Engine summary only — last run, no reject lists.
 */
export function CapacityAnalyticsSection({ cartId, refreshKey = 0 }: CapacityAnalyticsSectionProps) {
  const { user, hasPermission } = useAuth();
  const allowed =
    isSuperRole(user?.role ?? "") ||
    hasPermission(ADMIN_RELEASE_CART_PERMISSION) ||
    hasPermission(ADMIN_ALT);

  const [run, setRun] = useState<CapacityAnalyticsRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed || cartId == null) return;
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
          setError("Nie udało się wczytać podsumowania doboru.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, cartId, refreshKey]);

  if (!allowed || cartId == null) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
        Ostatni dobór zamówień
      </h3>

      {loading ? <p className="text-sm text-slate-400">Ładowanie…</p> : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {!loading && !run ? (
        <p className="text-sm text-slate-500">Brak uruchomień doboru dla tego wózka.</p>
      ) : null}

      {run ? (
        <dl className="space-y-2 text-sm text-slate-800">
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
  );
}
