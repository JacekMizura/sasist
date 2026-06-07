import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useWarehouse } from "../../context/WarehouseContext";
import {
  createProductionBatch,
  fetchProductionDashboard,
  startCollectingBatch,
  type ProductionDashboardRead,
} from "../../api/productionApi";
import { CreateBatchModal } from "./components/CreateBatchModal";
import { ProductionHero } from "./components/ProductionHero";
import { ProductionQueueSection } from "./components/ProductionQueueSection";
import { QUEUE_SECTIONS } from "./productionTheme";
import { erpProductionPaths, wmsProductionPaths } from "./productionPaths";

const DEFAULT_TENANT = 1;

export default function ProductionDashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;
  const [data, setData] = useState<ProductionDashboardRead | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchProductionDashboard(tenantId, warehouseId));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, warehouseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const create = searchParams.get("create");
    const productId = searchParams.get("product");
    const compositionId = searchParams.get("composition");
    if (create !== "1" || !productId || !compositionId || warehouseId == null) return;
    void (async () => {
      try {
        const batch = await createProductionBatch(tenantId, {
          warehouse_id: warehouseId,
          status: "planned",
          lines: [
            {
              product_id: Number(productId),
              composition_id: Number(compositionId),
              planned_quantity: 1,
            },
          ],
        });
        setSearchParams({});
        navigate(erpProductionPaths.batch(batch.id));
      } catch {
        setModalOpen(true);
        setSearchParams({});
      }
    })();
  }, [searchParams, warehouseId, tenantId, navigate, setSearchParams]);

  const handleStartCollecting = async (id: number) => {
    await startCollectingBatch(tenantId, id);
    navigate(wmsProductionPaths.collecting(id));
  };

  const handleContinue = (id: number, status: string) => {
    if (status === "collecting") navigate(wmsProductionPaths.collecting(id));
    else if (status === "in_progress") navigate(wmsProductionPaths.execute(id));
    else if (status === "putaway") navigate(wmsProductionPaths.putaway(id));
    else navigate(erpProductionPaths.batch(id));
  };

  const handleCreated = (batchId: number) => {
    void reload();
    navigate(erpProductionPaths.batch(batchId));
  };

  if (warehouseId == null) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-8">
        <div className="max-w-md rounded-3xl border border-amber-200 bg-gradient-to-b from-amber-50 to-white p-8 text-center shadow-lg">
          <p className="text-lg font-bold text-amber-950">Wybierz magazyn WMS</p>
          <p className="mt-2 text-sm text-amber-800">
            Centrum produkcji wymaga aktywnego magazynu — wybierz go w menu WMS, aby planować partie i monitorować
            kolejki.
          </p>
        </div>
      </div>
    );
  }

  const sectionBatches = (id: (typeof QUEUE_SECTIONS)[number]["id"]) => {
    if (!data) return [];
    switch (id) {
      case "planned":
        return data.planned ?? [];
      case "ready":
        return data.ready_to_produce ?? [];
      case "in_progress":
        return data.in_progress ?? data.active ?? [];
      case "waiting":
        return data.waiting_materials ?? [];
      case "completed":
        return data.recently_completed ?? [];
      default:
        return [];
    }
  };

  const isEmpty =
    !loading &&
    data &&
    (data.planned_batches ?? 0) === 0 &&
    (data.active_batches ?? 0) === 0 &&
    (data.recently_completed?.length ?? 0) === 0;

  return (
    <div className="space-y-6 p-4 pb-16 lg:p-6">
      <ProductionHero
        data={data}
        warehouseName={warehouse?.name}
        loading={loading}
        onCreateBatch={() => setModalOpen(true)}
      />

      {loading ? (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white py-16 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-violet-600" aria-hidden />
          Ładowanie kolejek produkcyjnych…
        </div>
      ) : (
        <div className="space-y-6">
          {QUEUE_SECTIONS.map((config) => {
            const batches = sectionBatches(config.id);
            const primaryQueue = config.id === "planned" || config.id === "ready" || config.id === "in_progress";
            if (isEmpty && config.id !== "planned") return null;
            if (!isEmpty && batches.length === 0 && !primaryQueue) return null;
            return (
              <ProductionQueueSection
                key={config.id}
                config={config}
                batches={batches}
                showActions={config.id !== "waiting" && config.id !== "completed"}
                onCreateBatch={config.id === "planned" ? () => setModalOpen(true) : undefined}
                onStartCollecting={handleStartCollecting}
                onContinue={handleContinue}
              />
            );
          })}
        </div>
      )}

      <CreateBatchModal
        open={modalOpen}
        tenantId={tenantId}
        warehouseId={warehouseId}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
