/**
 * @deprecated Phase 4 — legacy ERP MO execution. Disconnected from app UI in Phase 3.
 * Operator workflow lives in WMS terminal only. Safe to delete in Phase 4 cleanup.
 */
/**
 * @deprecated Phase 3 — ERP MO execution panel. Use WMS terminal
 * (`/wms/production/*`) for operator workflow. Kept until migration completes.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { warehouseStockDocumentPath } from "../../utils/stockDocumentPaths";
import { AlertTriangle, CheckCircle2, Play, XCircle } from "lucide-react";
import {
  cancelProductionOrder,
  completeProductionOrder,
  fetchProductionPickPlan,
  startProductionOrder,
  type ComponentAllocationWrite,
  type ProductionCompleteResultRead,
  type ProductionOrderRead,
  type ProductionPickLinePlanRead,
  type ProductionPickPlanRead,
} from "../../api/productionApi";
import { ProductionWarehouseLocationSearch } from "./ProductionWarehouseLocationSearch";
import {
  formatProductionMoney,
  loadRecentTargetLocations,
  PRODUCTION_STATUS_LABEL,
  productionStatusBadgeClass,
  rememberTargetLocation,
} from "./productionUi";

/** Per-line pick state — compatible with future collector scan flow. */
export type ComponentPickState = {
  lineSnapshotId: number;
  useAuto: boolean;
  picks: { locationId: number; code: string; quantity: number }[];
};

type Props = {
  tenantId: number;
  warehouseId?: number | null;
  order: ProductionOrderRead;
  onOrderUpdated: (order: ProductionOrderRead) => void;
  onListRefresh: () => void;
};

function initPicksFromPlan(line: ProductionPickLinePlanRead): ComponentPickState {
  const auto = line.auto_allocation.map((a) => ({
    locationId: a.location_id,
    code: a.location_code,
    quantity: a.quantity,
  }));
  return {
    lineSnapshotId: line.line_snapshot_id,
    useAuto: auto.length > 0,
    picks: auto.length > 0 ? auto : [],
  };
}

