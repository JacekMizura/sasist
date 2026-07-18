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

function stopReasonLabel(run: CapacityAnalyticsRun): string {
  if (!run.reasons?.length) return "—";
  const sorted = [...run.reasons].sort((a, b) => b.count - a.count);
  return sorted[0]?.reason_label?.trim() || "—";
}

/**
 * Last Capacity Engine run — historical summary only (not current occupancy).
 * Default collapsed. Label: Historia doboru zamówień.
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
          setError("Nie udało się wczytać historii doboru.");
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
    <section className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        <span className="flex items-center gap-2">
          {collapsed ? (
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          )}
          <span className="text-sm font-semibold text-slate-800">Historia doboru zamówień</span>
        </span>
        {run?.occurred_at ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
            Ostatni dobór: {formatRunWhen(run.occurred_at)}
          </span>
        ) : !collapsed && !loading ? (
          <span className="text-[11px] text-slate-400">Brak uruchomień</span>
        ) : null}
      </button>

      {!collapsed ? (
        <div className="border-t border-slate-100 px-4 py-4">
          {loading ? <p className="text-sm text-slate-400">Ładowanie…</p> : null}
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          {!loading && !run ? (
            <p className="text-sm text-slate-500">Brak zapisanych uruchomień doboru dla tego wózka.</p>
          ) : null}
          {run ? (
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  Przeanalizowano
                </dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                  {run.candidates_count}{" "}
                  <span className="font-medium text-slate-500">zamówień</span>
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  Przypisano
                </dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                  {run.assigned_count}{" "}
                  <span className="font-medium text-slate-500">zamówień</span>
                </dd>
              </div>
              <div className="sm:col-span-2 lg:col-span-1">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  Powód zakończenia
                </dt>
                <dd className="mt-1 text-sm font-bold text-slate-900">{stopReasonLabel(run)}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  Data uruchomienia
                </dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                  {formatRunWhen(run.occurred_at)}
                </dd>
              </div>
            </dl>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
