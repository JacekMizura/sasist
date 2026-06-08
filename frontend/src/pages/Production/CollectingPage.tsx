import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check, ClipboardList, MapPin, ScanLine } from "lucide-react";
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
    try {
      const [s, b] = await Promise.all([fetchCollectionState(tenantId, id), getProductionBatch(tenantId, id)]);
      setState(s);
      setBatch(b);
    } catch {
      setState(null);
      setBatch(null);
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
    navigate(wmsProductionPaths.collecting(b.id));
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
      navigate(wmsProductionPaths.execute(activeBatchId));
    } finally {
      setBusy(false);
    }
  };

  const batchLabel = batch?.lines?.map((l) => l.product_name).filter(Boolean).join(", ") ?? "—";
  const batchQty = batch?.total_planned_units ?? 0;

  return (
    <div className="space-y-6">
      {!activeBatchId ? (
        <div className="space-y-4">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Kolejka zbierania</p>
          {queue.length === 0 ? (
            <WmsProductionTerminalEmptyState
              title="Brak partii do zbierania"
              description="Gdy partia przejdzie do zbierania surowców, pojawi się tutaj na liście."
              icon={<ClipboardList size={40} strokeWidth={1.5} />}
            />
          ) : (
            queue.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => void openBatch(b)}
                className="w-full rounded-2xl border-2 border-amber-300 bg-white p-6 text-left shadow-md active:scale-[0.99] transition"
              >
                <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Partia</p>
                <p className="mt-1 font-mono text-2xl font-black text-slate-900">{b.number}</p>
                <p className="mt-2 text-lg font-semibold text-slate-800">
                  {b.lines?.[0]?.product_name ?? `${b.products_count ?? 0} produktów`}
                </p>
                <p className="mt-1 text-3xl font-black text-amber-800">{b.total_planned_units ?? 0} szt.</p>
                <span className={`mt-3 inline-block ${batchStatusBadgeClass(b.status)}`}>{BATCH_STATUS_LABEL[b.status]}</span>
              </button>
            ))
          )}
        </div>
      ) : (
        <>
          <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-5 text-center shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-800">Partia</p>
            <p className="font-mono text-2xl font-black text-slate-900">{batch?.number ?? "—"}</p>
            <p className="mt-1 text-lg font-bold text-slate-800">{batchLabel}</p>
            <p className="text-4xl font-black text-amber-900">{batchQty} szt.</p>
          </div>

          {state ? (
            <div className="rounded-xl border border-amber-200 bg-white p-4">
              <ProgressBar
                value={state.collected_count}
                max={state.total_count || 1}
                label={`Zebrano ${state.collected_count} / ${state.total_count}`}
                tone="amber"
              />
            </div>
          ) : null}

          <div className="space-y-5">
            {(state?.tasks ?? []).map((t) => {
              const done = t.collected_qty >= t.required_qty - 1e-6;
              return (
                <div
                  key={t.task_key}
                  className={`rounded-2xl border-4 p-6 shadow-lg ${done ? "border-emerald-400 bg-emerald-50" : "border-slate-300 bg-white"}`}
                >
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Lokalizacja</p>
                  <p className="mt-1 inline-flex items-center gap-2 font-mono text-3xl font-black text-slate-900">
                    <MapPin className="h-8 w-8 text-amber-600" aria-hidden />
                    {t.location_code}
                  </p>
                  <p className="mt-4 text-xl font-bold text-slate-900">{t.product_name}</p>
                  <p className="mt-2 text-4xl font-black text-amber-800">
                    {t.required_qty} <span className="text-lg font-semibold text-slate-500">szt.</span>
                  </p>
                  {!done ? (
                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void confirmTask(t.task_key, t.required_qty)}
                        className="col-span-2 inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-5 text-lg font-bold text-white hover:bg-emerald-700 disabled:opacity-50 active:scale-[0.98]"
                      >
                        <Check className="h-6 w-6" aria-hidden />
                        Potwierdź
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void confirmTask(t.task_key, t.required_qty)}
                        className="col-span-2 inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-amber-500 bg-amber-50 py-4 text-base font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                      >
                        <ScanLine className="h-5 w-5" aria-hidden />
                        Skanuj
                      </button>
                    </div>
                  ) : (
                    <p className="mt-5 inline-flex items-center gap-2 text-lg font-bold text-emerald-700">
                      <Check className="h-5 w-5" aria-hidden />
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
              className="sticky bottom-4 w-full rounded-2xl bg-emerald-600 py-5 text-xl font-black text-white shadow-xl hover:bg-emerald-700 disabled:opacity-50 active:scale-[0.99]"
            >
              Zakończ zbieranie →
            </button>
          ) : null}

          <Link
            to={wmsProductionPaths.collecting()}
            onClick={() => setActiveBatchId(null)}
            className="block text-center text-sm font-medium text-slate-500 underline"
          >
            Wróć do kolejki
          </Link>
        </>
      )}
    </div>
  );
}
