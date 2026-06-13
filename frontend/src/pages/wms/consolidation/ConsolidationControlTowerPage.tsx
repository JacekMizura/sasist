import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw, TowerControl } from "lucide-react";

import {
  fetchConsolidationTowerAlerts,
  fetchConsolidationTowerQueues,
  fetchConsolidationTowerRacks,
  fetchConsolidationTowerSummary,
  type ConsolidationControlTowerAlert,
  type ConsolidationTowerAlerts,
  type ConsolidationTowerQueues,
  type ConsolidationTowerRacks,
  type ConsolidationTowerSummary,
} from "../../../api/wmsConsolidationApi";
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
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${alertTone(alert.severity)}`}
    >
      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
      {alert.label}
    </span>
  );
}

function queueStatusLabel(status: string): string {
  if (status === "READY_FOR_STAGING") return "Do rozłożenia";
  if (status === "STAGING") return "Rozkładanie";
  if (status === "READY_TO_PACK") return "Gotowe do pakowania";
  return status;
}

export default function ConsolidationControlTowerPage() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const [summary, setSummary] = useState<ConsolidationTowerSummary | null>(null);
  const [queues, setQueues] = useState<ConsolidationTowerQueues | null>(null);
  const [racks, setRacks] = useState<ConsolidationTowerRacks | null>(null);
  const [alerts, setAlerts] = useState<ConsolidationTowerAlerts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (warehouseId == null || warehouseId <= 0) {
      setSummary(null);
      setQueues(null);
      setRacks(null);
      setAlerts(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [s, q, r, a] = await Promise.all([
        fetchConsolidationTowerSummary(DAMAGE_TENANT_ID, warehouseId),
        fetchConsolidationTowerQueues(DAMAGE_TENANT_ID, warehouseId),
        fetchConsolidationTowerRacks(DAMAGE_TENANT_ID, warehouseId),
        fetchConsolidationTowerAlerts(DAMAGE_TENANT_ID, warehouseId),
      ]);
      setSummary(s);
      setQueues(q);
      setRacks(r);
      setAlerts(a);
    } catch {
      setError("Nie udało się wczytać control tower konsolidacji.");
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-violet-800">
            <TowerControl className="h-6 w-6" aria-hidden />
            <h1 className="text-xl font-bold text-slate-900">Control Tower — Konsolidacja</h1>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Monitoring operacyjny dla brygadzisty
            {warehouse?.name ? ` (${warehouse.name})` : ""}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Odśwież
          </button>
          <Link
            to={WMS_ROUTES.consolidations}
            className="inline-flex items-center gap-1 text-sm font-medium text-sky-700 hover:text-sky-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Konsolidacje
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Wczytywanie…
        </div>
      ) : summary ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <KpiTile label="Do rozłożenia" value={summary.counts.READY_FOR_STAGING} tone="border-sky-200 bg-sky-50 text-sky-950" />
            <KpiTile label="Rozkładanie" value={summary.counts.STAGING} tone="border-blue-200 bg-blue-50 text-blue-950" />
            <KpiTile label="Gotowe do pack" value={summary.counts.READY_TO_PACK} tone="border-orange-200 bg-orange-50 text-orange-950" />
            <KpiTile label="Wyjątki" value={summary.counts.EXCEPTION} tone="border-red-200 bg-red-50 text-red-950" />
            <KpiTile label="Manual review" value={summary.counts.MANUAL_REVIEW_REQUIRED} tone="border-rose-200 bg-rose-50 text-rose-950" />
            {(summary.capacity_warning_count ?? 0) > 0 ? (
              <KpiTile
                label="Ostrzeżenia pojemności"
                value={summary.capacity_warning_count ?? 0}
                tone="border-amber-300 bg-amber-50 text-amber-950"
              />
            ) : null}
          </section>

          <section className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Śr. oczekiwanie → rozkładanie</div>
              <div className="mt-1 text-lg font-bold tabular-nums">
                {summary.avg_minutes.ready_for_staging_to_staging != null
                  ? `${summary.avg_minutes.ready_for_staging_to_staging} min`
                  : "—"}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Śr. czas rozkładania</div>
              <div className="mt-1 text-lg font-bold tabular-nums">
                {summary.avg_minutes.staging_to_completed != null ? `${summary.avg_minutes.staging_to_completed} min` : "—"}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Śr. oczekiwanie → pakowanie</div>
              <div className="mt-1 text-lg font-bold tabular-nums">
                {summary.avg_minutes.completed_to_packing != null ? `${summary.avg_minutes.completed_to_packing} min` : "—"}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-violet-900">Regały — zajętość</h2>
            <p className="mt-1 text-sm text-violet-800">
              {summary.rack_summary.occupied_segments}/{summary.rack_summary.total_segments} segmentów zajętych (
              {summary.rack_summary.occupancy_percent}%)
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-white px-2 py-0.5 font-semibold text-violet-900">
                Alerty: {summary.alert_counts.warning} WARN / {summary.alert_counts.critical} CRIT
              </span>
            </div>
          </section>

          {alerts && alerts.alerts.length > 0 ? (
            <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-amber-950">Alerty SLA</h2>
              <ul className="mt-3 space-y-2">
                {alerts.alerts.slice(0, 12).map((a) => (
                  <li key={`${a.plan_id}-${a.code}-${a.alert_id ?? ""}`} className="flex flex-wrap items-center gap-2 text-sm">
                    <AlertBadge alert={a} />
                    <Link to={WMS_ROUTES.consolidationDetail(a.plan_id)} className="font-semibold text-slate-900 hover:underline">
                      {a.order_number ?? `#${a.order_id}`}
                    </Link>
                    {a.shelf_label ? <span className="font-mono text-xs text-slate-600">{a.shelf_label}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {queues ? (
            <>
              <QueueSection title="Do rozłożenia" rows={queues.ready_for_staging} kind="ready" />
              <QueueSection title="W trakcie rozkładania" rows={queues.staging} kind="staging" />
              <QueueSection title="Gotowe do pakowania" rows={queues.ready_to_pack} kind="pack" />

              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Najstarsze oczekujące (TOP 20)</h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="py-2 pr-3">Zamówienie</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3">Półka</th>
                        <th className="py-2 pr-3">Czas</th>
                        <th className="py-2">Alerty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queues.bottlenecks.map((row) => (
                        <tr key={`${row.queue_status}-${row.plan_id}`} className="border-b border-slate-100">
                          <td className="py-2 pr-3">
                            <Link to={WMS_ROUTES.consolidationDetail(row.plan_id)} className="font-semibold text-sky-800 hover:underline">
                              {row.order_number}
                            </Link>
                          </td>
                          <td className="py-2 pr-3">{queueStatusLabel(row.queue_status)}</td>
                          <td className="py-2 pr-3 font-mono text-xs">{row.shelf_label ?? "—"}</td>
                          <td className="py-2 pr-3 tabular-nums">{row.waiting_label ?? "—"}</td>
                          <td className="py-2">
                            <div className="flex flex-wrap gap-1">
                              {row.alerts.map((alert) => (
                                <AlertBadge key={`${alert.code}-${alert.label}`} alert={alert} />
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : null}

          {racks && racks.racks.length > 0 ? (
            <section className="space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">Regały kompletacyjne</h2>
              {racks.racks.map((rack) => (
                <article key={rack.rack_id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-mono text-lg font-bold">{rack.rack_name}</h3>
                    <span className="text-sm text-slate-600">
                      {rack.occupied_segments}/{rack.total_segments} zajęte ({rack.occupancy_percent}%)
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {rack.segments.map((seg) => (
                      <div
                        key={seg.segment_id}
                        className={`rounded-lg border px-3 py-2 text-sm ${rackSegmentStateClass(seg.state)}`}
                      >
                        <div className="font-mono font-bold">{seg.shelf_label}</div>
                        <div className="mt-1 text-xs uppercase tracking-wide">{rackSegmentStateLabel(seg.state)}</div>
                        {seg.order_number ? (
                          <div className="mt-1 font-medium">{seg.order_number}</div>
                        ) : (
                          <div className="mt-1 text-slate-500">Wolny</div>
                        )}
                        {seg.occupied_minutes != null ? (
                          <div className="mt-0.5 text-xs tabular-nums">{seg.occupied_minutes} min</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

type QueueSectionProps = {
  title: string;
  kind: "ready" | "staging" | "pack";
  rows: ConsolidationTowerQueues["ready_for_staging"] | ConsolidationTowerQueues["staging"] | ConsolidationTowerQueues["ready_to_pack"];
};

function QueueSection({ title, rows, kind }: QueueSectionProps) {
  if (!rows.length) {
    return (
      <section className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-600">{title}</h2>
        <p className="mt-2 text-sm text-slate-500">Brak pozycji.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
        {title} ({rows.length})
      </h2>
      <ul className="mt-3 space-y-2">
        {rows.map((row) => (
          <li key={row.plan_id} className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <Link to={WMS_ROUTES.consolidationDetail(row.plan_id)} className="font-semibold text-sky-800 hover:underline">
                {row.order_number}
              </Link>
              <span className="text-xs tabular-nums text-slate-600">{row.waiting_label ?? "—"}</span>
            </div>
            {kind === "ready" && "pending_source_warehouses" in row ? (
              <p className="mt-1 text-xs text-slate-600">
                Pozycje: {row.item_count}
                {row.pending_source_warehouses.length > 0
                  ? ` · Oczekiwane: ${row.pending_source_warehouses.join(", ")}`
                  : ""}
              </p>
            ) : null}
            {kind === "staging" && "shelf_label" in row ? (
              <p className="mt-1 text-xs text-slate-600">
                {row.shelf_label ?? "—"} · {row.progress_percent}% · {row.staged_count} STAGED / {row.pending_count} oczek.
              </p>
            ) : null}
            {kind === "pack" && "shelf_label" in row ? (
              <p className="mt-1 text-xs text-slate-600">
                {row.shelf_label ?? "—"}
                {row.last_activity_at ? ` · Ostatnia aktywność: ${new Date(row.last_activity_at).toLocaleString()}` : ""}
              </p>
            ) : null}
            {row.alerts.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {row.alerts.map((alert) => (
                  <AlertBadge key={`${alert.code}-${alert.label}`} alert={alert} />
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
