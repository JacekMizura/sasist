import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import { useWarehouse } from "../../context/WarehouseContext";
import {
  cancelProductionBatch,
  fetchBatchPickPlan,
  getProductionBatch,
  releaseBatchToWms,
  type ProductionBatchPickPlanRead,
  type ProductionBatchRead,
} from "../../api/productionApi";
import {
  batchMonitoringSource,
  ProductionMonitoringPanel,
} from "./components/ProductionMonitoringPanel";
import {
  batchHasMaterialShortages,
  START_COLLECTING_BLOCKED_TOOLTIP,
  batchStatusBadgeClass,
  BATCH_STATUS_LABEL,
  stockTone,
  STOCK_TONE_CLASS,
  formatStartCollectingError,
} from "./productionUi";
import { ProductThumb } from "./components/ProductThumb";
import { erpProductionPaths } from "./productionPaths";

const DEFAULT_TENANT = 1;

export default function BatchDetailPage() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;
  const [batch, setBatch] = useState<ProductionBatchRead | null>(null);
  const [plan, setPlan] = useState<ProductionBatchPickPlanRead | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!batchId || warehouseId == null) return;
    const id = Number(batchId);
    const [b, p] = await Promise.all([
      getProductionBatch(tenantId, id, warehouseId),
      fetchBatchPickPlan(tenantId, id, warehouseId).catch(() => null),
    ]);
    setBatch(b);
    setPlan(p);
  }, [tenantId, batchId, warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const releaseToWms = async () => {
    if (!batchId || warehouseId == null || !batch) return;
    if (batchHasMaterialShortages(batch, plan)) return;
    setBusy(true);
    try {
      setBatch(await releaseBatchToWms(tenantId, Number(batchId), warehouseId));
      toast.success("Partia wydana do terminalu WMS.");
    } catch (e: unknown) {
      toast.error(formatStartCollectingError(e));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!batchId || !confirm("Anulować partię?") || warehouseId == null) return;
    setBusy(true);
    try {
      await cancelProductionBatch(tenantId, Number(batchId), warehouseId);
      toast.success("Partia anulowana.");
      navigate(erpProductionPaths.home);
    } catch {
      toast.error("Anulowanie nie powiodło się.");
    } finally {
      setBusy(false);
    }
  };

  if (!batch) return <p className="px-4 py-6 text-sm text-slate-500">Wczytywanie…</p>;

  const collectingBlocked = batchHasMaterialShortages(batch, plan);

  return (
    <div className="px-4 py-6 lg:px-6 space-y-8 max-w-6xl">
      <Link to={erpProductionPaths.home} className="inline-flex items-center gap-2 text-sm text-violet-600 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Partie
      </Link>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <p className="font-mono text-2xl font-bold text-slate-900">{batch.number}</p>
            <p className="text-sm text-slate-500">{batch.warehouse_name}</p>
            <span className={`mt-2 inline-block ${batchStatusBadgeClass(batch.status)}`}>
              {BATCH_STATUS_LABEL[batch.status]}
            </span>
          </div>
        </div>

        {collectingBlocked ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Braki materiałów — uzupełnij stan magazynowy przed wydaniem do WMS.
          </p>
        ) : null}

        <div className="mt-6">
          <ProductionMonitoringPanel
            kind="batch"
            source={batchMonitoringSource(batch)}
            actions={{
              onReleaseToWms: () => void releaseToWms(),
              onCancel: () => void cancel(),
              releaseDisabled: collectingBlocked,
              releaseDisabledReason: START_COLLECTING_BLOCKED_TOOLTIP,
              busy,
            }}
          />
        </div>
      </div>

      <section>
        <h2 className="text-lg font-bold text-slate-900 mb-3">Produkty do wyprodukowania</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {batch.lines.map((ln) => (
            <div key={ln.id} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <ProductThumb name={ln.product_name ?? undefined} size="md" />
              <div>
                <p className="font-medium text-slate-900">{ln.product_name}</p>
                <p className="text-xs text-slate-500">{ln.composition_name}</p>
                <p className="mt-1 text-sm">
                  Plan: <strong>{ln.planned_quantity}</strong> · Wykonano: <strong>{ln.completed_quantity}</strong>
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {plan ? (
        <section>
          <h2 className="text-lg font-bold text-slate-900 mb-3">Zagregowane materiały</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {plan.aggregated_components.map((c) => {
              const tone = stockTone(c.required, c.available);
              return (
                <div key={c.component_product_id} className={`rounded-xl border p-4 ${STOCK_TONE_CLASS[tone]}`}>
                  <p className="font-medium text-slate-900">{c.product_name}</p>
                  <p className="mt-1 text-sm">
                    <strong>{c.required}</strong>
                    <span className="text-slate-400"> / </span>
                    <span>{c.available}</span> dostępne
                    {c.missing > 0 ? <span className="text-red-700"> · brakuje {c.missing}</span> : null}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
