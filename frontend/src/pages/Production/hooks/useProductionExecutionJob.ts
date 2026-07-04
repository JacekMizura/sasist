import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

import {
  fetchCollectionState,
  fetchOrderCollectionState,
  finishCollectingBatch,
  finishCollectingOrder,
  finishOrderProduction,
  finishOrderPutaway,
  finishProductionPhase,
  finishPutawayBatch,
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
  type UnifiedPutawayDetail,
} from "@/modules/production/productionExecutionTypes";
import { wmsProductionPaths } from "../productionPaths";
import { rememberTargetLocation, START_COLLECTING_BLOCKED_TOOLTIP, formatStartCollectingError } from "../productionUi";

const DEFAULT_TENANT = 1;

function normalizeBatchCollection(ref: ProductionExecutionRef, raw: Awaited<ReturnType<typeof fetchCollectionState>>): UnifiedCollectionState {
  return {
    ref,
    status: raw.status,
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
        plannedQuantity: order.planned_quantity,
        completedQuantity: order.produced_quantity,
      },
    ],
  };
}

async function loadPutawayDetail(
  tenantId: number,
  warehouseId: number,
  ref: ProductionExecutionRef,
): Promise<UnifiedPutawayDetail | null> {
  if (ref.kind === "batch") {
    const batch = await getProductionBatch(tenantId, ref.id, warehouseId);
    return {
      ref,
      number: batch.number,
      warehouseId: batch.warehouse_id,
      lines: batch.lines.map((ln) => ({
        lineKey: String(ln.id),
        lineId: ln.id,
        productName: ln.product_name ?? `Produkt #${ln.product_id}`,
        quantity: ln.completed_quantity || ln.planned_quantity,
        targetLocationId: ln.target_location_id ?? null,
        targetLocationName: ln.target_location_name ?? null,
      })),
    };
  }
  const order = await getProductionOrder(tenantId, ref.id, warehouseId);
  return {
    ref,
    number: order.number,
    warehouseId: order.warehouse_id,
    lines: [
      {
        lineKey: "main",
        productName: order.product_name ?? `Produkt #${order.product_id}`,
        quantity: order.produced_quantity || order.planned_quantity,
        targetLocationId: order.location_id ?? null,
        targetLocationName: order.location_name ?? null,
      },
    ],
  };
}

