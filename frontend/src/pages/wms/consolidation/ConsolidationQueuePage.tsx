import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Loader2, Package2 } from "lucide-react";

import { fetchWmsConsolidationAlerts, fetchWmsConsolidationPlans, type ConsolidationAlertRow, type ConsolidationPlanListRow } from "../../../api/wmsConsolidationApi";
import { useWarehouse } from "../../../context/WarehouseContext";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";
import { WMS_ROUTES } from "../wmsRoutes";
import {
  alertSeverityLabel,
  ALERT_SEVERITY_CLASS,
  consolidationPlanStatusClass,
  consolidationPlanStatusLabel,
} from "./consolidationStatusUi";

type TabId = "queue" | "alerts";

export default function ConsolidationQueuePage() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const [tab, setTab] = useState<TabId>("queue");
  const [rows, setRows] = useState<ConsolidationPlanListRow[]>([]);
  const [alerts, setAlerts] = useState<ConsolidationAlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeCompleted, setIncludeCompleted] = useState(false);

  const load = useCallback(async () => {
    if (warehouseId == null || warehouseId <= 0) {
      setRows([]);
      setAlerts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [plans, alertRows] = await Promise.all([
        fetchWmsConsolidationPlans(DAMAGE_TENANT_ID, warehouseId, includeCompleted),
        fetchWmsConsolidationAlerts(DAMAGE_TENANT_ID, warehouseId, true),
      ]);
      setRows(plans);
      setAlerts(alertRows);
    } catch {
      setRows([]);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseId, includeCompleted]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Konsolidacje</h1>
          <p className="mt-1 text-sm text-slate-600">
            Zamówienia oczekujące na ściągnięcie towaru do magazynu docelowego
            {warehouse?.name ? ` (${warehouse.name})` : ""}.
          </p>
        </div>
        {tab === "queue" ? (
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to={WMS_ROUTES.consolidationStaging}
              className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-900 hover:bg-sky-100"
            >
              Rozkładanie
              <ArrowRight className="h-4 w-4" />
            </Link>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={includeCompleted}
              onChange={(e) => setIncludeCompleted(e.target.checked)}
            />
            Pokaż zakończone
          </label>
          </div>
        ) : null}
      </div>

      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setTab("queue")}
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
            tab === "queue" ? "bg-cyan-100 text-cyan-950" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          Kolejka
        </button>
        <button
          type="button"
          onClick={() => setTab("alerts")}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${
            tab === "alerts" ? "bg-cyan-100 text-cyan-950" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <AlertTriangle className="h-4 w-4" aria-hidden />
          Alerty
          {alerts.length > 0 ? (
            <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-xs text-white">{alerts.length}</span>
          ) : null}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Wczytywanie…
        </div>
      ) : tab === "alerts" ? (
        alerts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
            Brak aktywnych alertów konsolidacji.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Priorytet</th>
                  <th className="px-4 py-3">Kod</th>
                  <th className="px-4 py-3">Opis</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100 last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {a.created_at ? new Date(a.created_at).toLocaleString("pl-PL") : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                          ALERT_SEVERITY_CLASS[a.severity.toUpperCase()] ?? ALERT_SEVERITY_CLASS.INFO
                        }`}
                      >
                        {alertSeverityLabel(a.severity)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-800">{a.code}</td>
                    <td className="max-w-xs px-4 py-3 text-slate-700">{a.message}</td>
                    <td className="px-4 py-3">
                      <Link
                        to={WMS_ROUTES.consolidationDetail(a.plan_id)}
                        className="font-semibold text-cyan-800 hover:underline"
                      >
                        #{a.order_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${consolidationPlanStatusClass(a.plan_status)}`}
                      >
                        {consolidationPlanStatusLabel(a.plan_status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
          Brak aktywnych konsolidacji dla tego magazynu docelowego.
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                to={WMS_ROUTES.consolidationDetail(row.id)}
                className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-cyan-300 hover:shadow-md"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600">
                      <Package2 className="h-5 w-5" aria-hidden />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-slate-900">#{row.order_number}</p>
                      <p className="text-sm text-slate-600">
                        Magazyn docelowy:{" "}
                        <span className="font-semibold text-slate-800">
                          {row.target_warehouse_name ?? `#${row.target_warehouse_id}`}
                        </span>
                      </p>
                      <p className="mt-1 text-sm tabular-nums text-slate-700">{row.progress_label}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${consolidationPlanStatusClass(row.status)}`}
                    >
                      {consolidationPlanStatusLabel(row.status)}
                    </span>
                    <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
