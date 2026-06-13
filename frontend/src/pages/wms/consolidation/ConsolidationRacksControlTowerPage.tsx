import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, LayoutGrid, Loader2, RefreshCw } from "lucide-react";

import {
  fetchConsolidationRacksControlTower,
  type ConsolidationControlTowerAlert,
  type ConsolidationControlTowerShelf,
} from "../../../api/wmsConsolidationApi";
import { consolidationPlanStatusLabel } from "../../../api/orderConsolidationApi";
import { useWarehouse } from "../../../context/WarehouseContext";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";
import { WMS_ROUTES } from "../wmsRoutes";
import { rackSegmentStateClass, rackSegmentStateLabel } from "./consolidationRackDashboardUi";

function KpiTile({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${tone}`}>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</div>
    </div>
  );
}

function alertTone(severity: string): string {
  const s = severity.toUpperCase();
  if (s === "CRITICAL") return "border-red-300 bg-red-50 text-red-950";
  if (s === "WARNING") return "border-amber-300 bg-amber-50 text-amber-950";
  return "border-slate-200 bg-slate-50 text-slate-800";
}

function AlertBadge({ alert }: { alert: ConsolidationControlTowerAlert }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${alertTone(alert.severity)}`}
    >
      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
      {alert.label}
    </span>
  );
}

function ShelfCard({ shelf }: { shelf: ConsolidationControlTowerShelf }) {
  const isReady = shelf.state === "READY_TO_PACK";
  return (
    <article className={`rounded-2xl border p-5 shadow-sm ${rackSegmentStateClass(shelf.state)}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-xl font-bold">{shelf.shelf_label}</div>
          <div className="mt-1 text-sm font-semibold">
            {shelf.order_number ? `Zamówienie ${shelf.order_number}` : `Zamówienie #${shelf.order_id}`}
          </div>
        </div>
        <span className="rounded-full border border-current/20 bg-white/60 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
          {rackSegmentStateLabel(shelf.state)}
        </span>
      </div>

      {shelf.alerts.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {shelf.alerts.map((alert) => (
            <AlertBadge key={`${alert.code}-${alert.alert_id ?? alert.label}`} alert={alert} />
          ))}
        </div>
      ) : null}

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide opacity-70">Klient</dt>
          <dd className="font-medium">{shelf.customer_name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide opacity-70">Status konsolidacji</dt>
          <dd className="font-medium">{shelf.plan_status ? consolidationPlanStatusLabel(shelf.plan_status) : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide opacity-70">Status zamówienia</dt>
          <dd className="font-medium">{shelf.order_status ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide opacity-70">Magazyn docelowy</dt>
          <dd className="font-medium">{shelf.target_warehouse_name ?? `#${shelf.target_warehouse_id}`}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide opacity-70">Czas zajęcia półki</dt>
          <dd className="font-medium tabular-nums">{shelf.occupied_label ?? "—"}</dd>
        </div>
        {isReady ? (
          <div className="sm:col-span-2">
            <dt className="text-xs font-bold uppercase tracking-wide text-orange-800">Gotowe do pakowania</dt>
            <dd className="mt-0.5 text-base font-bold text-orange-950">
              Gotowe od: {shelf.ready_to_pack_label ?? "—"}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 grid gap-2 rounded-xl border border-current/10 bg-white/50 p-3 text-sm sm:grid-cols-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide opacity-70">MM</div>
          <div className="font-bold tabular-nums">{shelf.mm_progress_label ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide opacity-70">Lokalne</div>
          <div className="font-bold tabular-nums">{shelf.local_progress_label ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide opacity-70">Łącznie</div>
          <div className="font-bold tabular-nums">{shelf.total_progress_label ?? "—"}</div>
        </div>
      </div>

      {!isReady && shelf.missing_items.length > 0 ? (
        <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-amber-900">Brakuje</h3>
          <ul className="mt-2 space-y-2">
            {shelf.missing_items.map((item) => (
              <li key={item.plan_item_id} className="rounded-lg border border-amber-100 bg-white/80 px-3 py-2 text-sm">
                <div className="font-semibold text-slate-900">{item.product_name}</div>
                <dl className="mt-1 grid gap-0.5 text-xs text-slate-600 sm:grid-cols-2">
                  <div>
                    <span className="font-medium">Źródło:</span> {item.source_warehouse_name ?? `#${item.source_warehouse_id}`}
                  </div>
                  <div>
                    <span className="font-medium">Status:</span> {item.status}
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {shelf.plan_id ? (
        <Link
          to={WMS_ROUTES.consolidationDetail(shelf.plan_id)}
          className="mt-4 inline-flex text-xs font-semibold text-sky-800 hover:underline"
        >
          Szczegóły zamówienia
        </Link>
      ) : null}
    </article>
  );
}

export default function ConsolidationRacksControlTowerPage() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchConsolidationRacksControlTower>> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (warehouseId == null || warehouseId <= 0) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const payload = await fetchConsolidationRacksControlTower(DAMAGE_TENANT_ID, warehouseId);
      setData(payload);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white">
      <div className="shrink-0 border-b border-slate-200 px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to={WMS_ROUTES.consolidationRacks}
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Podgląd półek
            </Link>
            <Link
              to={WMS_ROUTES.consolidations}
              className="text-sm font-medium text-slate-500 hover:text-slate-800"
            >
              Do zrobienia
            </Link>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Odśwież
          </button>
        </div>
        <h1 className="mt-2 text-lg font-bold text-slate-900">Monitor procesu — półki kompletacyjne</h1>
        <p className="text-sm text-slate-600">Widok brygadzisty — KPI, SLA i alerty półek</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-5">

      {loading && !data ? (
        <div className="flex items-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Wczytywanie control tower…
        </div>
      ) : data ? (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <KpiTile label="Wolne półki" value={data.kpi.free_count} tone="border-emerald-200 bg-emerald-50/80" />
            <KpiTile label="Zajęte półki" value={data.kpi.occupied_count} tone="border-slate-200 bg-slate-50" />
            <KpiTile label="Gotowe do pakowania" value={data.kpi.ready_to_pack_count} tone="border-orange-200 bg-orange-50/80" />
            <KpiTile label="Wyjątki" value={data.kpi.exception_count} tone="border-red-200 bg-red-50/80" />
            <KpiTile
              label="Średni czas zajęcia"
              value={`${data.kpi.avg_occupation_minutes} min`}
              tone="border-violet-200 bg-violet-50/80"
            />
          </section>

          {data.shelves.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
              <LayoutGrid className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
              <p className="mt-3">Brak zajętych półek kompletacyjnych.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.shelves.map((shelf) => (
                <ShelfCard key={shelf.segment_id} shelf={shelf} />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="py-16 text-center text-sm text-slate-500">Nie udało się wczytać monitora procesu.</div>
      )}
      </div>
    </div>
  );
}
