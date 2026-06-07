import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check, MapPin, ScanLine } from "lucide-react";
import { useWarehouse } from "../../context/WarehouseContext";
import {
  fetchCollectionState,
  finishCollectingBatch,
  listProductionBatches,
  startCollectingBatch,
  updateCollectionTask,
  type BatchCollectionStateRead,
  type ProductionBatchRead,
} from "../../api/productionApi";
import { BATCH_STATUS_LABEL, batchStatusBadgeClass } from "./productionUi";
import { productionPaths } from "./productionPaths";
import { ProductThumb } from "./components/ProductThumb";
import { ProgressBar } from "./components/ProgressBar";

const DEFAULT_TENANT = 1;

export default function CollectingPage() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;
  const [queue, setQueue] = useState<ProductionBatchRead[]>([]);
  const [state, setState] = useState<BatchCollectionStateRead | null>(null);
  const [activeBatchId, setActiveBatchId] = useState<number | null>(batchId ? Number(batchId) : null);
  const [busy, setBusy] = useState(false);

  const loadQueue = useCallback(async () => {
    const rows = await listProductionBatches(tenantId, { status: "collecting", warehouse_id: warehouseId });
    const planned = await listProductionBatches(tenantId, { status: "planned", warehouse_id: warehouseId });
    setQueue([...rows, ...planned]);
  }, [tenantId, warehouseId]);

  const loadState = useCallback(async (id: number) => {
    try {
      setState(await fetchCollectionState(tenantId, id));
    } catch {
      setState(null);
    }
  }, [tenantId]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (activeBatchId != null) void loadState(activeBatchId);
  }, [activeBatchId, loadState]);

  const openBatch = async (b: ProductionBatchRead) => {
    if (b.status === "planned") {
      await startCollectingBatch(tenantId, b.id);
    }
    setActiveBatchId(b.id);
    navigate(productionPaths.collecting(b.id));
    await loadState(b.id);
  };

  const confirmTask = async (taskKey: string, required: number) => {
    if (activeBatchId == null) return;
    setBusy(true);
    try {
      const next = await updateCollectionTask(tenantId, activeBatchId, {
        task_key: taskKey,
        collected_qty: required,
      });
      setState(next);
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (activeBatchId == null) return;
    setBusy(true);
    try {
      await finishCollectingBatch(tenantId, activeBatchId);
      navigate(productionPaths.execute(activeBatchId));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 py-6 lg:px-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Zbieranie surowców</h1>
        <p className="text-sm text-slate-500">Idź do lokacji → potwierdź ilość. Przygotowane pod skaner.</p>
      </div>

      {!activeBatchId ? (
        <div className="space-y-3">
          {queue.length === 0 ? (
            <p className="text-sm text-slate-500">Brak partii do zbierania.</p>
          ) : (
            queue.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => void openBatch(b)}
                className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-amber-300"
              >
                <span className="font-mono font-bold">{b.number}</span>
                <span className={`ml-2 ${batchStatusBadgeClass(b.status)}`}>{BATCH_STATUS_LABEL[b.status]}</span>
              </button>
            ))
          )}
        </div>
      ) : (
        <>
          {state ? (
            <div className="sticky top-0 z-10 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <ProgressBar
                value={state.collected_count}
                max={state.total_count || 1}
                label={`Zebrano ${state.collected_count} / ${state.total_count} pozycji`}
                tone="amber"
              />
            </div>
          ) : null}

          <div className="space-y-4">
            {(state?.tasks ?? []).map((t) => {
              const done = t.collected_qty >= t.required_qty - 1e-6;
              return (
                <div
                  key={t.task_key}
                  className={`rounded-2xl border-2 p-5 shadow-sm ${done ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}
                >
                  <div className="flex items-start gap-4">
                    <ProductThumb imageUrl={t.product_image_url} name={t.product_name} size="lg" />
                    <div className="flex-1">
                      <p className="text-lg font-bold text-slate-900">{t.product_name}</p>
                      <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
                        <MapPin className="h-4 w-4" aria-hidden />
                        {t.location_code}
                      </p>
                      <p className="mt-3 text-2xl font-bold text-amber-800">
                        {t.collected_qty} / {t.required_qty}
                      </p>
                    </div>
                  </div>
                  {!done ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void confirmTask(t.task_key, t.required_qty)}
                      className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 py-3 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      <ScanLine className="h-5 w-5" aria-hidden />
                      Potwierdź {t.required_qty} szt.
                    </button>
                  ) : (
                    <p className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-emerald-700">
                      <Check className="h-4 w-4" aria-hidden />
                      Zebrane
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {state && state.collected_count >= state.total_count && state.total_count > 0 ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void finish()}
              className="sticky bottom-4 w-full rounded-2xl bg-emerald-600 py-4 text-base font-bold text-white shadow-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              Zakończ zbieranie
            </button>
          ) : null}

          <Link to={productionPaths.home} className="block text-center text-sm text-slate-500 hover:underline">
            Wróć do partii
          </Link>
        </>
      )}
    </div>
  );
}
