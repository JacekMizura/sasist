import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";

import {
  fetchCollectionState,
  fetchOrderCollectionState,
  finishCollectingBatch,
  finishCollectingOrder,
  finishOrderProduction,
  finishProductionPhase,
  getProductionBatch,
  getProductionOrder,
  updateCollectionTask,
  updateOrderCollectionTask,
  updateOrderProductionProgress,
  updateProductionProgress,
  type BatchCollectionStateRead,
  type OrderCollectionStateRead,
} from "@/api/productionApi";
import { useWarehouse } from "@/context/WarehouseContext";
import { ProgressBar } from "./components/ProgressBar";
import { PaperCollectTaskCard } from "./components/PaperCollectTaskCard";
import { ProductThumb } from "./components/ProductThumb";
import { erpProductionPaths, wmsProductionPaths } from "./productionPaths";
import { formatStartCollectingError } from "./productionUi";
import {
  ProductionDocumentsSection,
  pwDocumentsFromBatchLines,
  pwDocumentsFromOrder,
} from "./components/ProductionDocumentsSection";
import type { ProductionBatchRead, ProductionOrderRead } from "@/api/productionApi";

const DEFAULT_TENANT = 1;

function isTaskDone(required: number, collected: number): boolean {
  return collected >= required - 1e-6;
}

