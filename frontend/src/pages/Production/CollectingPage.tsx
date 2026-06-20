import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, Check, ClipboardList, MapPin, ScanLine } from "lucide-react";
import toast from "react-hot-toast";
import { useWarehouse } from "../../context/WarehouseContext";
import {
  fetchCollectionState,
  finishCollectingBatch,
  getProductionBatch,
  listProductionBatches,
  startCollectingBatch,
  updateCollectionTask,
  type BatchCollectionStateRead,
  type ProductionBatchRead,
} from "../../api/productionApi";
import { BATCH_STATUS_LABEL, batchStatusBadgeClass } from "./productionUi";
import { wmsProductionPaths } from "./productionPaths";
import { ProductThumb } from "./components/ProductThumb";
import { ProgressBar } from "./components/ProgressBar";
import { WmsProductionTerminalEmptyState } from "./WmsProductionTerminalEmptyState";
import { WmsProductionBatchQueueCard } from "./components/WmsProductionBatchQueueCard";
import { WmsProductionActiveBatchBar } from "./components/WmsProductionActiveBatchBar";
import { WMS_TASK_GRID, WMS_TERMINAL_LABEL } from "../../components/wms/execution/wmsLayoutTokens";
import { START_COLLECTING_BLOCKED_TOOLTIP, formatStartCollectingError } from "./productionUi";

const DEFAULT_TENANT = 1;

