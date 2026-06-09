import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Factory } from "lucide-react";
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
import { WmsProductionTerminalEmptyState } from "./WmsProductionTerminalEmptyState";
import { WmsProductionBatchQueueCard } from "./components/WmsProductionBatchQueueCard";
import { WmsProductionActiveBatchBar } from "./components/WmsProductionActiveBatchBar";
import { WMS_TASK_GRID, WMS_TERMINAL_LABEL } from "../../components/wms/execution/wmsLayoutTokens";

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
    <div className="w-full space-y-5">
      {!activeId ? (
        <div className="w-full space-y-4">
          <p className={WMS_TERMINAL_LABEL}>W produkcji</p>
          {queue.length === 0 ? (
            <WmsProductionTerminalEmptyState
              title="Brak partii w produkcji"
              description="Partie ze statusem „w produkcji” pojawią się tutaj do rejestracji postępu."
              icon={<Factory size={22} strokeWidth={2} />}
              onRefresh={() => void loadQueue()}
            />
          ) : (
            <div className={WMS_TASK_GRID}>
              {queue.map((b) => (
                <WmsProductionBatchQueueCard
                  key={b.id}
                  label="Partia"
                  number={b.number}
                  productLine={b.lines?.[0]?.product_name ?? undefined}
                  accent="blue"
                  statusBadge={
                    <span className={batchStatusBadgeClass(b.status)}>{BATCH_STATUS_LABEL[b.status]}</span>
                  }
                  onClick={() => {
                    setActiveId(b.id);
                    navigate(wmsProductionPaths.execute(b.id));
                  }}
                />
              ))}
            </div>
          )}
        </div>
      ) : batch ? (
        <>
          <WmsProductionActiveBatchBar label="W produkcji" number={batch.number} accent="blue" />

          <div className="w-full space-y-4">
            {batch.lines.map((ln) => {
              const remaining = Math.max(0, ln.planned_quantity - ln.completed_quantity);
              return (
                <div
                  key={ln.id}
                  className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="absolute bottom-0 left-0 top-0 w-1 bg-blue-400" aria-hidden />
                  <div className="pl-3">
                    <div className="flex items-center gap-4">
                      <ProductThumb name={ln.product_name ?? undefined} size="lg" />
                      <p className="text-xl font-bold text-slate-900">{ln.product_name}</p>
                    </div>
                    <div className="mt-4">
                      <p className={WMS_TERMINAL_LABEL}>Postęp</p>
                      <p className="mt-1 text-4xl font-black tabular-nums text-slate-900">
                        {ln.completed_quantity}
                        <span className="text-xl font-bold text-slate-400"> / {ln.planned_quantity}</span>
                      </p>
                      <div className="mt-3">
                        <ProgressBar
                          value={ln.completed_quantity}
                          max={ln.planned_quantity || 1}
                          tone="emerald"
                        />
                      </div>
                    </div>
                    <div className="mt-5 grid grid-cols-3 gap-3">
                      <button
                        type="button"
                        disabled={busy || remaining <= 0}
                        onClick={() => void addQty(ln.id, 1)}
                        className="rounded-xl bg-slate-900 py-4 text-xl font-black text-white hover:bg-slate-800 disabled:opacity-40"
                      >
                        +1
                      </button>
                      <button
                        type="button"
                        disabled={busy || remaining <= 0}
                        onClick={() => void addQty(ln.id, 5)}
                        className="rounded-xl bg-slate-700 py-4 text-xl font-black text-white hover:bg-slate-600 disabled:opacity-40"
                      >
                        +5
                      </button>
                      <button
                        type="button"
                        disabled={busy || remaining <= 0}
                        onClick={() => void addQty(ln.id, remaining)}
                        className="rounded-xl border border-emerald-300 bg-emerald-50 py-3 text-sm font-bold text-emerald-900 hover:bg-emerald-100 disabled:opacity-40"
                      >
                        Zakończ krok
                      </button>
                    </div>
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
              className="w-full max-w-xl rounded-xl bg-blue-600 py-4 text-lg font-bold text-white hover:bg-blue-700 disabled:opacity-40"
            >
              Zakończ produkcję → odkładanie
            </button>
          ) : null}

          <Link to={wmsProductionPaths.collecting()} className="block text-sm text-slate-500 underline">
            Menu zbierania
          </Link>
        </>
      ) : (
        <p className="text-sm text-slate-500">Wczytywanie…</p>
      )}
    </div>
  );
}
