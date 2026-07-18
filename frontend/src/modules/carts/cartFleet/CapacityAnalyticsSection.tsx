import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Gauge } from "lucide-react";

import {
  fetchCapacityReasonOrders,
  fetchCapacityStats24h,
  fetchCartLatestCapacityRun,
  type CapacityAnalyticsRun,
  type CapacityReasonAgg,
  type CapacityStats24h,
} from "../../../api/capacityAnalyticsApi";
import { useAuth } from "../../../context/AuthContext";
import { isSuperRole } from "../../../auth/isSuperRole";
import { ADMIN_RELEASE_CART_PERMISSION } from "../../../components/carts/AdminReleaseCartButton";
import { useWarehouse } from "../../../context/WarehouseContext";

const ADMIN_ALT = "warehouse.picking.override";
const TENANT_ID = 1;

type CapacityAnalyticsSectionProps = {
  cartId: number | null;
  refreshKey?: number;
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ReasonRow({
  runId,
  reason,
}: {
  runId: number;
  reason: CapacityReasonAgg;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<{ order_id: number; order_number: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(
    async (nextOffset: number, append: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const page = await fetchCapacityReasonOrders({
          runId,
          reasonCode: reason.reason_code,
          offset: nextOffset,
          limit: 50,
        });
        setTotal(page.total);
        setHasMore(page.has_more);
        setOffset(page.offset + page.items.length);
        setItems((prev) => (append ? [...prev, ...page.items] : page.items));
      } catch {
        setError("Nie udało się wczytać szczegółów.");
      } finally {
        setLoading(false);
      }
    },
    [runId, reason.reason_code],
  );

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && items.length === 0) {
      void loadPage(0, false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
        )}
        <span className="font-bold tabular-nums text-slate-900">{reason.count}</span>
        <span className="text-slate-700">{reason.reason_label}</span>
      </button>
      {open ? (
        <div className="border-t border-slate-100 px-3 py-2">
          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
          {loading && items.length === 0 ? (
            <p className="text-xs text-slate-400">Ładowanie…</p>
          ) : (
            <>
              <ul className="max-h-48 space-y-0.5 overflow-y-auto text-[12px] tabular-nums text-slate-700">
                {items.map((it) => (
                  <li key={it.order_id}>#{String(it.order_number).replace(/^#/, "")}</li>
                ))}
              </ul>
              {hasMore ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void loadPage(offset, true)}
                  className="mt-2 text-[11px] font-semibold text-sky-700 hover:underline disabled:opacity-50"
                >
                  {loading ? "Ładowanie…" : `Pokaż kolejne (łącznie ${total})`}
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Admin-only Capacity Engine diagnostics for cart expand panel.
 */
export function CapacityAnalyticsSection({ cartId, refreshKey = 0 }: CapacityAnalyticsSectionProps) {
  const { user, hasPermission } = useAuth();
  const { warehouse } = useWarehouse();
  const allowed =
    isSuperRole(user?.role ?? "") ||
    hasPermission(ADMIN_RELEASE_CART_PERMISSION) ||
    hasPermission(ADMIN_ALT);

  const [run, setRun] = useState<CapacityAnalyticsRun | null>(null);
  const [stats, setStats] = useState<CapacityStats24h | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed || cartId == null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const whId = warehouse?.id != null ? Number(warehouse.id) : null;
    Promise.all([
      fetchCartLatestCapacityRun(cartId),
      whId != null
        ? fetchCapacityStats24h({ tenantId: TENANT_ID, warehouseId: whId, hours: 24 })
        : Promise.resolve(null),
    ])
      .then(([latest, s]) => {
        if (cancelled) return;
        setRun(latest);
        setStats(s);
      })
      .catch(() => {
        if (!cancelled) {
          setRun(null);
          setStats(null);
          setError("Brak uprawnień lub błąd odczytu Capacity Analytics.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, cartId, refreshKey, warehouse?.id]);

  if (!allowed || cartId == null) return null;

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        <Gauge className="h-3.5 w-3.5" aria-hidden />
        Analiza Capacity
      </h3>

      {loading ? <p className="text-sm text-slate-400">Ładowanie…</p> : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {!loading && !run ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
          Brak uruchomień Capacity Engine dla tego wózka.
        </p>
      ) : null}

      {run ? (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3">
          <div className="text-[11px] text-slate-500">
            Ostatnie uruchomienie:{" "}
            <span className="font-semibold text-slate-700">{formatWhen(run.occurred_at)}</span>
            {run.strategy ? (
              <span className="ml-2 rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                {run.strategy}
              </span>
            ) : null}
          </div>
          <dl className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-md bg-white px-2 py-2 shadow-sm">
              <dt className="text-[10px] font-bold uppercase text-slate-400">Kandydaci</dt>
              <dd className="text-lg font-bold tabular-nums text-slate-900">{run.candidates_count}</dd>
            </div>
            <div className="rounded-md bg-white px-2 py-2 shadow-sm">
              <dt className="text-[10px] font-bold uppercase text-slate-400">Przypisano</dt>
              <dd className="text-lg font-bold tabular-nums text-emerald-700">{run.assigned_count}</dd>
            </div>
            <div className="rounded-md bg-white px-2 py-2 shadow-sm">
              <dt className="text-[10px] font-bold uppercase text-slate-400">Nie przypisano</dt>
              <dd className="text-lg font-bold tabular-nums text-amber-700">{run.rejected_count}</dd>
            </div>
          </dl>
          {run.reasons.length ? (
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Powody</p>
              {run.reasons.map((r) => (
                <ReasonRow key={r.reason_code} runId={run.run_id} reason={r} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {stats ? (
        <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            W ciągu ostatnich {stats.hours}h
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-slate-700">
            <span>
              Przypisano:{" "}
              <strong className="tabular-nums text-emerald-700">{stats.assigned_count}</strong>
            </span>
            <span>
              Odrzucono:{" "}
              <strong className="tabular-nums text-amber-700">{stats.rejected_count}</strong>
            </span>
          </div>
          {stats.top_reasons.length ? (
            <ol className="mt-2 space-y-1 text-[13px] text-slate-700">
              {stats.top_reasons.slice(0, 3).map((r, i) => (
                <li key={r.reason_code}>
                  <span className="font-semibold text-slate-500">{i + 1}.</span> {r.reason_label}{" "}
                  <span className="tabular-nums text-slate-500">
                    {r.percent != null ? `${r.percent}%` : `${r.count}`}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
