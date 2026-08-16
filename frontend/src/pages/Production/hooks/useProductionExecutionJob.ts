import { useCallback, useEffect, useRef, useState } from "react";
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
  type FinishedGoodsIdentityBody,
  type ProductionOrderRead,
} from "@/api/productionApi";
import { useWmsMessage } from "@/components/wms/WmsMessageProvider";
import { useWarehouse } from "@/context/WarehouseContext";
import {
  isCollectingQueueBlocked,
  jobRef,
  type ProductionExecutionRef,
  type UnifiedCollectionState,
  type UnifiedExecutionDetail,
} from "@/modules/production/productionExecutionTypes";
import { wmsProductionPaths } from "../productionPaths";
import { WMS_ROUTES } from "../../wms/wmsRoutes";
import { START_COLLECTING_BLOCKED_TOOLTIP, formatStartCollectingError } from "../productionUi";
import {
  handleProductionPackingHandoff,
  selectPackingHandoffCarrier,
} from "./handleProductionPackingHandoff";
import {
  formatProductionMutationError,
  ordersMoSkipsPutaway,
  withMutationLock,
} from "./productionExecutionGuards";
import { extractWmsUserMessage } from "@/types/wmsUserMessage";

const DEFAULT_TENANT = 1;

export type PutawayLineDetail = {
  lineKey: string;
  productName: string;
  quantity: number;
  pwDocumentId?: number | null;
  pwDocumentNumber?: string | null;
  putawayStatus?: string | null;
};

