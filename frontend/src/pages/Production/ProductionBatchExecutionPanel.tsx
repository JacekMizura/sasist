import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Play, XCircle } from "lucide-react";
import {
  cancelProductionBatch,
  completeProductionBatch,
  fetchBatchPickPlan,
  startProductionBatch,
  type BatchAggregatedPickLineRead,
  type ComponentAllocationWrite,
  type ProductionBatchCompleteResultRead,
  type ProductionBatchRead,
  type ProductionBatchPickPlanRead,
} from "../../api/productionApi";
import { ProductionWarehouseLocationSearch } from "./ProductionWarehouseLocationSearch";
import {
  BATCH_STATUS_LABEL,
  batchStatusBadgeClass,
  formatProductionMoney,
  loadRecentTargetLocations,
  rememberTargetLocation,
} from "./productionUi";

export type BatchComponentPickState = {
  componentProductId: number;
  useAuto: boolean;
  picks: { locationId: number; code: string; quantity: number }[];
};

type Props = {
  tenantId: number;
  batch: ProductionBatchRead;
  onBatchUpdated: (batch: ProductionBatchRead) => void;
  onListRefresh: () => void;
};

function initBatchPicks(line: BatchAggregatedPickLineRead): BatchComponentPickState {
  const auto = line.auto_allocation.map((a) => ({
    locationId: a.location_id,
    code: a.location_code,
    quantity: a.quantity,
  }));
  return {
    componentProductId: line.component_product_id,
    useAuto: auto.length > 0,
    picks: auto.length > 0 ? auto : [],
  };
}

