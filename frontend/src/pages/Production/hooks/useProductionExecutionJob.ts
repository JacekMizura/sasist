import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  listWmsExecutionQueue,
  startCollectingBatch,
  startCollectingOrder,
  updateCollectionTask,
  updateOrderCollectionTask,
  updateOrderProductionProgress,
  updateProductionProgress,
  type ProductionExecutionJobRead,
  type ProductionExecutionPhase,
} from "@/api/productionApi";
import { useWarehouse } from "@/context/WarehouseContext";
import {
  isCollectingQueueBlocked,
  jobRef,
  type ProductionExecutionRef,
  type UnifiedCollectionState,
  type UnifiedExecutionDetail,
} from "@/modules/production/productionExecutionTypes";
import { wmsProductionPaths } from "../productionPaths";
import { START_COLLECTING_BLOCKED_TOOLTIP, formatStartCollectingError } from "../productionUi";

const DEFAULT_TENANT = 1;

function normalizeBatchCollection(ref: ProductionExecutionRef, raw: Awaited<ReturnType<typeof fetchCollectionState>>): UnifiedCollectionState {
  return {
    ref,
    status: raw.status,
    header: raw.header,
    tasks: raw.tasks,
    collectedCount: raw.collected_count,
    totalCount: raw.total_count,
    progressPercent: raw.progress_percent,
  };
}

function normalizeOrderCollection(ref: ProductionExecutionRef, raw: Awaited<ReturnType<typeof fetchOrderCollectionState>>): UnifiedCollectionState {
  return {
    ref,
    status: raw.status,
    header: raw.header,
    tasks: raw.tasks,
    collectedCount: raw.collected_count,
    totalCount: raw.total_count,
    progressPercent: raw.progress_percent,
  };
}

async function loadExecutionDetail(
  tenantId: number,
  warehouseId: number,
  ref: ProductionExecutionRef,
): Promise<UnifiedExecutionDetail | null> {
  if (ref.kind === "batch") {
    const batch = await getProductionBatch(tenantId, ref.id, warehouseId);
    const productLabel =
      batch.lines?.map((l) => l.product_name).filter(Boolean).join(", ") ||
      `${batch.products_count ?? batch.lines.length} prod.`;
    return {
      ref,
      number: batch.number,
      productLabel,
      warehouseId: batch.warehouse_id,
      lines: batch.lines.map((ln) => ({
        lineKey: String(ln.id),
        lineId: ln.id,
        productName: ln.product_name ?? `Produkt #${ln.product_id}`,
        productImageUrl: ln.product_image_url ?? null,
        productSku: ln.product_sku ?? null,
        plannedQuantity: ln.planned_quantity,
        completedQuantity: ln.completed_quantity,
      })),
    };
  }
  const order = await getProductionOrder(tenantId, ref.id, warehouseId);
  return {
    ref,
    number: order.number,
    productLabel: order.product_name ?? `Produkt #${order.product_id}`,
    warehouseId: order.warehouse_id,
    lines: [
      {
        lineKey: "main",
        productName: order.product_name ?? `Produkt #${order.product_id}`,
        productImageUrl: order.product_image_url ?? null,
        productSku: order.product_sku ?? null,
        plannedQuantity: order.planned_quantity,
        completedQuantity: order.produced_quantity,
      },
    ],
  };
}

function firstPwDocumentId(
  ref: ProductionExecutionRef,
  batch: Awaited<ReturnType<typeof getProductionBatch>> | null,
  order: Awaited<ReturnType<typeof getProductionOrder>> | null,
): number | null {
  if (ref.kind === "batch" && batch) {
    const id = batch.lines.map((l) => l.pw_stock_document_id).find((x) => x != null && x > 0);
    return id ?? null;
  }
  if (ref.kind === "order" && order?.pw_stock_document_id) {
    return order.pw_stock_document_id;
  }
  return null;
}

