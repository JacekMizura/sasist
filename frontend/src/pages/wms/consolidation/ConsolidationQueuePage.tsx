import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Loader2 } from "lucide-react";

import {
  fetchConsolidationTowerQueues,
  fetchWmsConsolidationAlerts,
  fetchWmsConsolidationPlans,
  type ConsolidationAlertRow,
  type ConsolidationPlanListRow,
  type ConsolidationTowerQueues,
} from "../../../api/wmsConsolidationApi";
import { useWarehouse } from "../../../context/WarehouseContext";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";
import { WMS_ROUTES } from "../wmsRoutes";
import {
  alertSeverityLabel,
  ALERT_SEVERITY_CLASS,
  consolidationPlanStatusClass,
  consolidationPlanStatusLabel,
} from "./consolidationStatusUi";
import {
  ConsolidationOperatorPage,
  ConsolidationOperatorToolbar,
  OperatorPrimaryButton,
  OperatorSection,
  OperatorTaskRow,
  WMS_CONSOLIDATION_LABELS,
} from "./consolidationOperatorUi";

type TabId = "todo" | "problems";

function isSupplyPlan(row: ConsolidationPlanListRow): boolean {
  const status = row.status.toUpperCase();
  if (["COMPLETED", "CANCELLED", "READY_FOR_STAGING", "STAGING"].includes(status)) return false;
  if (["IN_PROGRESS", "READY", "DRAFT"].includes(status)) return true;
  return row.transfers_received < row.transfers_total || row.pending_source_warehouses.length > 0;
}