export type PutawayDetail = {
  ref: ProductionExecutionRef;
  number: string;
  productLabel: string;
  warehouseId: number;
  lines: PutawayLineDetail[];
};

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
      sourceType: null,
      supportsPartialFgStock: true,
      lines: batch.lines.map((ln) => ({
        lineKey: String(ln.id),
        lineId: ln.id,
        productName: ln.product_name ?? `Produkt #${ln.product_id}`,
        productImageUrl: ln.product_image_url ?? null,
        productSku: ln.product_sku ?? null,
        productEan: ln.product_ean ?? null,
        productCatalogNumber: ln.product_catalog_number ?? null,
        productBarcode: ln.product_barcode ?? null,
        productUnit: ln.product_unit ?? null,
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
    sourceType: order.source_type ?? null,
    supportsPartialFgStock: true,
    lines: [
      {
        lineKey: "main",
        productName: order.product_name ?? `Produkt #${order.product_id}`,
        productImageUrl: order.product_image_url ?? null,
        productSku: order.product_sku ?? null,
        productEan: order.product_ean ?? null,
        productCatalogNumber: order.product_catalog_number ?? null,
        productBarcode: order.product_barcode ?? null,
        productUnit: order.product_unit ?? null,
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
): Promise<PutawayDetail | null> {
  if (ref.kind === "batch") {
    const batch = await getProductionBatch(tenantId, ref.id, warehouseId);
    const productLabel =
      batch.lines?.map((l) => l.product_name).filter(Boolean).join(", ") ||
      `${batch.products_count ?? batch.lines.length} prod.`;
    const lines: PutawayLineDetail[] = batch.lines
      .filter((ln) => ln.pw_stock_document_id != null && ln.pw_stock_document_id > 0)
      .map((ln) => ({
        lineKey: String(ln.id),
        productName: ln.product_name ?? `Produkt #${ln.product_id}`,
        quantity: ln.completed_quantity || ln.planned_quantity,
        pwDocumentId: ln.pw_stock_document_id,
        pwDocumentNumber: ln.pw_document_number,
        putawayStatus: ln.pw_putaway_status,
      }));
    return {
      ref,
      number: batch.number,
      productLabel,
      warehouseId: batch.warehouse_id,
      lines,
    };
  }
  const order = await getProductionOrder(tenantId, ref.id, warehouseId);
  const lines: PutawayLineDetail[] = order.pw_stock_document_id
    ? [
        {
          lineKey: "main",
          productName: order.product_name ?? `Produkt #${order.product_id}`,
          quantity: order.produced_quantity || order.planned_quantity,
          pwDocumentId: order.pw_stock_document_id,
          pwDocumentNumber: order.pw_document_number,
          putawayStatus: order.pw_putaway_status,
        },
      ]
    : [];
  return {
    ref,
    number: order.number,
    productLabel: order.product_name ?? `Produkt #${order.product_id}`,
    warehouseId: order.warehouse_id,
    lines,
  };
}

function collectPwDocumentIds(detail: PutawayDetail | null): number[] {
  if (!detail) return [];
  return detail.lines
    .map((ln) => ln.pwDocumentId)
    .filter((id): id is number => id != null && id > 0);
}

export function useProductionExecutionJob(phase: ProductionExecutionPhase, activeRef: ProductionExecutionRef | null) {
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const { showWmsMessage } = useWmsMessage();
  const tenantId = warehouse?.tenant_id ?? DEFAULT_TENANT;
  const warehouseId = warehouse?.id;

  const [queue, setQueue] = useState<ProductionExecutionJobRead[]>([]);
  const [collectionState, setCollectionState] = useState<UnifiedCollectionState | null>(null);
  const [executionDetail, setExecutionDetail] = useState<UnifiedExecutionDetail | null>(null);
  const [putawayDetail, setPutawayDetail] = useState<PutawayDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  /** Synchronous anti-double-submit (state `busy` alone races on rapid click/scan). */
  const mutationLockRef = useRef(false);

  const showBusinessError = useCallback(
    (e: unknown, title: string, fallback: string) => {
      const structured = extractWmsUserMessage(e);
      if (structured) {
        showWmsMessage(structured);
        return;
      }
      showWmsMessage({
        code: "PRODUCTION_BUSINESS_ERROR",
        severity: "ERROR",
        title,
        message: formatProductionMutationError(e, fallback),
        suggested_action: "Spróbuj ponownie. Jeśli problem się powtórzy, zgłoś to przełożonemu.",
      });
    },
    [showWmsMessage],
  );

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

  const loadPutawayDetailForRef = useCallback(
    async (ref: ProductionExecutionRef) => {
      if (warehouseId == null) {
        setPutawayDetail(null);
        return;
      }
      setDetailLoading(true);
      try {
        setPutawayDetail(await loadPutawayDetail(tenantId, warehouseId, ref));
      } catch {
        setPutawayDetail(null);
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
    if (phase === "putaway") void loadPutawayDetailForRef(activeRef);
  }, [activeRef, phase, loadCollectionDetail, loadExecuteDetail, loadPutawayDetailForRef]);

  const pathForPhase = (p: ProductionExecutionPhase, ref: ProductionExecutionRef) => {
    if (p === "collecting") return wmsProductionPaths.collecting(ref.kind, ref.id);
    if (p === "putaway") return WMS_ROUTES.putaway;
    return wmsProductionPaths.execute(ref.kind, ref.id);
  };

  const openJob = useCallback(
    async (job: ProductionExecutionJobRead) => {
      if (warehouseId == null) return;
      const ref = jobRef(job);
      if (phase === "collecting") {
        if (isCollectingQueueBlocked(job)) {
          showWmsMessage({
            code: "COLLECTING_BLOCKED",
            severity: "ERROR",
            title: "Nie można rozpocząć zbierania",
            message: START_COLLECTING_BLOCKED_TOOLTIP,
          });
          return;
        }
        if (job.status === "planned") {
          try {
            if (ref.kind === "batch") await startCollectingBatch(tenantId, ref.id, warehouseId);
            else await startCollectingOrder(tenantId, ref.id, warehouseId);
          } catch (e: unknown) {
            showBusinessError(e, "Nie można rozpocząć zbierania", formatStartCollectingError(e));
            return;
          }
        }
        navigate(pathForPhase("collecting", ref));
        await loadCollectionDetail(ref);
        return;
      }
      navigate(pathForPhase(phase, ref));
      if (phase === "putaway") await loadPutawayDetailForRef(ref);
    },
    [warehouseId, phase, tenantId, navigate, loadCollectionDetail, loadPutawayDetailForRef, showBusinessError, showWmsMessage],
  );

  const confirmCollectionTask = useCallback(
    async (
      taskKey: string,
      collectedQty: number,
      locationId?: number,
      identity?: {
        batchNumber?: string | null;
        lot?: string | null;
        serialNumber?: string | null;
        expiryDate?: string | null;
      },
    ) => {
      if (activeRef == null || warehouseId == null) return;
      try {
        await withMutationLock(mutationLockRef, setBusy, async () => {
          const body = {
            task_key: taskKey,
            collected_qty: collectedQty,
            action: "confirm_pick" as const,
            ...(locationId != null && locationId > 0 ? { location_id: locationId } : {}),
            batch_number: identity?.batchNumber ?? null,
            lot: identity?.lot ?? null,
            serial_number: identity?.serialNumber ?? null,
            expiry_date: identity?.expiryDate ?? null,
          };
          if (activeRef.kind === "batch") {
            const next = await updateCollectionTask(tenantId, activeRef.id, body, warehouseId);
            setCollectionState(normalizeBatchCollection(activeRef, next));
          } else {
            const next = await updateOrderCollectionTask(tenantId, activeRef.id, body, warehouseId);
            setCollectionState(normalizeOrderCollection(activeRef, next));
          }
        });
      } catch (e: unknown) {
        showBusinessError(e, "Nie udało się zapisać pobrania", "Nie udało się zapisać pobrania komponentu.");
      }
    },
    [activeRef, warehouseId, tenantId, showBusinessError],
  );

  const reportCollectionShortage = useCallback(
    async (taskKey: string) => {
      if (activeRef == null || warehouseId == null) return;
      try {
        await withMutationLock(mutationLockRef, setBusy, async () => {
          const body = {
            task_key: taskKey,
            collected_qty: 0,
            action: "report_shortage" as const,
          };
          if (activeRef.kind === "batch") {
            const next = await updateCollectionTask(tenantId, activeRef.id, body, warehouseId);
            setCollectionState(normalizeBatchCollection(activeRef, next));
          } else {
            const next = await updateOrderCollectionTask(tenantId, activeRef.id, body, warehouseId);
            setCollectionState(normalizeOrderCollection(activeRef, next));
          }
        });
      } catch (e: unknown) {
        showBusinessError(e, "Nie udało się zgłosić braku", "Nie udało się zgłosić braku komponentu.");
      }
    },
    [activeRef, warehouseId, tenantId, showBusinessError],
  );

  const finishCollecting = useCallback(async () => {
    if (activeRef == null || warehouseId == null) return;
    try {
      await withMutationLock(mutationLockRef, setBusy, async () => {
        if (activeRef.kind === "batch") await finishCollectingBatch(tenantId, activeRef.id, warehouseId);
        else await finishCollectingOrder(tenantId, activeRef.id, warehouseId);
        navigate(wmsProductionPaths.execute(activeRef.kind, activeRef.id));
      });
    } catch (e: unknown) {
      showBusinessError(e, "Nie można zakończyć pobierania", "Nie można zakończyć pobierania komponentów.");
    }
  }, [activeRef, warehouseId, tenantId, navigate, showBusinessError]);

  const addProductionQty = useCallback(
    async (lineKey: string, add: number, identity: FinishedGoodsIdentityBody = {}) => {
      if (activeRef == null || warehouseId == null) return;
      try {
        await withMutationLock(mutationLockRef, setBusy, async () => {
          if (activeRef.kind === "batch") {
            const lineId = Number(lineKey);
            await updateProductionProgress(
              tenantId,
              activeRef.id,
              { line_id: lineId, add_quantity: add, ...identity },
              warehouseId,
            );
          } else {
            const updated = await updateOrderProductionProgress(
              tenantId,
              activeRef.id,
              { add_quantity: add, ...identity },
              warehouseId,
            );
            await handleProductionPackingHandoff(updated, navigate, { tenantId, warehouseId });
          }
          setExecutionDetail(await loadExecutionDetail(tenantId, warehouseId, activeRef));
        });
      } catch (e: unknown) {
        showBusinessError(e, "Nie udało się zapisać produkcji", "Nie udało się zapisać wyprodukowanej ilości.");
      }
    },
    [activeRef, warehouseId, tenantId, navigate, showBusinessError],
  );

  /**
   * Operator „Zarejestruj produkcję”.
   * Każda delta materializuje FG (ORDERS → bufor; BAT/PLANNING/MANUAL → PW → putaway).
   * Przy pełnym planie backend auto-finish; FE dopina finish idempotentnie i nawiguje.
   */
  const registerProductionQty = useCallback(
    async (lineKey: string, qty: number, identity: FinishedGoodsIdentityBody = {}) => {
      if (activeRef == null || warehouseId == null) return;
      const add = Math.max(0, Number(qty) || 0);
      if (add <= 0) return;

      const detail = executionDetail ?? (await loadExecutionDetail(tenantId, warehouseId, activeRef));
      if (!detail) return;
      const line = detail.lines.find((ln) => ln.lineKey === lineKey);
      if (!line) return;
      const remaining = Math.max(0, line.plannedQuantity - line.completedQuantity);
      if (add > remaining + 1e-9) {
        toast.error(`Można zarejestrować co najwyżej ${remaining} szt.`);
        return;
      }

      try {
        await withMutationLock(mutationLockRef, setBusy, async () => {
          let progressOrder: ProductionOrderRead | null = null;
          if (activeRef.kind === "batch") {
            const lineId = Number(lineKey);
            await updateProductionProgress(
              tenantId,
              activeRef.id,
              { line_id: lineId, add_quantity: add, ...identity },
              warehouseId,
            );
          } else {
            progressOrder = await updateOrderProductionProgress(
              tenantId,
              activeRef.id,
              { add_quantity: add, ...identity },
              warehouseId,
            );
          }

          const next = await loadExecutionDetail(tenantId, warehouseId, activeRef);
          setExecutionDetail(next);
          const nextLine = next?.lines.find((ln) => ln.lineKey === lineKey);
          const complete =
            nextLine != null && nextLine.completedQuantity >= nextLine.plannedQuantity - 1e-6;
          const allComplete = next?.lines.every(
            (ln) => ln.completedQuantity >= ln.plannedQuantity - 1e-6,
          );

          if (complete && allComplete) {
            // Auto finish — lifecycle requires explicit finish after counters reach plan.
            if (activeRef.kind === "batch") {
              await finishProductionPhase(tenantId, activeRef.id, warehouseId, identity);
            } else {
              const finished = await finishOrderProduction(
                tenantId,
                activeRef.id,
                warehouseId,
                identity,
              );
              // One owner: progress carries auto_pack / newly_ready; finish does not.
              const handoffCarrier = selectPackingHandoffCarrier(progressOrder, finished);
              const handoffResult = handoffCarrier
                ? await handleProductionPackingHandoff(handoffCarrier, navigate, {
                    tenantId,
                    warehouseId,
                  })
                : { acted: false, kind: "none" as const, navigatedToPacking: false };
              if (ordersMoSkipsPutaway(finished.source_type)) {
                if (handoffResult.kind !== "auto_pack") {
                  toast.success(
                    "Produkcja zakończona. Produkty są dostępne na lokalizacji buforowej.",
                    { duration: 6000 },
                  );
                }
                if (!handoffResult.navigatedToPacking) {
                  navigate(wmsProductionPaths.execute());
                }
                await reloadQueue();
                return;
              }
            }
            const putaway = await loadPutawayDetail(tenantId, warehouseId, activeRef);
            const pwIds = collectPwDocumentIds(putaway);
            toast.success(
              pwIds.length === 1
                ? `Produkcja zakończona. Wyroby czekają na rozlokowanie (dokument PW).`
                : "Produkcja zakończona. Wyroby czekają na rozlokowanie.",
              { duration: 6000 },
            );
            navigate(pwIds.length === 1 ? WMS_ROUTES.putawayPz(pwIds[0]) : WMS_ROUTES.putaway);
            await reloadQueue();
            return;
          }

          if (progressOrder) {
            await handleProductionPackingHandoff(progressOrder, navigate, { tenantId, warehouseId });
          }
          toast.success(
            `Zarejestrowano ${add} szt. (${nextLine ? `${nextLine.completedQuantity}/${nextLine.plannedQuantity}` : ""})`,
          );
          await reloadQueue();
        });
      } catch (e: unknown) {
        showBusinessError(e, "Nie udało się zapisać produkcji", "Nie udało się zapisać wyprodukowanej ilości.");
      }
    },
    [
      activeRef,
      warehouseId,
      tenantId,
      navigate,
      showBusinessError,
      executionDetail,
      reloadQueue,
    ],
  );

  const finishProduction = useCallback(async () => {
    if (activeRef == null || warehouseId == null) return;
    try {
      await withMutationLock(mutationLockRef, setBusy, async () => {
        if (activeRef.kind === "batch") {
          await finishProductionPhase(tenantId, activeRef.id, warehouseId);
        } else {
          const finished = await finishOrderProduction(tenantId, activeRef.id, warehouseId);
          const handoffResult = await handleProductionPackingHandoff(finished, navigate, {
            tenantId,
            warehouseId,
          });
          if (ordersMoSkipsPutaway(finished.source_type)) {
            if (handoffResult.kind !== "auto_pack") {
              toast.success(
                "Produkcja zakończona. Produkty są dostępne na lokalizacji buforowej.",
                { duration: 6000 },
              );
            }
            if (!handoffResult.navigatedToPacking) {
              navigate(wmsProductionPaths.execute());
            }
            await reloadQueue();
            return;
          }
        }
        const detail = await loadPutawayDetail(tenantId, warehouseId, activeRef);
        const pwIds = collectPwDocumentIds(detail);
        toast.success(
          pwIds.length > 1
            ? `Produkcja zakończona. ${pwIds.length} dokumenty PW oczekują na rozlokowanie.`
            : pwIds.length === 1
              ? "Produkcja zakończona. Wyroby czekają na rozlokowanie."
              : "Produkcja zakończona. Wyroby trafiły do kolejki rozlokowania.",
          { duration: 6000 },
        );
        navigate(pwIds.length === 1 ? WMS_ROUTES.putawayPz(pwIds[0]) : WMS_ROUTES.putaway);
        await reloadQueue();
      });
    } catch (e: unknown) {
      showBusinessError(e, "Nie można zakończyć produkcji", "Nie można zakończyć produkcji.");
    }
  }, [activeRef, warehouseId, tenantId, navigate, reloadQueue, showBusinessError]);

  const refreshPutawayDetail = useCallback(async () => {
    if (activeRef == null) return;
    await loadPutawayDetailForRef(activeRef);
    await reloadQueue();
  }, [activeRef, loadPutawayDetailForRef, reloadQueue]);

  return {
    tenantId,
    warehouseId,
    queue,
    reloadQueue,
    collectionState,
    executionDetail,
    putawayDetail,
    busy,
    detailLoading,
    openJob,
    confirmCollectionTask,
    reportCollectionShortage,
    finishCollecting,
    addProductionQty,
    registerProductionQty,
    finishProduction,
    refreshPutawayDetail,
  };
}
