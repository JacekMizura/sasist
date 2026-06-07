import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Play, ScanLine, Package } from "lucide-react";
import { useWarehouse } from "../../context/WarehouseContext";
import {
  cancelProductionBatch,
  fetchBatchPickPlan,
  getProductionBatch,
  startCollectingBatch,
  type ProductionBatchPickPlanRead,
  type ProductionBatchRead,
} from "../../api/productionApi";
import { BATCH_STATUS_LABEL, batchStatusBadgeClass, stockTone, STOCK_TONE_CLASS } from "./productionUi";
import { ProductThumb } from "./components/ProductThumb";
import { ProgressBar } from "./components/ProgressBar";

const DEFAULT_TENANT = 1;

export default function BatchDetailPage() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const [batch, setBatch] = useState<ProductionBatchRead | null>(null);
  const [plan, setPlan] = useState<ProductionBatchPickPlanRead | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!batchId) return;
    const id = Number(batchId);
    const [b, p] = await Promise.all([
      getProductionBatch(tenantId, id),
      fetchBatchPickPlan(tenantId, id).catch(() => null),
    ]);
    setBatch(b);
    setPlan(p);
  }, [tenantId, batchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const startCollecting = async () => {
    if (!batchId) return;
    setBusy(true);
    try {
      await startCollectingBatch(tenantId, Number(batchId));
      navigate(`/production/collecting/${batchId}`);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!batchId || !confirm("Anulować partię?")) return;
    await cancelProductionBatch(tenantId, Number(batchId));
    navigate("/production/batches");
  };

  if (!batch) return <p className="px-4 py-6 text-sm text-slate-500">Wczytywanie…</p>;

  return (
    <div className="px-4 py-6 lg:px-6 space-y-8 max-w-6xl">
      <Link to="/production/batches" className="inline-flex items-center gap-2 text-sm text-violet-600 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Partie
      </Link>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-2xl font-bold text-slate-900">{batch.number}</p>
            <p className="text-sm text-slate-500">{batch.warehouse_name}</p>
            <span className={`mt-2 inline-block ${batchStatusBadgeClass(batch.status)}`}>
              {BATCH_STATUS_LABEL[batch.status]}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(batch.status === "draft" || batch.status === "planned") && (
              <button
                type="button"
                disabled={busy || plan?.has_shortages}
                onClick={() => void startCollecting()}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                <ScanLine className="h-4 w-4" aria-hidden />
                Rozpocznij zbieranie
              </button>
            )}
            {batch.status === "collecting" && (
              <Link
                to={`/production/collecting/${batch.id}`}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white"
              >
                <ScanLine className="h-4 w-4" aria-hidden />
                Zbieranie
              </Link>
            )}
            {batch.status === "in_progress" && (
              <Link
                to={`/production/execute/${batch.id}`}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white"
              >
                <Play className="h-4 w-4" aria-hidden />
                Produkcja
              </Link>
            )}
            {batch.status === "putaway" && (
              <Link
                to={`/production/putaway/${batch.id}`}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
              >
                <Package className="h-4 w-4" aria-hidden />
                Odłożenie
              </Link>
            )}
            {batch.status !== "completed" && batch.status !== "cancelled" && (
              <button type="button" onClick={() => void cancel()} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
                Anuluj
              </button>
            )}
          </div>
        </div>
        <div className="mt-6">
          <ProgressBar value={batch.progress_percent ?? 0} label="Postęp partii" />
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
                  {c.auto_allocation.length > 0 ? (
                    <p className="mt-2 text-xs text-slate-500">
                      Pobór: {c.auto_allocation.map((a) => `${a.location_code} (${a.quantity})`).join(", ")}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
          {plan.has_shortages ? (
            <p className="mt-3 text-sm text-amber-800">Uwaga: braki składników — uzupełnij magazyn przed zbieraniem.</p>
          ) : null}
        </section>
      ) : null}

      {batch.rw_document_number ? (
        <p className="text-sm text-slate-600">
          RW: <strong>{batch.rw_document_number}</strong> · Koszt składników rozliczony przy zbieraniu.
        </p>
      ) : null}
    </div>
  );
}