export default function ConsolidationQueuePage() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const [tab, setTab] = useState<TabId>("todo");
  const [queues, setQueues] = useState<ConsolidationTowerQueues | null>(null);
  const [supplyPlans, setSupplyPlans] = useState<ConsolidationPlanListRow[]>([]);
  const [alerts, setAlerts] = useState<ConsolidationAlertRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (warehouseId == null || warehouseId <= 0) {
      setQueues(null);
      setSupplyPlans([]);
      setAlerts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [q, plans, alertRows] = await Promise.all([
        fetchConsolidationTowerQueues(DAMAGE_TENANT_ID, warehouseId),
        fetchWmsConsolidationPlans(DAMAGE_TENANT_ID, warehouseId, false),
        fetchWmsConsolidationAlerts(DAMAGE_TENANT_ID, warehouseId, true),
      ]);
      setQueues(q);
      setSupplyPlans(plans.filter(isSupplyPlan));
      setAlerts(alertRows);
    } catch {
      setQueues(null);
      setSupplyPlans([]);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const stagingCount = useMemo(
    () => (queues?.ready_for_staging.length ?? 0) + (queues?.staging.length ?? 0),
    [queues],
  );

  const todoCount = useMemo(
    () => stagingCount + supplyPlans.length + (queues?.ready_to_pack.length ?? 0),
    [stagingCount, supplyPlans.length, queues],
  );

  return (
    <ConsolidationOperatorPage
      toolbar={<ConsolidationOperatorToolbar onRefresh={() => void load()} refreshing={loading} />}
    >
      <div className="mb-4 flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setTab("todo")}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${
            tab === "todo" ? "border-sky-600 text-sky-900" : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          {WMS_CONSOLIDATION_LABELS.todoTitle}
          {todoCount > 0 ? (
            <span className="ml-1.5 rounded-full bg-sky-100 px-1.5 py-0.5 text-xs tabular-nums text-sky-900">
              {todoCount}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => setTab("problems")}
          className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold ${
            tab === "problems" ? "border-amber-600 text-amber-950" : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          {WMS_CONSOLIDATION_LABELS.sectionProblems}
          {alerts.length > 0 ? (
            <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-xs text-white">{alerts.length}</span>
          ) : null}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Wczytywanie…
        </div>
      ) : tab === "problems" ? (
        alerts.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">Brak aktywnych alertów.</p>
        ) : (
          <div className="overflow-x-auto border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Priorytet</th>
                  <th className="px-4 py-3">Opis</th>
                  <th className="px-4 py-3">Zamówienie</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100">
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
                    <td className="max-w-md px-4 py-3 text-slate-700">{a.message}</td>
                    <td className="px-4 py-3">
                      <Link to={WMS_ROUTES.consolidationDetail(a.plan_id)} className="font-semibold text-sky-800 hover:underline">
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
      ) : todoCount === 0 ? (
        <p className="py-16 text-center text-base text-slate-600">{WMS_CONSOLIDATION_LABELS.emptyTodo}</p>
      ) : (
        <div className="space-y-6">
          <OperatorSection title={WMS_CONSOLIDATION_LABELS.sectionStaging} count={stagingCount}>
            {queues?.ready_for_staging.map((row) => (
              <OperatorTaskRow
                key={`rfs-${row.plan_id}`}
                orderNumber={row.order_number}
                href={WMS_ROUTES.consolidationDetail(row.plan_id)}
                meta={
                  <>
                    Gotowe do rozpoczęcia rozkładania
                    {row.waiting_label ? ` · ${row.waiting_label}` : ""}
                  </>
                }
                action={
                  <OperatorPrimaryButton href={WMS_ROUTES.consolidationDetail(row.plan_id)}>
                    {WMS_CONSOLIDATION_LABELS.stagingAction}
                  </OperatorPrimaryButton>
                }
              />
            ))}
            {queues?.staging.map((row) => (
              <OperatorTaskRow
                key={`st-${row.plan_id}`}
                orderNumber={row.order_number}
                href={WMS_ROUTES.consolidationDetail(row.plan_id)}
                meta={
                  <>
                    W trakcie rozkładania
                    {row.shelf_label ? ` · ${row.shelf_label}` : ""}
                    {row.local_progress_label ? ` · ${row.local_progress_label}` : ""}
                    {row.mm_progress_label ? ` · ${row.mm_progress_label}` : ""}
                  </>
                }
                action={
                  <OperatorPrimaryButton href={WMS_ROUTES.consolidationDetail(row.plan_id)}>
                    {WMS_CONSOLIDATION_LABELS.continueStaging}
                  </OperatorPrimaryButton>
                }
              />
            ))}
          </OperatorSection>

          <OperatorSection title={WMS_CONSOLIDATION_LABELS.sectionSupply} count={supplyPlans.length}>
            {supplyPlans.map((row) => (
              <OperatorTaskRow
                key={row.id}
                orderNumber={row.order_number}
                href={WMS_ROUTES.consolidationDetail(row.id)}
                meta={
                  <>
                    {row.progress_label}
                    {row.pending_source_warehouses.length > 0
                      ? ` · Oczekuje z: ${row.pending_source_warehouses.join(", ")}`
                      : ""}
                  </>
                }
                action={
                  <OperatorPrimaryButton href={WMS_ROUTES.consolidationDetail(row.id)}>
                    {WMS_CONSOLIDATION_LABELS.openOrder}
                  </OperatorPrimaryButton>
                }
              />
            ))}
          </OperatorSection>

          <OperatorSection title={WMS_CONSOLIDATION_LABELS.sectionReadyToPack} count={queues?.ready_to_pack.length ?? 0}>
            {queues?.ready_to_pack.map((row) => (
              <OperatorTaskRow
                key={`rtp-${row.plan_id}`}
                orderNumber={row.order_number}
                href={WMS_ROUTES.packing}
                meta={
                  <>
                    Gotowe do pakowania
                    {row.shelf_label ? ` · Półka ${row.shelf_label}` : ""}
                    {row.waiting_minutes != null ? ` · ${row.waiting_minutes} min` : ""}
                  </>
                }
                action={
                  <OperatorPrimaryButton href={WMS_ROUTES.packing}>
                    {WMS_CONSOLIDATION_LABELS.goToPacking}
                  </OperatorPrimaryButton>
                }
              />
            ))}
          </OperatorSection>
        </div>
      )}
    </ConsolidationOperatorPage>
  );
}