export default function PaperProductionPage() {
  const { kind, id } = useParams<{ kind: string; id: string }>();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;
  const jobKind = kind === "order" ? "order" : "batch";
  const jobId = Number(id);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [number, setNumber] = useState("");
  const [collection, setCollection] = useState<BatchCollectionStateRead | OrderCollectionStateRead | null>(null);
  const [executionLines, setExecutionLines] = useState<
    Array<{
      lineKey: string;
      lineId?: number;
      productName: string;
      productImageUrl?: string | null;
      plannedQuantity: number;
      completedQuantity: number;
    }>
  >([]);
  const [expandedTaskKey, setExpandedTaskKey] = useState<string | null>(null);
  const [documentsSource, setDocumentsSource] = useState<
    | { kind: "batch"; batch: ProductionBatchRead }
    | { kind: "order"; order: ProductionOrderRead }
    | null
  >(null);

  const backHref =
    jobKind === "order" ? erpProductionPaths.order(jobId) : erpProductionPaths.batch(jobId);

  const load = useCallback(async () => {
    if (!Number.isFinite(jobId) || jobId < 1 || warehouseId == null) return;
    if (jobKind === "batch") {
      const batch = await getProductionBatch(tenantId, jobId, warehouseId);
      setStatus(batch.status);
      setNumber(batch.number);
      if (batch.status === "collecting") {
        setCollection(await fetchCollectionState(tenantId, jobId, warehouseId));
        setExecutionLines([]);
        setDocumentsSource(null);
      } else if (batch.status === "in_progress") {
        setCollection(null);
        setDocumentsSource(null);
        setExecutionLines(
          batch.lines.map((ln) => ({
            lineKey: String(ln.id),
            lineId: ln.id,
            productName: ln.product_name ?? `Produkt #${ln.product_id}`,
            productImageUrl: ln.product_image_url,
            plannedQuantity: ln.planned_quantity,
            completedQuantity: ln.completed_quantity,
          })),
        );
      } else if (batch.status === "awaiting_putaway" || batch.status === "putaway") {
        setCollection(null);
        setExecutionLines([]);
        setDocumentsSource({ kind: "batch", batch });
      } else {
        setCollection(null);
        setExecutionLines([]);
        setDocumentsSource(null);
      }
      return;
    }
    const order = await getProductionOrder(tenantId, jobId, warehouseId);
    setStatus(order.status);
    setNumber(order.number);
    if (order.status === "collecting") {
      setCollection(await fetchOrderCollectionState(tenantId, jobId, warehouseId));
      setExecutionLines([]);
      setDocumentsSource(null);
    } else if (order.status === "in_progress") {
      setCollection(null);
      setDocumentsSource(null);
      setExecutionLines([
        {
          lineKey: "main",
          productName: order.product_name ?? `Produkt #${order.product_id}`,
          productImageUrl: order.product_image_url,
          plannedQuantity: order.planned_quantity,
          completedQuantity: order.produced_quantity,
        },
      ]);
    } else if (order.status === "awaiting_putaway" || order.status === "putaway") {
      setCollection(null);
      setExecutionLines([]);
      setDocumentsSource({ kind: "order", order });
    } else {
      setCollection(null);
      setExecutionLines([]);
      setDocumentsSource(null);
    }
  }, [jobId, jobKind, tenantId, warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const tasks = collection?.tasks ?? [];
  const firstIncompleteKey = useMemo(
    () => tasks.find((t) => !isTaskDone(t.required_qty, t.collected_qty))?.task_key ?? null,
    [tasks],
  );

  useEffect(() => {
    setExpandedTaskKey(firstIncompleteKey);
  }, [firstIncompleteKey, jobId]);

  const confirmTask = async (
    taskKey: string,
    payload: {
      locationId: number;
      collectedQty: number;
      batchNumber?: string | null;
      lot?: string | null;
      serialNumber?: string | null;
    },
  ) => {
    if (warehouseId == null) return;
    setBusy(true);
    try {
      const body = {
        task_key: taskKey,
        collected_qty: payload.collectedQty,
        location_id: payload.locationId,
        batch_number: payload.batchNumber,
        lot: payload.lot,
        serial_number: payload.serialNumber,
      };
      if (jobKind === "batch") {
        setCollection(await updateCollectionTask(tenantId, jobId, body, warehouseId));
      } else {
        setCollection(await updateOrderCollectionTask(tenantId, jobId, body, warehouseId));
      }
      toast.success("Pobranie zapisane.");
    } catch (e: unknown) {
      toast.error(formatStartCollectingError(e));
    } finally {
      setBusy(false);
    }
  };

  const finishCollecting = async () => {
    if (warehouseId == null) return;
    setBusy(true);
    try {
      if (jobKind === "batch") {
        await finishCollectingBatch(tenantId, jobId, warehouseId);
      } else {
        await finishCollectingOrder(tenantId, jobId, warehouseId);
      }
      toast.success("Materiały rozchodowane (RW).");
      await load();
    } catch (e: unknown) {
      toast.error(formatStartCollectingError(e));
    } finally {
      setBusy(false);
    }
  };

  const addProductionQty = async (lineKey: string, qty: number) => {
    if (warehouseId == null || qty <= 0) return;
    setBusy(true);
    try {
      if (jobKind === "batch") {
        await updateProductionProgress(tenantId, jobId, { line_id: Number(lineKey), add_quantity: qty }, warehouseId);
      } else {
        await updateOrderProductionProgress(tenantId, jobId, { add_quantity: qty }, warehouseId);
      }
      await load();
    } catch {
      toast.error("Nie udało się zaktualizować postępu.");
    } finally {
      setBusy(false);
    }
  };

  const finishProduction = async () => {
    if (warehouseId == null) return;
    setBusy(true);
    try {
      if (jobKind === "batch") {
        await finishProductionPhase(tenantId, jobId, warehouseId);
      } else {
        await finishOrderProduction(tenantId, jobId, warehouseId);
      }
      toast.success("Produkcja zakończona — dokumenty PW oczekują na rozlokowanie.");
      await load();
    } catch (e: unknown) {
      toast.error(formatStartCollectingError(e));
    } finally {
      setBusy(false);
    }
  };

  const allCollected = tasks.length > 0 && tasks.every((t) => isTaskDone(t.required_qty, t.collected_qty));
  const allProduced = executionLines.every((ln) => ln.completedQuantity >= ln.plannedQuantity - 1e-6);

  if (warehouseId == null) {
    return <p className="px-4 py-6 text-sm text-slate-500">Wybierz magazyn.</p>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 lg:px-6">
      <Link to={backHref} className="inline-flex items-center gap-2 text-sm text-violet-600 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Powrót do szczegółów
      </Link>

      <header className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Tryb papierowy · ERP</p>
        <h1 className="mt-1 font-mono text-2xl font-bold text-slate-900">{number || "…"}</h1>
        <p className="mt-1 text-sm text-slate-600">
          {status === "collecting"
            ? "Ręczne pobranie półproduktów — ten sam rozchód co w terminalu WMS."
            : status === "in_progress"
              ? "Rejestracja produkcji i zakończenie → PW → rozlokowanie."
              : status === "awaiting_putaway" || status === "putaway"
                ? "Produkcja zakończona — rozlokuj wszystkie dokumenty PW w WMS."
                : `Status: ${status}`}
        </p>
      </header>

      {status === "collecting" && collection ? (
        <>
          <ProgressBar
            value={collection.collected_count}
            max={collection.total_count || 1}
            label={`Zebrane składniki · ${collection.collected_count}/${collection.total_count}`}
            tone="amber"
          />
          <div className="space-y-3">
            {tasks.map((t) => (
              <PaperCollectTaskCard
                key={t.task_key}
                task={t}
                expanded={expandedTaskKey === t.task_key}
                done={isTaskDone(t.required_qty, t.collected_qty)}
                busy={busy}
                onToggle={() => setExpandedTaskKey((k) => (k === t.task_key ? null : t.task_key))}
                onConfirm={(payload) => void confirmTask(t.task_key, payload)}
              />
            ))}
          </div>
          {allCollected ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void finishCollecting()}
              className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              Zatwierdź pobrania i utwórz RW
            </button>
          ) : null}
        </>
      ) : null}

      {status === "in_progress" ? (
        <>
          <div className="space-y-4">
            {executionLines.map((ln) => {
              const remaining = Math.max(0, ln.plannedQuantity - ln.completedQuantity);
              return (
                <div key={ln.lineKey} className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center gap-4">
                    <ProductThumb imageUrl={ln.productImageUrl} name={ln.productName} size="md" />
                    <div>
                      <p className="font-semibold text-slate-900">{ln.productName}</p>
                      <p className="text-2xl font-black tabular-nums text-slate-900">
                        {ln.completedQuantity}
                        <span className="text-lg font-bold text-slate-400"> / {ln.plannedQuantity}</span>
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy || remaining <= 0}
                      onClick={() => void addProductionQty(ln.lineKey, 1)}
                      className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                    >
                      +1
                    </button>
                    <button
                      type="button"
                      disabled={busy || remaining <= 0}
                      onClick={() => void addProductionQty(ln.lineKey, remaining)}
                      className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-900 disabled:opacity-40"
                    >
                      Uzupełnij plan
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {allProduced ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void finishProduction()}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-40"
            >
              Zakończ produkcję → PW → rozlokowanie
            </button>
          ) : null}
        </>
      ) : null}

      {status === "awaiting_putaway" || status === "putaway" ? (
        <>
          {documentsSource?.kind === "batch" ? (
            <ProductionDocumentsSection
              rwDocumentId={documentsSource.batch.rw_stock_document_id}
              rwDocumentNumber={documentsSource.batch.rw_document_number}
              pwDocuments={pwDocumentsFromBatchLines(documentsSource.batch.lines ?? [])}
            />
          ) : documentsSource?.kind === "order" ? (
            <ProductionDocumentsSection
              rwDocumentId={documentsSource.order.rw_stock_document_id}
              rwDocumentNumber={documentsSource.order.rw_document_number}
              pwDocuments={pwDocumentsFromOrder(documentsSource.order)}
            />
          ) : null}
          <Link
            to={wmsProductionPaths.putaway(jobKind, jobId)}
            className="inline-flex rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700"
          >
            Otwórz kolejkę rozlokowania WMS
          </Link>
        </>
      ) : null}

      {status !== "collecting" && status !== "in_progress" && status !== "awaiting_putaway" && status !== "putaway" ? (
        <p className="text-sm text-slate-500">To zadanie nie jest w fazie realizacji papierowej.</p>
      ) : null}
    </div>
  );
}
