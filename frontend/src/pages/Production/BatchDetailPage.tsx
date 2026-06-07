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
import { productionPaths } from "./productionPaths";

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
      navigate(productionPaths.collecting(batchId));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!batchId || !confirm("Anulować partię?")) return;
    await cancelProductionBatch(tenantId, Number(batchId));
    navigate(productionPaths.home);
  };

  if (!batch) return <p className="px-4 py-6 text-sm text-slate-500">Wczytywanie…</p>;

  return (
    <div className="px-4 py-6 lg:px-6 space-y-8 max-w-6xl">
      <Link to={productionPaths.home} className="inline-flex items-center gap-2 text-sm text-violet-600 hover:underline">
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
                to={productionPaths.collecting(batch.id)}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white"
              >
                <ScanLine className="h-4 w-4" aria-hidden />
                Zbieranie
              </Link>
            )}
            {batch.status === "in_progress" && (
              <Link
                to={productionPaths.execute(batch.id)}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white"
              >
                <Play className="h-4 w-4" aria-hidden />
                Produkcja
              </Link>
            )}
            {batch.status === "putaway" && (
              <Link
                to={productionPaths.putaway(batch.id)}
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

      <section>
        <h2 className="text-lg font-bold text-slate-900 mb-3">Przebieg</h2>
        <ol className="relative border-l-2 border-violet-200 pl-6 space-y-4">
          {[
            { key: "planned", label: "Batch utworzony", done: true, at: batch.created_at },
            {
              key: "collecting",
              label: "Zbieranie surowców",
              done: ["collecting", "in_progress", "putaway", "completed"].includes(batch.status),
              at: batch.started_at,
            },
            {
              key: "rw",
              label: "RW — zużycie materiałów",
              done: !!batch.rw_stock_document_id,
              detail: batch.rw_document_number,
            },
            {
              key: "production",
              label: "Produkcja",
              done: ["in_progress", "putaway", "completed"].includes(batch.status),
              at: batch.collecting_completed_at,
            },
            {
              key: "putaway",
              label: "Odłożenie (PW)",
              done: batch.status === "completed",
              at: batch.production_completed_at,
            },
            { key: "done", label: "Zakończono", done: batch.status === "completed", at: batch.completed_at },
          ].map((step) => (
            <li key={step.key} className="relative">
              <span
                className={`absolute -left-[1.65rem] top-1 h-3 w-3 rounded-full border-2 ${
                  step.done ? "border-emerald-500 bg-emerald-500" : "border-slate-300 bg-white"
                }`}
              />
              <p className={`text-sm font-medium ${step.done ? "text-slate-900" : "text-slate-400"}`}>{step.label}</p>
              {"detail" in step && step.detail ? <p className="text-xs text-slate-500">{step.detail}</p> : null}
              {"at" in step && step.at ? (
                <p className="text-xs text-slate-400">{String(step.at).slice(0, 16).replace("T", " ")}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      {batch.rw_document_number ? (
        <p className="text-sm text-slate-600">
          RW: <strong>{batch.rw_document_number}</strong>
        </p>
      ) : null}
    </div>
  );
}