export function useProductionExecutionJob(phase: ProductionExecutionPhase, activeRef: ProductionExecutionRef | null) {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;

  const [queue, setQueue] = useState<ProductionExecutionJobRead[]>([]);
  const [collectionState, setCollectionState] = useState<UnifiedCollectionState | null>(null);
  const [executionDetail, setExecutionDetail] = useState<UnifiedExecutionDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const reloadQueue = useCallback(async () => {
    if (warehouseId == null) {
      setQueue([]);
      return;
    }
    try {
      setQueue(await listWmsExecutionQueue(tenantId, phase, warehouseId));
    } catch {
      setQueue([]);
    }
  }, [tenantId, warehouseId, phase]);

  const loadCollectionDetail = useCallback(
    async (ref: ProductionExecutionRef) => {
      if (warehouseId == null) {
        setCollectionState(null);
        return;
      }
      setDetailLoading(true);
      try {
        if (ref.kind === "batch") {
          const raw = await fetchCollectionState(tenantId, ref.id, warehouseId);
          setCollectionState(normalizeBatchCollection(ref, raw));
        } else {
          const raw = await fetchOrderCollectionState(tenantId, ref.id, warehouseId);
          setCollectionState(normalizeOrderCollection(ref, raw));
        }
      } catch {
        setCollectionState(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [tenantId, warehouseId],
  );

  const loadExecuteDetail = useCallback(
    async (ref: ProductionExecutionRef) => {
      if (warehouseId == null) {
        setExecutionDetail(null);
        return;
      }
      setDetailLoading(true);
      try {
        setExecutionDetail(await loadExecutionDetail(tenantId, warehouseId, ref));
      } catch {
        setExecutionDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [tenantId, warehouseId],
  );

  useEffect(() => {
    void reloadQueue();
  }, [reloadQueue]);

  useEffect(() => {
    if (activeRef == null) {
      setCollectionState(null);
      setExecutionDetail(null);
      return;
    }
    if (phase === "collecting") void loadCollectionDetail(activeRef);
    if (phase === "execute") void loadExecuteDetail(activeRef);
  }, [activeRef, phase, loadCollectionDetail, loadExecuteDetail]);

  const pathForPhase = (p: ProductionExecutionPhase, ref: ProductionExecutionRef) => {
    if (p === "collecting") return wmsProductionPaths.collecting(ref.kind, ref.id);
    return wmsProductionPaths.execute(ref.kind, ref.id);
  };

  const openJob = useCallback(
    async (job: ProductionExecutionJobRead) => {
      if (warehouseId == null) return;
      const ref = jobRef(job);
      if (phase === "collecting") {
        if (isCollectingQueueBlocked(job)) {
          toast.error(START_COLLECTING_BLOCKED_TOOLTIP);
          return;
        }
        if (job.status === "planned") {
          try {
            if (ref.kind === "batch") await startCollectingBatch(tenantId, ref.id, warehouseId);
            else await startCollectingOrder(tenantId, ref.id, warehouseId);
          } catch (e: unknown) {
            toast.error(formatStartCollectingError(e));
            return;
          }
        }
        navigate(pathForPhase("collecting", ref));
        await loadCollectionDetail(ref);
        return;
      }
      navigate(pathForPhase(phase, ref));
    },
    [warehouseId, phase, tenantId, navigate, loadCollectionDetail],
  );

  const confirmCollectionTask = useCallback(
    async (taskKey: string, collectedQty: number, locationId?: number) => {
      if (activeRef == null || warehouseId == null) return;
      setBusy(true);
      try {
        const body = {
          task_key: taskKey,
          collected_qty: collectedQty,
          ...(locationId != null && locationId > 0 ? { location_id: locationId } : {}),
        };
        if (activeRef.kind === "batch") {
          const next = await updateCollectionTask(tenantId, activeRef.id, body, warehouseId);
          setCollectionState(normalizeBatchCollection(activeRef, next));
        } else {
          const next = await updateOrderCollectionTask(tenantId, activeRef.id, body, warehouseId);
          setCollectionState(normalizeOrderCollection(activeRef, next));
        }
      } finally {
        setBusy(false);
      }
    },
    [activeRef, warehouseId, tenantId],
  );

  const finishCollecting = useCallback(async () => {
    if (activeRef == null || warehouseId == null) return;
    setBusy(true);
    try {
      if (activeRef.kind === "batch") await finishCollectingBatch(tenantId, activeRef.id, warehouseId);
      else await finishCollectingOrder(tenantId, activeRef.id, warehouseId);
      navigate(wmsProductionPaths.execute(activeRef.kind, activeRef.id));
    } finally {
      setBusy(false);
    }
  }, [activeRef, warehouseId, tenantId, navigate]);

  const addProductionQty = useCallback(
    async (lineKey: string, add: number) => {
      if (activeRef == null || warehouseId == null) return;
      setBusy(true);
      try {
        if (activeRef.kind === "batch") {
          const lineId = Number(lineKey);
          await updateProductionProgress(tenantId, activeRef.id, { line_id: lineId, add_quantity: add }, warehouseId);
        } else {
          await updateOrderProductionProgress(tenantId, activeRef.id, { add_quantity: add }, warehouseId);
        }
        setExecutionDetail(await loadExecutionDetail(tenantId, warehouseId, activeRef));
      } finally {
        setBusy(false);
      }
    },
    [activeRef, warehouseId, tenantId],
  );

  const finishProduction = useCallback(async () => {
    if (activeRef == null || warehouseId == null) return;
    setBusy(true);
    try {
      let pwId: number | null = null;
      if (activeRef.kind === "batch") {
        const batch = await finishProductionPhase(tenantId, activeRef.id, warehouseId);
        pwId = firstPwDocumentId(activeRef, batch, null);
      } else {
        const order = await finishOrderProduction(tenantId, activeRef.id, warehouseId);
        pwId = firstPwDocumentId(activeRef, null, order);
      }
      toast.success(
        pwId
          ? `Produkcja zakończona. Dokument PW #${pwId} jest w module Rozlokowanie.`
          : "Produkcja zakończona. Wyroby trafiły do kolejki Rozlokowanie.",
        { duration: 6000 },
      );
      if (pwId) {
        navigate(`/wms/putaway/${pwId}`);
      } else {
        navigate("/wms/putaway");
      }
      await reloadQueue();
    } finally {
      setBusy(false);
    }
  }, [activeRef, warehouseId, tenantId, navigate, reloadQueue]);

  return {
    tenantId,
    warehouseId,
    queue,
    reloadQueue,
    collectionState,
    executionDetail,
    busy,
    detailLoading,
    openJob,
    confirmCollectionTask,
    finishCollecting,
    addProductionQty,
    finishProduction,
  };
}
