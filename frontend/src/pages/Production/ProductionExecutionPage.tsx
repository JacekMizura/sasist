import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { useWarehouse } from "../../context/WarehouseContext";
import {
  finishProductionPhase,
  getProductionBatch,
  listProductionBatches,
  updateProductionProgress,
  type ProductionBatchRead,
} from "../../api/productionApi";
import { BATCH_STATUS_LABEL, batchStatusBadgeClass } from "./productionUi";
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
      navigate(`/production/putaway/${activeId}`);
    } finally {
      setBusy(false);
    }
  };

  const allDone = batch?.lines.every((l) => l.completed_quantity >= l.planned_quantity - 1e-6);

  return (
    <div className="px-4 py-6 lg:px-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Produkcja</h1>
        <p className="text-sm text-slate-500">Proste ekrany operatorskie — ile zbudować, bez pól ERP.</p>
      </div>

      {!activeId ? (
        <div className="space-y-3">
          {queue.length === 0 ? (
            <p className="text-sm text-slate-500">Brak partii w produkcji.</p>
          ) : (
            queue.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  setActiveId(b.id);
                  navigate(`/production/execute/${b.id}`);
                }}
                className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-blue-300"
              >
                <span className="font-mono font-bold">{b.number}</span>
                <span className={`ml-2 ${batchStatusBadgeClass(b.status)}`}>{BATCH_STATUS_LABEL[b.status]}</span>
              </button>
            ))
          )}
        </div>
      ) : batch ? (
        <>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="font-mono font-bold text-blue-900">{batch.number}</p>
            <ProgressBar
              value={batch.total_completed_units ?? 0}
              max={batch.total_planned_units ?? 1}
              label="Wyprodukowano sztuk"
              tone="emerald"
            />
          </div>

          <div className="space-y-5">
            {batch.lines.map((ln) => (
              <div key={ln.id} className="rounded-2xl border-2 border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex gap-4">
                  <ProductThumb name={ln.product_name ?? undefined} size="lg" />
                  <div className="flex-1">
                    <p className="text-xl font-bold text-slate-900">{ln.product_name}</p>
                    <p className="mt-2 text-sm text-slate-500">
                      Cel: <strong className="text-slate-800">{ln.planned_quantity}</strong>
                    </p>
                    <p className="text-3xl font-bold text-blue-700 mt-1">{ln.completed_quantity}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void addQty(ln.id, 1)}
                    className="rounded-xl bg-slate-800 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
                  >
                    +1
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void addQty(ln.id, 5)}
                    className="rounded-xl bg-slate-700 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    +5
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void addQty(ln.id, Math.max(0, ln.planned_quantity - ln.completed_quantity))}
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    Zakończ wszystkie
                  </button>
                </div>
              </div>
            ))}
          </div>

          {allDone ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void finish()}
              className="sticky bottom-4 w-full rounded-2xl bg-blue-600 py-4 text-base font-bold text-white shadow-lg hover:bg-blue-700"
            >
              Zakończ produkcję → odkładanie
            </button>
          ) : null}

          <Link to={`/production/batches/${activeId}`} className="block text-center text-sm text-slate-500 hover:underline">
            Szczegóły partii
          </Link>
        </>
      ) : (
        <p className="text-sm text-slate-500">Wczytywanie…</p>
      )}
    </div>
  );
}
