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
    <div className="space-y-6">
      {!activeId ? (
        <div className="space-y-4">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Odkładanie wyrobów</p>
          {queue.length === 0 ? (
            <WmsProductionTerminalEmptyState
              title="Brak partii do odłożenia"
              description="Po zakończeniu produkcji partie oczekujące na odkładanie wyrobów gotowych pojawią się tutaj."
              icon={<PackageCheck size={40} strokeWidth={1.5} />}
            />
          ) : (
            queue.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  setActiveId(b.id);
                  navigate(wmsProductionPaths.putaway(b.id));
                }}
                className="w-full rounded-2xl border-2 border-emerald-300 bg-white p-6 text-left shadow-md active:scale-[0.99]"
              >
                <p className="font-mono text-2xl font-black text-slate-900">{b.number}</p>
                <span className={`mt-2 inline-block ${batchStatusBadgeClass(b.status)}`}>{BATCH_STATUS_LABEL[b.status]}</span>
              </button>
            ))
          )}
        </div>
      ) : batch ? (
        <>
          <div className="rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-5 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-800">Odkładanie wyrobów gotowych</p>
            <p className="font-mono text-lg font-bold text-slate-600">{batch.number}</p>
          </div>

          <div className="space-y-5">
            {batch.lines.map((ln) => {
              const qty = ln.completed_quantity || ln.planned_quantity;
              return (
                <div key={ln.id} className="rounded-2xl border-4 border-emerald-300 bg-white p-6 shadow-lg">
                  <div className="flex items-center gap-4">
                    <ProductThumb name={ln.product_name ?? undefined} size="lg" />
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Produkt</p>
                      <p className="text-2xl font-black text-slate-900">{ln.product_name}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Ilość</p>
                      <p className="text-4xl font-black text-emerald-800">{qty}</p>
                    </div>
                    <div>
                      <p className="mb-2 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                        <MapPin className="h-4 w-4" aria-hidden />
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
              );
            })}
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => void confirmPutaway()}
            className="sticky bottom-4 w-full rounded-2xl bg-emerald-600 py-5 text-xl font-black text-white shadow-xl hover:bg-emerald-700 disabled:opacity-50 active:scale-[0.99]"
          >
            Potwierdź odkładanie
          </button>

          <Link to={wmsProductionPaths.execute(activeId)} className="block text-center text-sm text-slate-500 underline">
            Wróć do produkcji
          </Link>
        </>
      ) : (
        <p className="text-center text-slate-500">Wczytywanie…</p>
      )}
    </div>
  );
}
