import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MapPin } from "lucide-react";
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
    <div className="px-4 py-6 lg:px-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Odłożenie wyrobów</h1>
        <p className="text-sm text-slate-500">Wybierz lokację docelową — system wygeneruje PW i przyjmie stan.</p>
      </div>

      {!activeId ? (
        <div className="space-y-3">
          {queue.length === 0 ? (
            <p className="text-sm text-slate-500">Brak partii do odłożenia.</p>
          ) : (
            queue.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  setActiveId(b.id);
                  navigate(wmsProductionPaths.putaway(b.id));
                }}
                className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-emerald-300"
              >
                <span className="font-mono font-bold">{b.number}</span>
                <span className={`ml-2 ${batchStatusBadgeClass(b.status)}`}>{BATCH_STATUS_LABEL[b.status]}</span>
              </button>
            ))
          )}
        </div>
      ) : batch ? (
        <>
          <p className="font-mono font-bold text-emerald-900">{batch.number}</p>
          <div className="space-y-4">
            {batch.lines.map((ln) => (
              <div key={ln.id} className="rounded-2xl border-2 border-emerald-200 bg-white p-5">
                <div className="flex gap-4">
                  <ProductThumb name={ln.product_name ?? undefined} size="lg" />
                  <div>
                    <p className="text-lg font-bold text-slate-900">{ln.product_name}</p>
                    <p className="text-2xl font-bold text-emerald-700">{ln.completed_quantity || ln.planned_quantity} szt.</p>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="mb-2 inline-flex items-center gap-1 text-xs font-semibold uppercase text-slate-500">
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    Lokacja docelowa
                  </p>
                  <ProductionWarehouseLocationSearch
                    tenantId={tenantId}
                    warehouseId={batch.warehouse_id}
                    valueId={targets[ln.id]?.id ?? null}
                    valueCode={targets[ln.id]?.code ?? null}
                    recentLocationIds={recentIds}
                    onSelect={(id, code) => setTargets((prev) => ({ ...prev, [ln.id]: { id, code } }))}
                  />
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirmPutaway()}
            className="sticky bottom-4 w-full rounded-2xl bg-emerald-600 py-4 text-base font-bold text-white shadow-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            Potwierdź odkładanie (PW)
          </button>
          <Link to={wmsProductionPaths.execute(activeId)} className="block text-center text-sm text-slate-500 hover:underline">
            Szczegóły partii
          </Link>
        </>
      ) : (
        <p className="text-sm text-slate-500">Wczytywanie…</p>
      )}
    </div>
  );
}