export function ProductionOrderExecutionPanel({
  tenantId,
  warehouseId,
  order,
  onOrderUpdated,
  onListRefresh,
}: Props) {
  const [pickPlan, setPickPlan] = useState<ProductionPickPlanRead | null>(null);
  const [pickLoading, setPickLoading] = useState(false);
  const [pickStates, setPickStates] = useState<ComponentPickState[]>([]);
  const [targetLocationId, setTargetLocationId] = useState<number | null>(order.location_id ?? null);
  const [targetLocationCode, setTargetLocationCode] = useState<string | null>(order.location_name ?? null);
  const [producedQty, setProducedQty] = useState(order.planned_quantity);
  const [actionBusy, setActionBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [completeResult, setCompleteResult] = useState<ProductionCompleteResultRead | null>(null);

  const canExecute = order.status === "planned" || order.status === "in_progress" || order.status === "draft";
  const canStart = order.status === "planned" || order.status === "draft";
  const canComplete = order.status === "in_progress" || order.status === "planned";
  const canCancel = order.status !== "completed" && order.status !== "cancelled";
  const isDone = order.status === "completed";

  const recentIds = useMemo(() => loadRecentTargetLocations(order.warehouse_id), [order.warehouse_id]);

  const loadPickPlan = useCallback(async () => {
    if (!canExecute || warehouseId == null) {
      setPickPlan(null);
      return;
    }
    setPickLoading(true);
    try {
      const plan = await fetchProductionPickPlan(tenantId, order.id, warehouseId);
      setPickPlan(plan);
      setPickStates(plan.lines.map(initPicksFromPlan));
    } catch (e: unknown) {
      setPickPlan(null);
      setErr(e instanceof Error ? e.message : "Nie udało się wczytać planu poboru.");
    } finally {
      setPickLoading(false);
    }
  }, [tenantId, order.id, canExecute, warehouseId]);

  useEffect(() => {
    setTargetLocationId(order.location_id ?? null);
    setTargetLocationCode(order.location_name ?? null);
    setProducedQty(order.planned_quantity);
    setCompleteResult(null);
    void loadPickPlan();
  }, [order.id, order.status, order.location_id, order.location_name, order.planned_quantity, loadPickPlan]);

  const hasShortages = Boolean(pickPlan?.has_shortages);

  const allocationValid = useMemo(() => {
    if (!pickPlan || hasShortages) return false;
    for (const line of pickPlan.lines) {
      const st = pickStates.find((s) => s.lineSnapshotId === line.line_snapshot_id);
      if (!st) return false;
      const total = st.picks.reduce((s, p) => s + p.quantity, 0);
      if (Math.abs(total - line.required) > 1e-2) return false;
      if (st.picks.some((p) => p.quantity <= 0)) return false;
    }
    return true;
  }, [pickPlan, pickStates, hasShortages]);

  const canSubmitComplete =
    canComplete && !hasShortages && allocationValid && targetLocationId != null && producedQty > 0 && !actionBusy;

  const setLineAuto = (lineId: number, useAuto: boolean) => {
    const line = pickPlan?.lines.find((l) => l.line_snapshot_id === lineId);
    if (!line) return;
    setPickStates((prev) =>
      prev.map((s) =>
        s.lineSnapshotId === lineId
          ? {
              ...s,
              useAuto,
              picks: useAuto
                ? line.auto_allocation.map((a) => ({
                    locationId: a.location_id,
                    code: a.location_code,
                    quantity: a.quantity,
                  }))
                : s.picks.length
                  ? s.picks
                  : [],
            }
          : s,
      ),
    );
  };

  const setPickQty = (lineId: number, locationId: number, qty: number) => {
    setPickStates((prev) =>
      prev.map((s) => {
        if (s.lineSnapshotId !== lineId) return s;
        return {
          ...s,
          useAuto: false,
          picks: s.picks.map((p) => (p.locationId === locationId ? { ...p, quantity: qty } : p)),
        };
      }),
    );
  };

  const toggleLocationPick = (line: ProductionPickLinePlanRead, locId: number, code: string, maxAvail: number) => {
    setPickStates((prev) =>
      prev.map((s) => {
        if (s.lineSnapshotId !== line.line_snapshot_id) return s;
        const exists = s.picks.find((p) => p.locationId === locId);
        if (exists) {
          return { ...s, useAuto: false, picks: s.picks.filter((p) => p.locationId !== locId) };
        }
        const already = s.picks.reduce((sum, p) => sum + p.quantity, 0);
        const need = Math.max(0, line.required - already);
        const take = Math.min(maxAvail, need);
        if (take <= 0) return s;
        return {
          ...s,
          useAuto: false,
          picks: [...s.picks, { locationId: locId, code, quantity: take }],
        };
      }),
    );
  };

  const buildAllocations = (): ComponentAllocationWrite[] => {
    const out: ComponentAllocationWrite[] = [];
    for (const st of pickStates) {
      for (const p of st.picks) {
        if (p.quantity > 0) {
          out.push({
            line_snapshot_id: st.lineSnapshotId,
            location_id: p.locationId,
            quantity: p.quantity,
          });
        }
      }
    }
    return out;
  };

  const handleStart = async () => {
    if (warehouseId == null) return;
    setActionBusy(true);
    setErr(null);
    try {
      const row = await startProductionOrder(tenantId, order.id, warehouseId);
      onOrderUpdated(row);
      onListRefresh();
    } catch (e: unknown) {
      setErr(parseApiErr(e));
    } finally {
      setActionBusy(false);
    }
  };

  const handleComplete = async () => {
    if (!targetLocationId || warehouseId == null) return;
    setActionBusy(true);
    setErr(null);
    try {
      const result = await completeProductionOrder(
        tenantId,
        order.id,
        {
          produced_quantity: producedQty,
          location_id: targetLocationId,
          component_allocations: buildAllocations(),
        },
        warehouseId,
      );
      rememberTargetLocation(order.warehouse_id, targetLocationId);
      setCompleteResult(result);
      onOrderUpdated(result.order);
      onListRefresh();
    } catch (e: unknown) {
      setErr(parseApiErr(e));
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm("Anulować zlecenie produkcyjne?") || warehouseId == null) return;
    setActionBusy(true);
    try {
      const row = await cancelProductionOrder(tenantId, order.id, warehouseId);
      onOrderUpdated(row);
      onListRefresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Anulowanie nie powiodło się.");
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="font-mono text-xs text-slate-500">{order.number}</p>
        <h3 className="text-lg font-bold text-slate-900">{order.product_name}</h3>
        <p className="text-sm text-slate-600">
          {order.recipe_name} · plan {order.planned_quantity} szt.
        </p>
        <span className={`mt-2 inline-block ${productionStatusBadgeClass(order.status)}`}>
          {PRODUCTION_STATUS_LABEL[order.status]}
        </span>
        {order.operator_name ? (
          <p className="mt-1 text-xs text-slate-500">Operator: {order.operator_name}</p>
        ) : null}
      </div>

      {err ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div>
      ) : null}

      {isDone && order.component_total_cost != null ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm space-y-1">
          <p>
            <span className="text-slate-500">Koszt komponentów:</span>{" "}
            <strong>{formatProductionMoney(order.component_total_cost)}</strong>
          </p>
          <p>
            <span className="text-slate-500">Wyprodukowano:</span> <strong>{order.produced_quantity} szt.</strong>
          </p>
          <p>
            <span className="text-slate-500">Koszt jednostkowy:</span>{" "}
            <strong>{formatProductionMoney(order.calculated_unit_cost)}</strong>
          </p>
        </div>
      ) : null}

      {(order.rw_stock_document_id || order.pw_stock_document_id) && (
        <div className="text-sm space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dokumenty magazynowe</p>
          {order.rw_stock_document_id ? (
            <p>
              <Link
                to={warehouseStockDocumentPath("RW", order.rw_stock_document_id)}
                className="font-medium text-violet-700 hover:underline"
              >
                RW {order.rw_document_number ?? `#${order.rw_stock_document_id}`}
              </Link>
            </p>
          ) : null}
          {order.pw_stock_document_id ? (
            <p>
              <Link
                to={warehouseStockDocumentPath("PW", order.pw_stock_document_id)}
                className="font-medium text-violet-700 hover:underline"
              >
                PW {order.pw_document_number ?? `#${order.pw_stock_document_id}`}
              </Link>
            </p>
          ) : null}
        </div>
      )}

      {hasShortages && pickPlan ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3">
          <div className="flex items-center gap-2 text-red-900 font-semibold text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            Braki magazynowe — nie można zakończyć produkcji
          </div>
          <ul className="mt-2 space-y-1 text-sm text-red-800">
            {pickPlan.shortages.map((s) => (
              <li key={s.component_product_id} className="flex justify-between gap-2">
                <span>{s.product_name}</span>
                <span className="shrink-0 font-mono text-xs">
                  wym. {s.required} · dost. {s.available} ·{" "}
                  <span className="font-bold">brak {s.missing}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canExecute ? (
        <>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              1. Pobór składników
            </p>
            {pickLoading ? (
              <p className="text-sm text-slate-500">Ładuję sugestie lokalizacji…</p>
            ) : (
              <div className="space-y-3">
                {pickPlan?.lines.map((line) => {
                  const st = pickStates.find((s) => s.lineSnapshotId === line.line_snapshot_id);
                  const pickedTotal = st?.picks.reduce((s, p) => s + p.quantity, 0) ?? 0;
                  const lineShort = line.missing > 1e-6;
                  return (
                    <div
                      key={line.line_snapshot_id}
                      className={`rounded-lg border p-3 ${lineShort ? "border-red-200 bg-red-50/50" : "border-slate-200 bg-white"}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-900">{line.product_name}</p>
                          <p className="text-xs text-slate-500">
                            Potrzeba: <strong>{line.required}</strong> · Dostępne: {line.available}
                            {lineShort ? (
                              <span className="ml-2 inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-red-800 font-medium">
                                <AlertTriangle className="h-3 w-3" aria-hidden />
                                brak {line.missing}
                              </span>
                            ) : null}
                          </p>
                        </div>
                        <div className="flex gap-2 text-xs">
                          <button
                            type="button"
                            className={`rounded px-2 py-1 ${st?.useAuto ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"}`}
                            onClick={() => setLineAuto(line.line_snapshot_id, true)}
                          >
                            Auto FIFO
                          </button>
                          <button
                            type="button"
                            className={`rounded px-2 py-1 ${st && !st.useAuto ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-600"}`}
                            onClick={() => setLineAuto(line.line_snapshot_id, false)}
                          >
                            Ręcznie
                          </button>
                        </div>
                      </div>
                      <ul className="mt-2 space-y-1">
                        {line.suggested_locations.slice(0, 12).map((loc) => {
                          const picked = st?.picks.find((p) => p.locationId === loc.location_id);
                          return (
                            <li
                              key={loc.location_id}
                              className="flex flex-wrap items-center gap-2 rounded border border-slate-100 px-2 py-1.5 text-sm"
                            >
                              <button
                                type="button"
                                className={`font-mono text-xs font-semibold ${picked ? "text-violet-700" : "text-slate-700"}`}
                                onClick={() =>
                                  toggleLocationPick(line, loc.location_id, loc.code, loc.available)
                                }
                              >
                                [{loc.code}]
                              </button>
                              <span className="text-slate-500">{loc.available} szt.</span>
                              {loc.is_suggested ? (
                                <span className="text-[10px] uppercase text-emerald-600">sugerowane</span>
                              ) : null}
                              {picked ? (
                                <input
                                  type="number"
                                  min={0}
                                  max={loc.available}
                                  step="any"
                                  className="w-20 rounded border border-slate-200 px-2 py-0.5 text-xs"
                                  value={picked.quantity}
                                  onChange={(e) =>
                                    setPickQty(
                                      line.line_snapshot_id,
                                      loc.location_id,
                                      Number(e.target.value) || 0,
                                    )
                                  }
                                />
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                      <p className="mt-2 text-xs text-slate-500">
                        Wybrane: <strong>{pickedTotal}</strong> / {line.required}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              2. Lokalizacja docelowa (wyroby gotowe)
            </p>
            <ProductionWarehouseLocationSearch
              tenantId={tenantId}
              warehouseId={order.warehouse_id}
              value={targetLocationId}
              valueLabel={targetLocationCode}
              recentLocationIds={recentIds}
              onChange={(id, code) => {
                setTargetLocationId(id);
                setTargetLocationCode(code);
              }}
            />
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              3. Ilość do przyjęcia
            </p>
            <input
              type="number"
              min={0.001}
              step="any"
              className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={producedQty}
              onChange={(e) => setProducedQty(Number(e.target.value) || 0)}
            />
          </div>
        </>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-2">
        {canStart ? (
          <button
            type="button"
            disabled={actionBusy}
            onClick={() => void handleStart()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            <Play className="h-4 w-4" aria-hidden />
            Start
          </button>
        ) : null}
        {canComplete ? (
          <button
            type="button"
            disabled={!canSubmitComplete}
            title={
              hasShortages
                ? "Uzupełnij braki magazynowe"
                : !targetLocationId
                  ? "Wybierz lokalizację docelową"
                  : !allocationValid
                    ? "Popraw alokację składników"
                    : undefined
            }
            onClick={() => void handleComplete()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            Zakończ produkcję
          </button>
        ) : null}
        {canCancel ? (
          <button
            type="button"
            disabled={actionBusy}
            onClick={() => void handleCancel()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <XCircle className="h-4 w-4" aria-hidden />
            Anuluj
          </button>
        ) : null}
      </div>

      {completeResult ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm space-y-2">
          <p className="font-semibold text-emerald-900">Produkcja zakończona</p>
          <p>
            Koszt komponentów: <strong>{formatProductionMoney(completeResult.component_total_cost)}</strong>
          </p>
          <p>
            Wyprodukowano: <strong>{completeResult.order.produced_quantity} szt.</strong> · koszt jdn.{" "}
            <strong>{formatProductionMoney(completeResult.calculated_unit_cost)}</strong>
          </p>
          <ul className="space-y-1 text-emerald-900">
            {completeResult.rw_stock_document_id ? (
              <li>
                <Link
                  to={warehouseStockDocumentPath("RW", completeResult.rw_stock_document_id)}
                  className="underline"
                >
                  RW {completeResult.rw_document_number ?? completeResult.rw_stock_document_id}
                </Link>
              </li>
            ) : null}
            {completeResult.pw_stock_document_id ? (
              <li>
                <Link
                  to={warehouseStockDocumentPath("PW", completeResult.pw_stock_document_id)}
                  className="underline"
                >
                  PW {completeResult.pw_document_number ?? completeResult.pw_stock_document_id}
                </Link>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function parseApiErr(e: unknown): string {
  if (e && typeof e === "object" && "response" in e) {
    const data = (e as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
    if (typeof data === "object" && data && "message" in data) {
      return String((data as { message: string }).message);
    }
    if (typeof data === "string") return data;
    try {
      return JSON.stringify(data);
    } catch {
      return "Błąd operacji.";
    }
  }
  return e instanceof Error ? e.message : "Błąd operacji.";
}
