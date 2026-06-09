import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MapPin, PackageCheck } from "lucide-react";
import { useWarehouse } from "../../context/WarehouseContext";
import {
  finishPutawayBatch,
  getProductionBatch,
  listProductionBatches,
  type ProductionBatchRead,
} from "../../api/productionApi";
import { BATCH_STATUS_LABEL, batchStatusBadgeClass } from "./productionUi";
import { ProductThumb } from "./components/ProductThumb";
import { ProductionWarehouseLocationSearch } from "./ProductionWarehouseLocationSearch";
import { loadRecentTargetLocations, rememberTargetLocation } from "./productionUi";
import { wmsProductionPaths } from "./productionPaths";
import { WmsProductionTerminalEmptyState } from "./WmsProductionTerminalEmptyState";
import { WmsProductionBatchQueueCard } from "./components/WmsProductionBatchQueueCard";
import { WmsProductionActiveBatchBar } from "./components/WmsProductionActiveBatchBar";
import { WMS_TASK_GRID, WMS_TERMINAL_LABEL } from "../../components/wms/execution/wmsLayoutTokens";

const DEFAULT_TENANT = 1;

export default function PutawayPage() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;
  const [queue, setQueue] = useState<ProductionBatchRead[]>([]);
  const [batch, setBatch] = useState<ProductionBatchRead | null>(null);
  const [activeId, setActiveId] = useState<number | null>(batchId ? Number(batchId) : null);
  const [targets, setTargets] = useState<Record<number, { id: number | null; code: string | null }>>({});
  const [busy, setBusy] = useState(false);

  const loadQueue = useCallback(async () => {
    setQueue(await listProductionBatches(tenantId, { status: "putaway", warehouse_id: warehouseId }));
  }, [tenantId, warehouseId]);

  const loadBatch = useCallback(async (id: number) => {
    const b = await getProductionBatch(tenantId, id);
    setBatch(b);
    const t: Record<number, { id: number | null; code: string | null }> = {};
    b.lines.forEach((ln) => {
      t[ln.id] = { id: ln.target_location_id ?? null, code: ln.target_location_name ?? null };
    });
    setTargets(t);
  }, [tenantId]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    if (activeId != null) void loadBatch(activeId);
  }, [activeId, loadBatch]);

  const confirmPutaway = async () => {
    if (activeId == null || !batch || !warehouseId) return;
    const lines = batch.lines
      .filter((ln) => targets[ln.id]?.id)
      .map((ln) => ({ line_id: ln.id, target_location_id: targets[ln.id]!.id! }));
    if (lines.length !== batch.lines.length) {
      alert("Wybierz lokalizację docelową dla każdego produktu.");
      return;
    }
    setBusy(true);
    try {
      await finishPutawayBatch(tenantId, activeId, { lines });
      lines.forEach((l) => rememberTargetLocation(warehouseId, l.target_location_id));
      navigate(wmsProductionPaths.collecting());
    } finally {
      setBusy(false);
    }
  };

  const recentIds = batch ? loadRecentTargetLocations(batch.warehouse_id) : [];

  return (
    <div className="w-full space-y-5">
      {!activeId ? (
        <div className="w-full space-y-4">
          <p className={WMS_TERMINAL_LABEL}>Odkładanie wyrobów</p>
          {queue.length === 0 ? (
            <WmsProductionTerminalEmptyState
              title="Brak partii do odłożenia"
              description="Po zakończeniu produkcji partie oczekujące na odkładanie wyrobów gotowych pojawią się tutaj."
              icon={<PackageCheck size={22} strokeWidth={2} />}
              onRefresh={() => void loadQueue()}
            />
          ) : (
            <div className={WMS_TASK_GRID}>
              {queue.map((b) => (
                <WmsProductionBatchQueueCard
                  key={b.id}
                  label="Partia"
                  number={b.number}
                  accent="emerald"
                  statusBadge={
                    <span className={batchStatusBadgeClass(b.status)}>{BATCH_STATUS_LABEL[b.status]}</span>
                  }
                  onClick={() => {
                    setActiveId(b.id);
                    navigate(wmsProductionPaths.putaway(b.id));
                  }}
                />
              ))}
            </div>
          )}
        </div>
      ) : batch ? (
        <>
          <WmsProductionActiveBatchBar
            label="Odkładanie wyrobów gotowych"
            number={batch.number}
            accent="emerald"
          />

          <div className="w-full space-y-4">
            {batch.lines.map((ln) => {
              const qty = ln.completed_quantity || ln.planned_quantity;
              return (
                <div
                  key={ln.id}
                  className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="absolute bottom-0 left-0 top-0 w-1 bg-emerald-400" aria-hidden />
                  <div className="pl-3">
                    <div className="flex items-center gap-4">
                      <ProductThumb name={ln.product_name ?? undefined} size="lg" />
                      <div>
                        <p className={WMS_TERMINAL_LABEL}>Produkt</p>
                        <p className="text-xl font-bold text-slate-900">{ln.product_name}</p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className={WMS_TERMINAL_LABEL}>Ilość</p>
                        <p className="mt-1 text-3xl font-black tabular-nums text-slate-900">{qty}</p>
                      </div>
                      <div>
                        <p className="mb-2 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                          <MapPin className="h-3.5 w-3.5" aria-hidden />
                          Lokacja docelowa
                        </p>
                        <ProductionWarehouseLocationSearch
                          tenantId={tenantId}
                          warehouseId={batch.warehouse_id}
                          value={targets[ln.id]?.id ?? null}
                          valueLabel={targets[ln.id]?.code ?? null}
                          recentLocationIds={recentIds}
                          onChange={(id, code) => setTargets((prev) => ({ ...prev, [ln.id]: { id, code } }))}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => void confirmPutaway()}
            className="w-full max-w-xl rounded-xl bg-emerald-600 py-4 text-lg font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Potwierdź odkładanie
          </button>

          <Link to={wmsProductionPaths.execute(activeId)} className="block text-sm text-slate-500 underline">
            Wróć do produkcji
          </Link>
        </>
      ) : (
        <p className="text-sm text-slate-500">Wczytywanie…</p>
      )}
    </div>
  );
}