export default function CollectingPage() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;
  const [queue, setQueue] = useState<ProductionBatchRead[]>([]);
  const [batch, setBatch] = useState<ProductionBatchRead | null>(null);
  const [state, setState] = useState<BatchCollectionStateRead | null>(null);
  const [activeBatchId, setActiveBatchId] = useState<number | null>(batchId ? Number(batchId) : null);
  const [busy, setBusy] = useState(false);

  const loadQueue = useCallback(async () => {
    const rows = await listProductionBatches(tenantId, { status: "collecting", warehouse_id: warehouseId });
    const planned = await listProductionBatches(tenantId, { status: "planned", warehouse_id: warehouseId });
    setQueue([...rows, ...planned]);
  }, [tenantId, warehouseId]);

  const loadState = useCallback(async (id: number) => {
    if (warehouseId == null) {
      setState(null);
      setBatch(null);
      return;
    }
    try {
      const [s, b] = await Promise.all([
        fetchCollectionState(tenantId, id, warehouseId),
        getProductionBatch(tenantId, id, warehouseId),
      ]);
      setState(s);
      setBatch(b);
    } catch {
      setState(null);
      setBatch(null);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (activeBatchId != null) void loadState(activeBatchId);
  }, [activeBatchId, loadState]);

  const openBatch = async (b: ProductionBatchRead) => {
    if (warehouseId == null) return;
    if (b.status === "planned" && b.has_shortages) {
      toast.error(START_COLLECTING_BLOCKED_TOOLTIP);
      return;
    }
    if (b.status === "planned") {
      try {
        await startCollectingBatch(tenantId, b.id, warehouseId);
      } catch (e: unknown) {
        toast.error(formatStartCollectingError(e));
        return;
      }
    }
    setActiveBatchId(b.id);
    navigate(wmsProductionPaths.collecting(b.id));
    await loadState(b.id);
  };

  const confirmTask = async (taskKey: string, required: number) => {
    if (activeBatchId == null || warehouseId == null) return;
    setBusy(true);
    try {
      const next = await updateCollectionTask(
        tenantId,
        activeBatchId,
        {
          task_key: taskKey,
          collected_qty: required,
        },
        warehouseId,
      );
      setState(next);
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (activeBatchId == null || warehouseId == null) return;
    setBusy(true);
    try {
      await finishCollectingBatch(tenantId, activeBatchId, warehouseId);
      navigate(wmsProductionPaths.execute(activeBatchId));
    } finally {
      setBusy(false);
    }
  };

  const batchLabel = batch?.lines?.map((l) => l.product_name).filter(Boolean).join(", ") ?? "—";
  const batchQty = batch?.total_planned_units ?? 0;

  return (
    <div className="w-full space-y-5">
      {!activeBatchId ? (
        <div className="w-full space-y-4">
          <p className={WMS_TERMINAL_LABEL}>Kolejka zbierania</p>
          {queue.length === 0 ? (
            <WmsProductionTerminalEmptyState
              title="Brak partii do zbierania"
              description="Gdy partia przejdzie do etapu zbierania surowców, pojawi się tutaj."
              icon={<ClipboardList size={22} strokeWidth={2} />}
              onRefresh={() => void loadQueue()}
            />
          ) : (
            <div className={WMS_TASK_GRID}>
              {queue.map((b) => {
                const blocked = b.status === "planned" && Boolean(b.has_shortages);
                return (
                  <WmsProductionBatchQueueCard
                    key={b.id}
                    label="Partia"
                    number={b.number}
                    productLine={b.lines?.[0]?.product_name ?? `${b.products_count ?? 0} produktów`}
                    quantity={b.total_planned_units ?? 0}
                    accent="amber"
                    disabled={blocked}
                    disabledTitle={blocked ? START_COLLECTING_BLOCKED_TOOLTIP : undefined}
                    statusBadge={
                      <>
                        <span className={batchStatusBadgeClass(b.status)}>{BATCH_STATUS_LABEL[b.status]}</span>
                        {blocked ? (
                          <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-900">
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                            Braki materiałów
                          </span>
                        ) : null}
                      </>
                    }
                    onClick={() => void openBatch(b)}
                  />
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          <WmsProductionActiveBatchBar
            label="Partia"
            number={batch?.number ?? "—"}
            productLine={batchLabel}
            quantity={batchQty}
            accent="amber"
          />

          {state ? (
            <div className="w-full rounded-xl border border-slate-200 bg-white p-4">
              <ProgressBar
                value={state.collected_count}
                max={state.total_count || 1}
                label={`Zebrano ${state.collected_count} / ${state.total_count}`}
                tone="amber"
              />
            </div>
          ) : null}

          <div className="w-full space-y-4">
            {(state?.tasks ?? []).map((t) => {
              const done = t.collected_qty >= t.required_qty - 1e-6;
              return (
                <div
                  key={t.task_key}
                  className={`relative overflow-hidden rounded-2xl border bg-white p-5 shadow-sm ${
                    done ? "border-emerald-200" : "border-slate-200"
                  }`}
                >
                  <div
                    className={`absolute bottom-0 left-0 top-0 w-1 ${done ? "bg-emerald-400" : "bg-amber-400"}`}
                    aria-hidden
                  />
                  <div className="pl-3">
                    <p className={WMS_TERMINAL_LABEL}>Lokalizacja</p>
                    <p className="mt-1 inline-flex items-center gap-2 font-mono text-2xl font-black text-slate-900">
                      <MapPin className="h-6 w-6 text-amber-600" aria-hidden />
                      {t.location_code}
                    </p>
                    <p className="mt-3 text-lg font-bold text-slate-900">{t.product_name}</p>
                    <p className="mt-1 text-3xl font-black tabular-nums text-slate-900">
                      {t.required_qty}
                      <span className="ml-1 text-sm font-semibold text-slate-500">szt.</span>
                    </p>
                    {!done ? (
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void confirmTask(t.task_key, t.required_qty)}
                          className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-4 text-base font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <Check className="h-5 w-5" aria-hidden />
                          Potwierdź
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void confirmTask(t.task_key, t.required_qty)}
                          className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 py-3 text-sm font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                        >
                          <ScanLine className="h-4 w-4" aria-hidden />
                          Skanuj
                        </button>
                      </div>
                    ) : (
                      <p className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-emerald-700">
                        <Check className="h-4 w-4" aria-hidden />
                        Zebrane
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {state && state.collected_count >= state.total_count && state.total_count > 0 ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void finish()}
              className="w-full max-w-xl rounded-xl bg-emerald-600 py-4 text-lg font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Zakończ zbieranie →
            </button>
          ) : null}

          <Link
            to={wmsProductionPaths.collecting()}
            onClick={() => setActiveBatchId(null)}
            className="block text-sm font-medium text-slate-500 underline"
          >
            Wróć do kolejki
          </Link>
        </>
      )}
    </div>
  );
}
