import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useWarehouse } from "../../context/WarehouseContext";
import {
  finishProductionPhase,
  getProductionBatch,
  listProductionBatches,
  updateProductionProgress,
  type ProductionBatchRead,
} from "../../api/productionApi";
import { BATCH_STATUS_LABEL, batchStatusBadgeClass } from "./productionUi";
import { wmsProductionPaths } from "./productionPaths";
import { ProductThumb } from "./components/ProductThumb";
import { ProgressBar } from "./components/ProgressBar";

const DEFAULT_TENANT = 1;

export default function ProductionExecutionPage() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;
  const [queue, setQueue] = useState<ProductionBatchRead[]>([]);
  const [batch, setBatch] = useState<ProductionBatchRead | null>(null);
  const [activeId, setActiveId] = useState<number | null>(batchId ? Number(batchId) : null);
  const [busy, setBusy] = useState(false);

  const loadQueue = useCallback(async () => {
    setQueue(await listProductionBatches(tenantId, { status: "in_progress", warehouse_id: warehouseId }));
  }, [tenantId, warehouseId]);

  const loadBatch = useCallback(async (id: number) => {
    setBatch(await getProductionBatch(tenantId, id));
  }, [tenantId]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (activeId != null) void loadBatch(activeId);
  }, [activeId, loadBatch]);

  const addQty = async (lineId: number, add: number) => {
    if (activeId == null) return;
    setBusy(true);
    try {
      const updated = await updateProductionProgress(tenantId, activeId, { line_id: lineId, add_quantity: add });
      setBatch(updated);
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (activeId == null) return;
    setBusy(true);
    try {
      await finishProductionPhase(tenantId, activeId);
      navigate(wmsProductionPaths.putaway(activeId));
    } finally {
      setBusy(false);
    }
  };

  const allDone = batch?.lines.every((l) => l.completed_quantity >= l.planned_quantity - 1e-6);

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      {!activeId ? (
        <div className="space-y-4">
          <p className="text-center text-xs font-bold uppercase tracking-widest text-slate-500">W produkcji</p>
          {queue.length === 0 ? (
            <p className="rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center text-base text-slate-500">
              Brak partii w produkcji.
            </p>
          ) : (
            queue.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  setActiveId(b.id);
                  navigate(wmsProductionPaths.execute(b.id));
                }}
                className="w-full rounded-2xl border-2 border-blue-300 bg-white p-6 text-left shadow-md active:scale-[0.99]"
              >
                <p className="font-mono text-2xl font-black text-slate-900">{b.number}</p>
                <span className={`mt-2 inline-block ${batchStatusBadgeClass(b.status)}`}>{BATCH_STATUS_LABEL[b.status]}</span>
              </button>
            ))
          )}
        </div>
      ) : batch ? (
        <>
          <div className="rounded-2xl border-2 border-blue-400 bg-blue-50 p-5 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-800">W produkcji</p>
            <p className="font-mono text-lg font-bold text-slate-600">{batch.number}</p>
          </div>

          <div className="space-y-6">
            {batch.lines.map((ln) => {
              const remaining = Math.max(0, ln.planned_quantity - ln.completed_quantity);
              return (
                <div key={ln.id} className="rounded-2xl border-4 border-slate-300 bg-white p-6 shadow-lg">
                  <div className="flex items-center gap-4">
                    <ProductThumb name={ln.product_name ?? undefined} size="lg" />
                    <p className="text-2xl font-black text-slate-900">{ln.product_name}</p>
                  </div>
                  <div className="mt-5">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Postęp</p>
                    <p className="mt-1 text-5xl font-black text-blue-700">
                      {ln.completed_quantity}
                      <span className="text-2xl font-bold text-slate-400"> / {ln.planned_quantity}</span>
                    </p>
                    <div className="mt-3">
                      <ProgressBar
                        value={ln.completed_quantity}
                        max={ln.planned_quantity || 1}
                        tone="emerald"
                      />
                    </div>
                  </div>
                  <div className="mt-6 grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      disabled={busy || remaining <= 0}
                      onClick={() => void addQty(ln.id, 1)}
                      className="rounded-2xl bg-slate-900 py-6 text-2xl font-black text-white hover:bg-slate-800 disabled:opacity-40 active:scale-95"
                    >
                      +1
                    </button>
                    <button
                      type="button"
                      disabled={busy || remaining <= 0}
                      onClick={() => void addQty(ln.id, 5)}
                      className="rounded-2xl bg-slate-700 py-6 text-2xl font-black text-white hover:bg-slate-600 disabled:opacity-40 active:scale-95"
                    >
                      +5
                    </button>
                    <button
                      type="button"
                      disabled={busy || remaining <= 0}
                      onClick={() => void addQty(ln.id, remaining)}
                      className="rounded-2xl border-2 border-emerald-500 bg-emerald-50 py-4 text-sm font-bold text-emerald-900 hover:bg-emerald-100 disabled:opacity-40"
                    >
                      Zakończ krok
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {allDone ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void finish()}
              className="sticky bottom-4 w-full rounded-2xl bg-blue-600 py-5 text-xl font-black text-white shadow-xl hover:bg-blue-700 active:scale-[0.99]"
            >
              Zakończ produkcję → odkładanie
            </button>
          ) : null}

          <Link to={wmsProductionPaths.collecting()} className="block text-center text-sm text-slate-500 underline">
            Menu zbierania
          </Link>
        </>
      ) : (
        <p className="text-center text-slate-500">Wczytywanie…</p>
      )}
    </div>
  );
}