export function ProductionBatchExecutionPanel({ tenantId, batch, onBatchUpdated, onListRefresh }: Props) {
  const [pickPlan, setPickPlan] = useState<ProductionBatchPickPlanRead | null>(null);
  const [pickLoading, setPickLoading] = useState(false);
  const [pickStates, setPickStates] = useState<BatchComponentPickState[]>([]);
  const [lineTargets, setLineTargets] = useState<Record<number, { id: number | null; code: string | null }>>({});
  const [actionBusy, setActionBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [completeResult, setCompleteResult] = useState<ProductionBatchCompleteResultRead | null>(null);

  const canExecute = batch.status === "planned" || batch.status === "in_progress" || batch.status === "draft";
  const canStart = batch.status === "planned" || batch.status === "draft";
  const canComplete = batch.status === "in_progress" || batch.status === "planned";
  const canCancel = batch.status !== "completed" && batch.status !== "cancelled";
  const isDone = batch.status === "completed";

  const recentIds = useMemo(() => loadRecentTargetLocations(batch.warehouse_id), [batch.warehouse_id]);

  const loadPickPlan = useCallback(async () => {
    if (!canExecute) {
      setPickPlan(null);
      return;
    }
    setPickLoading(true);
    try {
      const plan = await fetchBatchPickPlan(tenantId, batch.id);
      setPickPlan(plan);
      setPickStates(plan.aggregated_components.map(initBatchPicks));
      const targets: Record<number, { id: number | null; code: string | null }> = {};
      plan.product_lines.forEach((ln) => {
        targets[ln.id] = {
          id: ln.target_location_id ?? null,
          code: ln.target_location_name ?? null,
        };
      });
      setLineTargets(targets);
    } catch (e: unknown) {
      setPickPlan(null);
      setErr(e instanceof Error ? e.message : "Nie udało się wczytać planu poboru.");
    } finally {
      setPickLoading(false);
    }
  }, [tenantId, batch.id, canExecute]);

  useEffect(() => {
    setCompleteResult(null);
    void loadPickPlan();
  }, [batch.id, batch.status, loadPickPlan]);

  const buildAllocations = (): ComponentAllocationWrite[] => {
    const out: ComponentAllocationWrite[] = [];
    for (const st of pickStates) {
      for (const p of st.picks) {
        if (p.quantity > 0) {
          out.push({
            line_snapshot_id: st.componentProductId,
            location_id: p.locationId,
            quantity: p.quantity,
          });
        }
      }
    }
    return out;
  };

  const handleStart = async () => {
    setActionBusy(true);
    setErr(null);
    try {
      const updated = await startProductionBatch(tenantId, batch.id);
      onBatchUpdated(updated);
      onListRefresh();
      await loadPickPlan();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Nie udało się rozpocząć partii.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleComplete = async () => {
    setActionBusy(true);
    setErr(null);
    try {
      const result = await completeProductionBatch(tenantId, batch.id, {
        component_allocations: buildAllocations(),
        line_completions: batch.lines.map((ln) => ({
          line_id: ln.id,
          completed_quantity: ln.planned_quantity,
          target_location_id: lineTargets[ln.id]?.id ?? ln.target_location_id ?? null,
        })),
      });
      setCompleteResult(result);
      onBatchUpdated(result.batch);
      onListRefresh();
      for (const ln of batch.lines) {
        const t = lineTargets[ln.id];
        if (t?.id) rememberTargetLocation(batch.warehouse_id, t.id);
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Zakończenie partii nie powiodło się.");
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancel = async () => {
    setActionBusy(true);
    setErr(null);
    try {
      const updated = await cancelProductionBatch(tenantId, batch.id);
      onBatchUpdated(updated);
      onListRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Anulowanie nie powiodło się.");
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-lg font-bold text-slate-900">{batch.number}</p>
          <p className="text-sm text-slate-500">{batch.warehouse_name ?? `Magazyn #${batch.warehouse_id}`}</p>
        </div>
        <span className={batchStatusBadgeClass(batch.status)}>{BATCH_STATUS_LABEL[batch.status]}</span>
      </div>

      {err ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
      ) : null}

      {pickPlan?.has_shortages ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            Braki składników (zagregowane)
          </p>
          <ul className="mt-2 space-y-1 text-sm text-amber-800">
            {pickPlan.shortages.map((s) => (
              <li key={s.component_product_id}>
                {s.product_name}: wymagane {s.required}, dostępne {s.available}, brakuje{" "}
                <strong>{s.missing}</strong>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Do wyprodukowania</p>
          {batch.lines.map((ln) => (
            <div key={ln.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
              <p className="font-medium text-slate-900">{ln.product_name ?? `#${ln.product_id}`}</p>
              <p className="text-xs text-slate-500">{ln.product_sku ?? ""}</p>
              <p className="mt-1 text-sm font-semibold text-violet-700">× {ln.planned_quantity}</p>
            </div>
          ))}
        </div>

        <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/30 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Wykonanie</p>
          {pickLoading ? (
            <p className="text-sm text-slate-500">Wczytywanie planu…</p>
          ) : isDone && completeResult ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
              <p className="flex items-center gap-2 font-semibold text-emerald-900">
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                Partia zakończona
              </p>
              {completeResult.rw_document_number ? (
                <p className="mt-2">
                  RW:{" "}
                  <Link
                    to={`/documents/warehouse?doc=${completeResult.rw_stock_document_id}`}
                    className="text-violet-700 hover:underline"
                  >
                    {completeResult.rw_document_number}
                  </Link>
                </p>
              ) : null}
              {completeResult.component_total_cost != null ? (
                <p className="mt-1">Koszt składników: {formatProductionMoney(completeResult.component_total_cost)}</p>
              ) : null}
            </div>
          ) : canExecute ? (
            <>
              {batch.lines.map((ln) => (
                <div key={ln.id} className="rounded-lg border border-white bg-white p-2 text-sm">
                  <p className="text-xs text-slate-500">Lokalizacja docelowa — {ln.product_name}</p>
                  <ProductionWarehouseLocationSearch
                    tenantId={tenantId}
                    warehouseId={batch.warehouse_id}
                    value={lineTargets[ln.id]?.id ?? null}
                    valueLabel={lineTargets[ln.id]?.code ?? null}
                    recentLocationIds={recentIds}
                    onChange={(id, code) =>
                      setLineTargets((prev) => ({ ...prev, [ln.id]: { id, code } }))
                    }
                  />
                </div>
              ))}
              <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-violet-100 bg-violet-50/80 pt-3">
                {canStart ? (
                  <button
                    type="button"
                    disabled={actionBusy || pickPlan?.has_shortages}
                    onClick={() => void handleStart()}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    <Play className="h-4 w-4" aria-hidden />
                    Rozpocznij
                  </button>
                ) : null}
                {canComplete ? (
                  <button
                    type="button"
                    disabled={actionBusy || pickPlan?.has_shortages}
                    onClick={() => void handleComplete()}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    Zakończ partię
                  </button>
                ) : null}
                {canCancel ? (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handleCancel()}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-white disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4" aria-hidden />
                    Anuluj
                  </button>
                ) : null}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">Partia zamknięta.</p>
          )}
        </div>

        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 max-h-[28rem] overflow-y-auto">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Składniki (zagregowane)</p>
          {pickPlan?.aggregated_components.map((comp, idx) => {
            const st = pickStates[idx];
            const pct = comp.required > 0 ? Math.min(100, (comp.available / comp.required) * 100) : 100;
            return (
              <div
                key={comp.component_product_id}
                className={`rounded-lg border px-3 py-2 ${comp.missing > 0 ? "border-amber-200 bg-amber-50" : "border-slate-100 bg-slate-50"}`}
              >
                <div className="flex justify-between gap-2">
                  <p className="font-medium text-slate-900 text-sm">{comp.product_name}</p>
                  <span className="text-xs text-slate-500">{comp.product_sku}</span>
                </div>
                <p className="mt-1 text-sm">
                  <span className="font-semibold text-slate-800">{comp.required}</span>
                  <span className="text-slate-400"> / </span>
                  <span className={comp.missing > 0 ? "text-amber-700" : "text-emerald-700"}>{comp.available}</span>
                </p>
                <div className="mt-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${comp.missing > 0 ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {st && canExecute && !isDone ? (
                  <div className="mt-2 space-y-1">
                    {st.picks.map((p, pi) => (
                      <span
                        key={`${p.locationId}-${pi}`}
                        className="inline-flex rounded-full bg-white border border-slate-200 px-2 py-0.5 text-xs text-slate-600 mr-1"
                      >
                        {p.code}: {p.quantity}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
          {!pickPlan?.aggregated_components.length ? (
            <p className="text-sm text-slate-400">Brak składników.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
