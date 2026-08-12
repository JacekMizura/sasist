import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
import {
  PrimaryButton,
  ProgressBar,
  StatusBadge,
  primaryButtonClassName,
  secondaryButtonClassName,
  toneTextClass,
} from "@/design-system";
import { PaperCollectTaskCard } from "./components/PaperCollectTaskCard";
import { PaperProduceLineCard } from "./components/PaperProduceLineCard";
import { erpProductionPaths, wmsProductionPaths } from "./productionPaths";
import { executionStatusLabel, executionStatusTone, formatStartCollectingError, productionProgressTone } from "./productionUi";
import { handleProductionPackingHandoff } from "./hooks/handleProductionPackingHandoff";
import {
  ProductionDocumentsSection,
  pwDocumentsFromBatchLines,
  pwDocumentsFromOrder,
  type ProductionPwDocumentRow,
} from "./components/ProductionDocumentsSection";
import type { ProductionBatchRead, ProductionOrderRead } from "@/api/productionApi";
import { WMS_ROUTES } from "../wms/wmsRoutes";

const DEFAULT_TENANT = 1;

function isTaskDone(required: number, collected: number): boolean {
  return collected >= required - 1e-6;
}

export default function PaperProductionPage() {
  const { kind, id } = useParams<{ kind: string; id: string }>();
  const navigate = useNavigate();
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
      toast.success("Materiały pobrane.");
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
        const updated = await updateOrderProductionProgress(tenantId, jobId, { add_quantity: qty }, warehouseId);
        handleProductionPackingHandoff(updated, navigate);
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
      toast.success("Produkcja zakończona. Dokumenty PW gotowe do rozlokowania.");
      await load();
    } catch (e: unknown) {
      toast.error(formatStartCollectingError(e));
    } finally {
      setBusy(false);
    }
  };

  const allCollected = tasks.length > 0 && tasks.every((t) => isTaskDone(t.required_qty, t.collected_qty));
  const allProduced = executionLines.every((ln) => ln.completedQuantity >= ln.plannedQuantity - 1e-6);

  const collectPct =
    collection != null
      ? Math.round(
          Number.isFinite(collection.progress_percent)
            ? collection.progress_percent
            : collection.total_count > 0
              ? (collection.collected_count / collection.total_count) * 100
              : 0,
        )
      : 0;
  const collectTone = productionProgressTone(collectPct, status);

  const productionPct = useMemo(() => {
    if (executionLines.length === 0) return 0;
    const planned = executionLines.reduce((s, ln) => s + ln.plannedQuantity, 0);
    const done = executionLines.reduce((s, ln) => s + ln.completedQuantity, 0);
    if (planned <= 0) return 0;
    return Math.round(Math.min(100, (done / planned) * 100));
  }, [executionLines]);
  const productionTone = productionProgressTone(productionPct, status);

  const pwDocuments: ProductionPwDocumentRow[] = useMemo(() => {
    if (documentsSource?.kind === "batch") {
      return pwDocumentsFromBatchLines(documentsSource.batch.lines ?? []);
    }
    if (documentsSource?.kind === "order") {
      return pwDocumentsFromOrder(documentsSource.order);
    }
    return [];
  }, [documentsSource]);

  const pendingPwDocuments = useMemo(
    () => pwDocuments.filter((pw) => String(pw.putawayStatus || "").toUpperCase() !== "DONE"),
    [pwDocuments],
  );

  const startPutawayHref =
    pendingPwDocuments.length === 1
      ? WMS_ROUTES.putawayPz(pendingPwDocuments[0].id)
      : wmsProductionPaths.putaway(jobKind, jobId);

  if (warehouseId == null) {
    return <p className="px-4 py-6 text-sm text-slate-500">Wybierz magazyn.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 lg:px-6">
      <Link to={backHref} className={`${secondaryButtonClassName()} inline-flex items-center gap-1.5`}>
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Powrót
      </Link>

      <header className="space-y-3 border-b border-slate-200 pb-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-bold text-slate-900">{number || "…"}</h1>
          {status ? (
            <StatusBadge tone={executionStatusTone(status)} density="comfortable">
              {executionStatusLabel(status)}
            </StatusBadge>
          ) : null}
        </div>

        {status === "collecting" && collection ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium text-slate-600">Postęp pobierania</span>
              <span className={`tabular-nums font-bold ${toneTextClass[collectTone]}`}>{collectPct}%</span>
            </div>
            <ProgressBar value={collectPct} tone={collectTone} size="lg" />
          </div>
        ) : status === "in_progress" ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium text-slate-600">Postęp produkcji</span>
              <span className={`tabular-nums font-bold ${toneTextClass[productionTone]}`}>{productionPct}%</span>
            </div>
            <ProgressBar value={productionPct} tone={productionTone} size="lg" />
          </div>
        ) : null}
      </header>

      {status === "collecting" && collection ? (
        <>
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
            <PrimaryButton
              type="button"
              density="comfortable"
              disabled={busy}
              onClick={() => void finishCollecting()}
              className="w-full py-3.5 text-base"
            >
              Zatwierdź pobrania
            </PrimaryButton>
          ) : null}
        </>
      ) : null}

      {status === "in_progress" ? (
        <div className="space-y-4">
          {executionLines.map((ln) => (
            <PaperProduceLineCard
              key={ln.lineKey}
              productName={ln.productName}
              productImageUrl={ln.productImageUrl}
              plannedQuantity={ln.plannedQuantity}
              completedQuantity={ln.completedQuantity}
              busy={busy}
              canFinishJob={allProduced}
              onProduce={(qty) => void addProductionQty(ln.lineKey, qty)}
              onFinish={() => void finishProduction()}
            />
          ))}
        </div>
      ) : null}

      {status === "awaiting_putaway" || status === "putaway" ? (
        <div className="space-y-4">
          {documentsSource?.kind === "batch" ? (
            <ProductionDocumentsSection
              rwDocumentId={documentsSource.batch.rw_stock_document_id}
              rwDocumentNumber={documentsSource.batch.rw_document_number}
              pwDocuments={pwDocuments}
            />
          ) : documentsSource?.kind === "order" ? (
            <ProductionDocumentsSection
              rwDocumentId={documentsSource.order.rw_stock_document_id}
              rwDocumentNumber={documentsSource.order.rw_document_number}
              pwDocuments={pwDocuments}
            />
          ) : (
            <ProductionDocumentsSection pwDocuments={pwDocuments} />
          )}

          {pendingPwDocuments.length > 0 ? (
            <Link
              to={startPutawayHref}
              className={primaryButtonClassName("flex w-full justify-center py-3.5 text-base")}
            >
              Rozpocznij rozlokowanie
            </Link>
          ) : (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-900">
              Rozlokowanie zakończone.
            </p>
          )}
        </div>
      ) : null}

      {status !== "collecting" && status !== "in_progress" && status !== "awaiting_putaway" && status !== "putaway" ? (
        <p className="text-sm text-slate-500">To zadanie nie jest w fazie realizacji.</p>
      ) : null}
    </div>
  );
}