export function useProductionExecutionJob(phase: ProductionExecutionPhase, activeRef: ProductionExecutionRef | null) {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;

  const [queue, setQueue] = useState<ProductionExecutionJobRead[]>([]);
  const [collectionState, setCollectionState] = useState<UnifiedCollectionState | null>(null);
  const [executionDetail, setExecutionDetail] = useState<UnifiedExecutionDetail | null>(null);
  const [putawayDetail, setPutawayDetail] = useState<UnifiedPutawayDetail | null>(null);
  const [putawayTargets, setPutawayTargets] = useState<Record<string, { id: number | null; code: string | null }>>({});
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

  const loadPutawayDetailState = useCallback(
    async (ref: ProductionExecutionRef) => {
      if (warehouseId == null) {
        setPutawayDetail(null);
        setPutawayTargets({});
        return;
      }
      setDetailLoading(true);
      try {
        const detail = await loadPutawayDetail(tenantId, warehouseId, ref);
        setPutawayDetail(detail);
        const targets: Record<string, { id: number | null; code: string | null }> = {};
        detail?.lines.forEach((ln) => {
          targets[ln.lineKey] = { id: ln.targetLocationId ?? null, code: ln.targetLocationName ?? null };
        });
        setPutawayTargets(targets);
      } catch {
        setPutawayDetail(null);
        setPutawayTargets({});
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
      setPutawayDetail(null);
      return;
    }
    if (phase === "collecting") void loadCollectionDetail(activeRef);
    if (phase === "execute") void loadExecuteDetail(activeRef);
    if (phase === "putaway") void loadPutawayDetailState(activeRef);
  }, [activeRef, phase, loadCollectionDetail, loadExecuteDetail, loadPutawayDetailState]);

  const pathForPhase = (p: ProductionExecutionPhase, ref: ProductionExecutionRef) => {
    if (p === "collecting") return wmsProductionPaths.collecting(ref.kind, ref.id);
    if (p === "execute") return wmsProductionPaths.execute(ref.kind, ref.id);
    return wmsProductionPaths.putaway(ref.kind, ref.id);
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
    async (taskKey: string, collectedQty: number) => {
      if (activeRef == null || warehouseId == null) return;
      setBusy(true);
      try {
        if (activeRef.kind === "batch") {
          const next = await updateCollectionTask(
            tenantId,
            activeRef.id,
            { task_key: taskKey, collected_qty: collectedQty },
            warehouseId,
          );
          setCollectionState(normalizeBatchCollection(activeRef, next));
        } else {
          const next = await updateOrderCollectionTask(
            tenantId,
            activeRef.id,
            { task_key: taskKey, collected_qty: collectedQty },
            warehouseId,
          );
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
          const updated = await updateProductionProgress(
            tenantId,
            activeRef.id,
            { line_id: lineId, add_quantity: add },
            warehouseId,
          );
          setExecutionDetail(await loadExecutionDetail(tenantId, warehouseId, activeRef));
          void updated;
        } else {
          await updateOrderProductionProgress(tenantId, activeRef.id, { add_quantity: add }, warehouseId);
          setExecutionDetail(await loadExecutionDetail(tenantId, warehouseId, activeRef));
        }
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
      if (activeRef.kind === "batch") await finishProductionPhase(tenantId, activeRef.id, warehouseId);
      else await finishOrderProduction(tenantId, activeRef.id, warehouseId);
      navigate(wmsProductionPaths.putaway(activeRef.kind, activeRef.id));
    } finally {
      setBusy(false);
    }
  }, [activeRef, warehouseId, tenantId, navigate]);

  const setPutawayTarget = useCallback((lineKey: string, id: number | null, code: string | null) => {
    setPutawayTargets((prev) => ({ ...prev, [lineKey]: { id, code } }));
  }, []);

  const finishPutaway = useCallback(async () => {
    if (activeRef == null || !putawayDetail || warehouseId == null) return;
    const missing = putawayDetail.lines.some((ln) => !putawayTargets[ln.lineKey]?.id);
    if (missing) {
      toast.error("Wybierz lokalizację docelową dla każdego produktu.");
      return;
    }
    setBusy(true);
    try {
      if (activeRef.kind === "batch") {
        const lines = putawayDetail.lines.map((ln) => ({
          line_id: ln.lineId!,
          target_location_id: putawayTargets[ln.lineKey]!.id!,
        }));
        await finishPutawayBatch(tenantId, activeRef.id, { lines }, warehouseId);
        lines.forEach((l) => rememberTargetLocation(warehouseId, l.target_location_id));
      } else {
        const targetId = putawayTargets.main?.id ?? putawayTargets["main"]?.id;
        if (!targetId) {
          toast.error("Wybierz lokalizację docelową.");
          return;
        }
        await finishOrderPutaway(tenantId, activeRef.id, { target_location_id: targetId }, warehouseId);
        rememberTargetLocation(warehouseId, targetId);
      }
      navigate(wmsProductionPaths.collecting());
      await reloadQueue();
    } finally {
      setBusy(false);
    }
  }, [activeRef, putawayDetail, putawayTargets, warehouseId, tenantId, navigate, reloadQueue]);

  return {
    tenantId,
    warehouseId,
    queue,
    reloadQueue,
    collectionState,
    executionDetail,
    putawayDetail,
    putawayTargets,
    busy,
    detailLoading,
    openJob,
    confirmCollectionTask,
    finishCollecting,
    addProductionQty,
    finishProduction,
    setPutawayTarget,
    finishPutaway,
  };
}
