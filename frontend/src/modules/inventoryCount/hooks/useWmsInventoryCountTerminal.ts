import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  confirmWmsInventoryLocation,
  fetchWmsExecutionSummary,
  fetchWmsInventoryTask,
  fetchWmsTaskLines,
  openWmsInventorySession,
  recordInventoryScan,
  resolveWmsInventoryBarcode,
  resolveWmsInventoryCarrier,
  WmsBarcodeResolveError,
  type InventoryTaskRead,
  type WmsBarcodeResolveResult,
  type WmsTaskLineRead,
} from "@/api/inventoryCountApi";
import { getWmsProductView } from "@/api/wmsProductViewApi";
import { useScanFeedback } from "@/components/wms/execution/useScanFeedback";
import { normalizeScanEan } from "@/utils/wmsScanNormalize";
import { wmsInventoryCountPaths } from "../inventoryCountPaths";
import { setActiveInventoryDocumentId } from "../wmsActiveDocumentStorage";
import {
  commitLocationSessionToRecent,
  syncLocationSessionProduct,
  touchRecentLocation,
} from "../recentLocationsStorage";
import { cacheTaskSnapshot, inventoryCountSyncQueue } from "../offline/inventoryCountSyncQueue";
import { useInventoryCountOfflineStatus } from "../offline/useInventoryCountOfflineStatus";
import {
  clampInventoryQtyState,
  commitInventoryQtyDraft,
  EMPTY_INVENTORY_QTY,
  inventoryQtyFromPieces,
  inventoryQtyFromTotalPieces,
  inventoryTotalPieces,
  type InventoryQtyEditState,
} from "../ui/wms/inventoryQtyUtils";
import {
  buildLocationContextFromTask,
  isCarrierBarcode,
  locationCodesMatch,
  type WmsCarrierContext,
  type WmsCountedProduct,
  type WmsInventoryPackaging,
  type WmsLocationContext,
  type WmsQtyInputMode,
  type WmsUnexpectedProduct,
} from "../wmsInventoryExecutionContext";

export type { WmsCountedProduct } from "../wmsInventoryExecutionContext";
export type WmsLastScanKind = "unit" | "carton" | null;

export type WmsTerminalStep = "location" | "product";

const SCAN_LOCK_MS = 250;
const PULSE_MS = 280;

function buildLocationSubline(task: InventoryTaskRead | null): string | null {
  if (!task) return null;
  const code = task.location_code ?? task.location_name ?? "";
  const segs = code.split(/[-/]/).filter(Boolean);
  if (segs.length >= 3) return `POZIOM ${segs[segs.length - 1]}`;
  if (task.aisle_code) return `REGAŁ ${task.aisle_code}`;
  if (task.zone_code) return `STREFA ${task.zone_code}`;
  return null;
}

function lineToCountedProduct(line: WmsTaskLineRead, task: InventoryTaskRead): WmsCountedProduct | null {
  const qty = line.my_counted_quantity ?? line.counted_quantity;
  if (qty == null || line.product_id == null) return null;
  const carrierId = line.carrier_id ?? null;
  const carrierCode = line.carrier_code ?? null;
  const scan: WmsBarcodeResolveResult = {
    line_id: line.id,
    product_id: line.product_id,
    product_name: line.product_name,
    sku: line.sku,
    ean: line.ean,
    barcode: line.ean ?? line.sku ?? "",
    image_url: line.image_url,
    expected_quantity: 0,
    counted_quantity: qty,
    discrepancy_class: "EXPECTED",
    discrepancy_label: "",
    location_id: task.location_id,
    location_code: task.location_code,
    carrier_id: carrierId,
  };
  return {
    line_id: line.id,
    product_id: line.product_id,
    product_name: line.product_name,
    sku: line.sku,
    ean: line.ean,
    image_url: line.image_url,
    carrier_id: carrierId,
    carrier_code: carrierCode,
    counted_quantity: qty,
    updatedAt: 0,
    scan,
  };
}

function unexpectedFromSummary(items: Array<{ unknown_id?: number; temporary_name?: string; barcode_value?: string | null; quantity?: number }>): WmsUnexpectedProduct[] {
  return items
    .filter((u) => u.unknown_id != null)
    .map((u) => ({
      unknown_id: Number(u.unknown_id),
      temporary_name: String(u.temporary_name ?? "Nieznany produkt"),
      barcode_value: u.barcode_value ?? null,
      quantity: Number(u.quantity ?? 0),
      updatedAt: Date.now(),
    }));
}

async function loadPackagingForProduct(
  tenantId: number,
  warehouseId: number,
  productId: number,
): Promise<WmsInventoryPackaging> {
  try {
    const view = await getWmsProductView(tenantId, warehouseId, productId);
    return {
      unitsPerCarton: Math.max(1, Math.floor(Number(view.package.units_per_carton) || 1)),
      cartonEan: view.package.carton_ean?.trim() || null,
      loaded: true,
    };
  } catch {
    return { unitsPerCarton: 1, cartonEan: null, loaded: true };
  }
}

function scanIsCartonCode(code: string, packaging: WmsInventoryPackaging): boolean {
  const normalized = normalizeScanEan(code.trim()).toUpperCase();
  if (!normalized || !packaging.cartonEan) return false;
  return normalized === normalizeScanEan(packaging.cartonEan).toUpperCase();
}

function resetCountingUi(setters: {
  setLocationContext: (v: WmsLocationContext | null) => void;
  setCarrierContext: (v: WmsCarrierContext) => void;
  setCarrierScanMode: (v: boolean) => void;
  setActiveLineId: (v: number | null) => void;
  setActiveScan: (v: WmsBarcodeResolveResult | null) => void;
  setCountedProducts: (v: Record<number, WmsCountedProduct>) => void;
  setUnexpectedItems: (v: WmsUnexpectedProduct[]) => void;
  setPulseLineId: (v: number | null) => void;
  setQtyEditState: (v: InventoryQtyEditState) => void;
  setPackaging: (v: WmsInventoryPackaging) => void;
  setLastScanKind: (v: WmsLastScanKind) => void;
  setOperatorRecent: (v: WmsCountedProduct[]) => void;
  setCountConflict: (v: boolean) => void;
}) {
  setters.setLocationContext(null);
  setters.setCarrierContext(null);
  setters.setCarrierScanMode(false);
  setters.setActiveLineId(null);
  setters.setActiveScan(null);
  setters.setCountedProducts({});
  setters.setUnexpectedItems([]);
  setters.setPulseLineId(null);
  setters.setQtyEditState(EMPTY_INVENTORY_QTY);
  setters.setPackaging({ unitsPerCarton: 1, cartonEan: null, loaded: false });
  setters.setLastScanKind(null);
  setters.setOperatorRecent([]);
  setters.setCountConflict(false);
}

/**
 * WMS inventory terminal — route `taskId` binds location; carrier/product are execution context.
 */
export function useWmsInventoryCountTerminal(
  taskId: number | undefined,
  tenantId: number,
  warehouseId: number | undefined,
  expectedDocumentId?: number,
) {
  const navigate = useNavigate();
  const location = useLocation();
  const scanFeedback = useScanFeedback();
  const { refresh: refreshOffline } = useInventoryCountOfflineStatus();
  const navState = (location.state as { sessionId?: number; locationConfirmed?: boolean } | null) ?? null;
  const navSessionId = navState?.sessionId ?? null;
  const navLocationConfirmed = Boolean(navState?.locationConfirmed);

  const scanInFlight = useRef(false);
  const lastScanSubmit = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const hydratedTaskIdRef = useRef<number | null>(null);
  const pulseTimerRef = useRef<number | null>(null);
  const qtyEditStateRef = useRef<InventoryQtyEditState>(EMPTY_INVENTORY_QTY);
  const activeLineIdRef = useRef<number | null>(null);
  const activeScanRef = useRef<WmsBarcodeResolveResult | null>(null);
  const lastSyncedPackRef = useRef<number | null>(null);

  const [loading, setLoading] = useState(Boolean(taskId));
  const [error, setError] = useState<string | null>(null);
  const [task, setTask] = useState<InventoryTaskRead | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(navSessionId);
  const [locationContext, setLocationContext] = useState<WmsLocationContext | null>(null);
  const [carrierContext, setCarrierContext] = useState<WmsCarrierContext>(null);
  const [carrierScanMode, setCarrierScanMode] = useState(false);
  const [activeLineId, setActiveLineId] = useState<number | null>(null);
  const [activeScan, setActiveScan] = useState<WmsBarcodeResolveResult | null>(null);
  const [countedProducts, setCountedProducts] = useState<Record<number, WmsCountedProduct>>({});
  const [unexpectedItems, setUnexpectedItems] = useState<WmsUnexpectedProduct[]>([]);
  const [packaging, setPackaging] = useState<WmsInventoryPackaging>({
    unitsPerCarton: 1,
    cartonEan: null,
    loaded: false,
  });
  const [qtyEditState, setQtyEditState] = useState<InventoryQtyEditState>(EMPTY_INVENTORY_QTY);
  const [lastScanKind, setLastScanKind] = useState<WmsLastScanKind>(null);
  const [pulseLineId, setPulseLineId] = useState<number | null>(null);
  const [invalidPulse, setInvalidPulse] = useState(false);
  const [unknownOpen, setUnknownOpen] = useState(false);
  const [lastScanCode, setLastScanCode] = useState<string | null>(null);
  const [operatorRecent, setOperatorRecent] = useState<WmsCountedProduct[]>([]);
  const [countConflict, setCountConflict] = useState(false);

  const uiResetters = useMemo(
    () => ({
      setLocationContext,
      setCarrierContext,
      setCarrierScanMode,
      setActiveLineId,
      setActiveScan,
      setCountedProducts,
      setUnexpectedItems,
      setPulseLineId,
      setQtyEditState,
      setPackaging,
      setLastScanKind,
      setOperatorRecent,
      setCountConflict,
    }),
    [],
  );

  const locationActive = Boolean(locationContext?.confirmed);
  const step: WmsTerminalStep = locationActive ? "product" : "location";
  const activeCarrierId = activeScan?.carrier_id ?? carrierContext?.carrierId ?? null;

  const activateLocationContext = useCallback(
    (t: InventoryTaskRead, opts?: { fromScan?: boolean }) => {
      const ctx = buildLocationContextFromTask(t, true);
      setLocationContext(ctx);
      touchRecentLocation({ code: ctx.locationCode, taskId: t.id, locationId: t.location_id });
      if (opts?.fromScan) scanFeedback.success(undefined);
    },
    [scanFeedback],
  );

  const goToTask = useCallback(
    (nextTaskId: number, nextSessionId?: number | null, nextDocumentId?: number) => {
      if (!Number.isFinite(nextTaskId)) return;
      if (Number(taskId) === nextTaskId) return;
      const docId = nextDocumentId ?? task?.inventory_document_id;
      if (!docId) return;
      navigate(wmsInventoryCountPaths.count(docId, nextTaskId), {
        state: { sessionId: nextSessionId, locationConfirmed: true },
      });
    },
    [navigate, task, taskId],
  );

  useEffect(() => {
    if (!warehouseId || !taskId || !Number.isFinite(taskId)) {
      setLoading(false);
      setTask(null);
      setError(taskId ? "Nieprawidłowe zadanie." : null);
      hydratedTaskIdRef.current = null;
      return;
    }

    if (hydratedTaskIdRef.current === taskId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    resetCountingUi(uiResetters);
    hydratedTaskIdRef.current = null;

    void (async () => {
      try {
        const t = await fetchWmsInventoryTask(tenantId, taskId);
        if (cancelled) return;

        if (expectedDocumentId != null && t.inventory_document_id !== expectedDocumentId) {
          setError("Zadanie nie należy do wybranego dokumentu inwentaryzacji.");
          setLoading(false);
          return;
        }

        if (warehouseId) {
          setActiveInventoryDocumentId(warehouseId, t.inventory_document_id);
        }

        let sid = navSessionId ?? sessionId;
        if (!sid) {
          const session = await openWmsInventorySession(tenantId, warehouseId, {
            document_id: t.inventory_document_id,
            task_id: t.id,
          });
          sid = session.id;
        }
        if (cancelled) return;

        const lines = await fetchWmsTaskLines(tenantId, t.id, { scope: "mine" });
        if (cancelled) return;

        let unexpected: WmsUnexpectedProduct[] = [];
        try {
          const summary = await fetchWmsExecutionSummary(tenantId, t.id);
          unexpected = unexpectedFromSummary(summary.unexpected ?? []);
        } catch {
          unexpected = [];
        }

        const hydrated: Record<number, WmsCountedProduct> = {};
        for (const line of lines) {
          const item = lineToCountedProduct(line, t);
          if (item) hydrated[item.line_id] = item;
        }

        for (const line of lines) {
          const myQty = line.my_counted_quantity ?? line.counted_quantity;
          if (line.product_id != null && myQty != null) {
            syncLocationSessionProduct({
              taskId: t.id,
              locationId: t.location_id,
              locationCode: t.location_code ?? t.location_name ?? `#${t.location_id}`,
              productId: line.product_id,
              productName: line.product_name,
              sku: line.sku ?? undefined,
              ean: line.ean ?? undefined,
              imageUrl: line.image_url ?? undefined,
              countedQuantity: myQty,
            });
          }
        }

        setTask(t);
        setSessionId(sid);
        setCountedProducts(hydrated);
        setOperatorRecent(
          Object.values(hydrated)
            .map((row, idx) => ({ ...row, updatedAt: Date.now() - idx }))
            .slice(0, 2),
        );
        setUnexpectedItems(unexpected);
        hydratedTaskIdRef.current = taskId;

        activateLocationContext(t);

        if (navLocationConfirmed) {
          void confirmWmsInventoryLocation(tenantId, t.id, {
            location_id: t.location_id,
            scanned_code: t.location_code ?? t.location_name ?? String(t.location_id),
          }).catch(() => undefined);
        }

        cacheTaskSnapshot({
          taskId: t.id,
          locationCode: t.location_code ?? t.location_name ?? `#${t.location_id}`,
          progressPercent: t.progress_percent,
          cachedAt: new Date().toISOString(),
        });
      } catch {
        if (!cancelled) {
          setError("Nie udało się wczytać zadania.");
          setTask(null);
          hydratedTaskIdRef.current = null;
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate on route taskId / warehouse
  }, [taskId, warehouseId, tenantId, expectedDocumentId]);

  useEffect(() => {
    if (navSessionId != null) setSessionId(navSessionId);
  }, [navSessionId]);

  useEffect(() => {
    return () => {
      if (pulseTimerRef.current != null) window.clearTimeout(pulseTimerRef.current);
    };
  }, []);

  const locationLabel = locationContext?.locationCode ?? task?.location_code ?? task?.location_name ?? "—";
  const locationSubline = useMemo(() => buildLocationSubline(task), [task]);
  const inventoryType = (task?.inventory_type ?? "FULL").toUpperCase();
  const isPartialInventory = inventoryType === "PARTIAL";

  const qtyPulse = pulseLineId != null && pulseLineId === activeLineId;
  const activeCountedProduct = activeLineId != null ? (countedProducts[activeLineId] ?? null) : null;

  const operatorRecentList = useMemo(() => operatorRecent, [operatorRecent]);

  const reloadFromServer = useCallback(async () => {
    if (!task) return;
    try {
      const [lines, summary] = await Promise.all([
        fetchWmsTaskLines(tenantId, task.id, { scope: "mine" }),
        fetchWmsExecutionSummary(tenantId, task.id),
      ]);
      const hydrated: Record<number, WmsCountedProduct> = {};
      for (const line of lines) {
        const item = lineToCountedProduct(line, task);
        if (item) hydrated[item.line_id] = item;
      }
      setCountedProducts((prev) => {
        const merged = { ...hydrated };
        for (const [id, row] of Object.entries(prev)) {
          const lineId = Number(id);
          if (merged[lineId]?.defectReported) {
            merged[lineId] = { ...merged[lineId], defectReported: row.defectReported, defectNote: row.defectNote };
          }
        }
        return merged;
      });
      setOperatorRecent(
        Object.values(hydrated)
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 2),
      );
      setUnexpectedItems(unexpectedFromSummary(summary.unexpected ?? []));
    } catch {
      scanFeedback.error("Nie udało się odświeżyć listy");
    }
  }, [scanFeedback, task, tenantId]);

  useEffect(() => {
    qtyEditStateRef.current = qtyEditState;
  }, [qtyEditState]);

  useEffect(() => {
    activeLineIdRef.current = activeLineId;
  }, [activeLineId]);

  useEffect(() => {
    activeScanRef.current = activeScan;
  }, [activeScan]);

  useEffect(() => {
    if (!activeScan?.product_id || !warehouseId) {
      setPackaging({ unitsPerCarton: 1, cartonEan: null, loaded: false });
      lastSyncedPackRef.current = null;
      return;
    }
    let cancelled = false;
    lastSyncedPackRef.current = null;
    void loadPackagingForProduct(tenantId, warehouseId, activeScan.product_id).then((pack) => {
      if (!cancelled) setPackaging(pack);
    });
    return () => {
      cancelled = true;
    };
  }, [activeScan?.product_id, tenantId, warehouseId]);

  /** Re-decompose when pack size is known — prevents treating piece total as carton count. */
  useEffect(() => {
    if (!packaging.loaded) return;
    const pack = packaging.unitsPerCarton;
    if (lastSyncedPackRef.current === pack) return;
    lastSyncedPackRef.current = pack;
    const total = activeScan?.counted_quantity;
    if (total == null || activeLineId == null) return;
    const next = inventoryQtyFromTotalPieces(total, pack);
    if (next) setQtyEditState(next);
  }, [packaging.loaded, packaging.unitsPerCarton, activeScan?.counted_quantity, activeLineId]);

  const pulseLine = useCallback((lineId: number) => {
    setPulseLineId(lineId);
    if (pulseTimerRef.current != null) window.clearTimeout(pulseTimerRef.current);
    pulseTimerRef.current = window.setTimeout(() => setPulseLineId(null), PULSE_MS);
  }, []);

  const pulseBad = useCallback(() => {
    setInvalidPulse(true);
    window.setTimeout(() => setInvalidPulse(false), 400);
  }, []);

  const upsertCountedProduct = useCallback(
    (scan: WmsBarcodeResolveResult, qty: number, carrier?: WmsCarrierContext) => {
      const carrierId = scan.carrier_id ?? carrier?.carrierId ?? activeCarrierId;
      const snapshot: WmsBarcodeResolveResult = { ...scan, counted_quantity: qty, carrier_id: carrierId };
      setCountedProducts((prev) => {
        const existing = prev[scan.line_id];
        const carrierCode =
          carrier?.code ??
          (carrierId != null && carrierContext?.carrierId === carrierId ? carrierContext.code : null) ??
          existing?.carrier_code ??
          null;
        const row: WmsCountedProduct = {
          line_id: scan.line_id,
          product_id: scan.product_id,
          product_name: scan.product_name,
          sku: scan.sku,
          ean: scan.ean,
          image_url: scan.image_url,
          carrier_id: carrierId,
          carrier_code: carrierCode,
          counted_quantity: qty,
          updatedAt: Date.now(),
          scan: snapshot,
          defectReported: existing?.defectReported,
          defectNote: existing?.defectNote,
        };
        setOperatorRecent((recent) => [row, ...recent.filter((p) => p.line_id !== scan.line_id)].slice(0, 2));
        return { ...prev, [scan.line_id]: row };
      });
      if (task) {
        syncLocationSessionProduct({
          taskId: task.id,
          locationId: task.location_id,
          locationCode: task.location_code ?? task.location_name ?? `#${task.location_id}`,
          productId: scan.product_id,
          productName: scan.product_name,
          sku: scan.sku ?? undefined,
          ean: scan.ean ?? undefined,
          imageUrl: scan.image_url ?? undefined,
          countedQuantity: qty,
        });
      }
      pulseLine(scan.line_id);
    },
    [activeCarrierId, carrierContext, pulseLine, task],
  );

  const applyScanQty = useCallback(
    (
      scan: WmsBarcodeResolveResult,
      nextQty: number,
      pack: number,
      qtyState?: InventoryQtyEditState,
    ) => {
      const safeQty = Math.max(0, Math.round(nextQty));
      setActiveScan({ ...scan, counted_quantity: safeQty });
      setActiveLineId(scan.line_id);
      upsertCountedProduct(scan, safeQty);
      if (qtyState) {
        setQtyEditState(clampInventoryQtyState(qtyState));
      } else {
        setQtyEditState(inventoryQtyFromPieces(safeQty, pack));
      }
    },
    [upsertCountedProduct],
  );

  const recordScan = useCallback(
    async (lineId: number, opts: { delta?: number; quantity?: number; barcode?: string; source?: string }) => {
      if (!task) return null;
      try {
        const data = await recordInventoryScan(
          tenantId,
          task.inventory_document_id,
          {
            line_id: lineId,
            delta: opts.delta,
            quantity: opts.quantity,
            barcode_value: opts.barcode,
            source: opts.source ?? "scanner",
            carrier_id: activeScan?.carrier_id ?? activeCarrierId,
          },
          sessionId ?? undefined,
        );
        if (data?.operator_count_conflict != null) {
          setCountConflict(Boolean(data.operator_count_conflict));
        }
        refreshOffline();
        return data;
      } catch {
        inventoryCountSyncQueue.enqueue({
          kind: "scan",
          documentId: task.inventory_document_id,
          lineId,
          delta: opts.delta,
          quantity: opts.quantity,
          barcode: opts.barcode,
          sessionId: sessionId ?? undefined,
        });
        refreshOffline();
        throw new Error("offline_queue");
      }
    },
    [activeCarrierId, activeScan?.carrier_id, refreshOffline, sessionId, task, tenantId],
  );

  const resolveLocationScan = useCallback(
    async (code: string) => {
      if (!task) return false;
      const labels = [
        task.location_code,
        task.location_name,
        String(task.location_id),
        locationContext?.locationCode,
      ];
      const matches = labels.some((label) => label && locationCodesMatch(String(label), code));

      if (!matches) {
        try {
          await confirmWmsInventoryLocation(tenantId, task.id, {
            location_id: task.location_id,
            scanned_code: code,
          });
        } catch {
          scanFeedback.error("Nieprawidłowa lokalizacja");
          pulseBad();
          return false;
        }
      }

      activateLocationContext(task, { fromScan: true });
      return true;
    },
    [activateLocationContext, locationContext?.locationCode, pulseBad, scanFeedback, task, tenantId],
  );

  const attachCarrier = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return false;
      if (!activeScan || activeLineId == null) {
        scanFeedback.warning("Najpierw zeskanuj produkt");
        pulseBad();
        return false;
      }
      try {
        const resolved = await resolveWmsInventoryCarrier(tenantId, trimmed);
        setCarrierContext({ carrierId: resolved.carrier_id, code: resolved.code });
        setActiveScan({ ...activeScan, carrier_id: resolved.carrier_id });
        setCountedProducts((prev) => {
          const row = prev[activeLineId];
          if (!row) return prev;
          return {
            ...prev,
            [activeLineId]: {
              ...row,
              carrier_id: resolved.carrier_id,
              carrier_code: resolved.code,
              scan: { ...row.scan, carrier_id: resolved.carrier_id },
            },
          };
        });
        setCarrierScanMode(false);
        scanFeedback.success(undefined);
        return true;
      } catch {
        scanFeedback.error("Nie rozpoznano nośnika");
        pulseBad();
        return false;
      }
    },
    [activeLineId, activeScan, pulseBad, scanFeedback, tenantId],
  );

  const commitProductDelta = useCallback(
    async (
      resolved: WmsBarcodeResolveResult,
      opts: { barcode?: string; source?: string; isCartonScan: boolean; unitsPerCarton: number },
    ) => {
      const pack = Math.max(1, opts.unitsPerCarton);
      const committed = clampInventoryQtyState(commitInventoryQtyDraft(qtyEditStateRef.current));
      const sameLine = resolved.line_id === activeLineIdRef.current;

      let baseState: InventoryQtyEditState;
      if (sameLine && activeScanRef.current && packaging.loaded) {
        baseState = committed;
      } else {
        const basePieces = resolved.my_counted_quantity ?? 0;
        baseState = inventoryQtyFromPieces(basePieces, pack);
      }

      const nextState = clampInventoryQtyState(
        opts.isCartonScan
          ? { ...baseState, cartonsCount: baseState.cartonsCount + 1, inputMode: "carton", draft: null }
          : { ...baseState, unitsCount: baseState.unitsCount + 1, inputMode: "unit", draft: null },
      );
      const nextQty = inventoryTotalPieces(nextState, pack);

      applyScanQty(resolved, nextQty, pack, nextState);

      try {
        const data = await recordScan(resolved.line_id, {
          quantity: nextQty,
          barcode: opts.barcode,
          source: opts.source ?? "scanner",
        });
        const serverQty = data?.my_counted_quantity;
        if (serverQty != null && Math.round(serverQty) !== nextQty) {
          applyScanQty(
            resolved,
            serverQty,
            pack,
            inventoryQtyFromPieces(serverQty, pack, nextState.inputMode),
          );
        }
        return true;
      } catch {
        scanFeedback.error("Błąd zapisu — spróbuj ponownie");
        return false;
      }
    },
    [applyScanQty, packaging.loaded, recordScan, scanFeedback],
  );

  const handleProductScan = useCallback(
    async (code: string, source = "scanner") => {
      if (!task || !locationActive || !warehouseId) return;
      try {
        const resolved = await resolveWmsInventoryBarcode(tenantId, task.id, code, activeCarrierId ?? undefined);
        const pack = await loadPackagingForProduct(tenantId, warehouseId, resolved.product_id);
        setPackaging(pack);
        lastSyncedPackRef.current = null;
        setCountConflict(Boolean(resolved.operator_count_conflict));
        const isCartonScan = scanIsCartonCode(code, pack);
        setLastScanKind(isCartonScan ? "carton" : "unit");
        const saved = await commitProductDelta(resolved, {
          barcode: code,
          source,
          isCartonScan,
          unitsPerCarton: pack.unitsPerCarton,
        });
        if (saved) scanFeedback.success(undefined);
      } catch (err) {
        pulseBad();
        if (err instanceof WmsBarcodeResolveError) {
          if (err.code === "task_not_found") scanFeedback.error("Zadanie nie istnieje");
          else if (err.code === "barcode_ambiguous") scanFeedback.warning("Wiele produktów — wpisz nazwę");
          else if (err.code === "barcode_not_found") {
            scanFeedback.error("Nieznany produkt");
            setUnknownOpen(true);
          } else scanFeedback.error("Nie rozpoznano");
          setLastScanCode(code);
          return;
        }
        scanFeedback.error("Błąd zapisu");
        setLastScanCode(code);
      }
    },
    [activeCarrierId, commitProductDelta, locationActive, pulseBad, scanFeedback, task, tenantId, warehouseId],
  );

  const persistQtyPieces = useCallback(
    async (pieces: number, pack: number) => {
      const base = activeScanRef.current;
      if (!base) {
        scanFeedback.warning("Zeskanuj produkt");
        return;
      }
      const nextQty = Math.max(0, Math.round(pieces));
      const current = base.counted_quantity ?? 0;
      if (nextQty === current) return;
      const nextState = inventoryQtyFromPieces(nextQty, pack);
      applyScanQty(base, nextQty, pack, nextState);
      try {
        const data = await recordScan(base.line_id, { quantity: nextQty, source: "manual" });
        const serverQty = data?.my_counted_quantity;
        if (serverQty != null && Math.round(serverQty) !== nextQty) {
          applyScanQty(base, serverQty, pack, inventoryQtyFromPieces(serverQty, pack));
        }
      } catch {
        scanFeedback.error("Błąd zapisu");
      }
    },
    [applyScanQty, recordScan, scanFeedback],
  );

  const adjustQty = useCallback(
    async (field: WmsQtyInputMode, delta: number) => {
      const base = activeScanRef.current;
      if (!base || !packaging.loaded) return;
      const pack = Math.max(1, packaging.unitsPerCarton);
      const committed = clampInventoryQtyState(commitInventoryQtyDraft(qtyEditStateRef.current));
      const nextState = clampInventoryQtyState(
        field === "carton"
          ? { ...committed, cartonsCount: Math.max(0, committed.cartonsCount + delta), inputMode: "carton", draft: null }
          : { ...committed, unitsCount: Math.max(0, committed.unitsCount + delta), inputMode: "unit", draft: null },
      );
      setQtyEditState(nextState);
      await persistQtyPieces(inventoryTotalPieces(nextState, pack), pack);
    },
    [packaging.loaded, packaging.unitsPerCarton, persistQtyPieces],
  );

  const setQtyField = useCallback(
    async (field: WmsQtyInputMode, value: number) => {
      if (!activeScanRef.current || !packaging.loaded) return;
      const pack = Math.max(1, packaging.unitsPerCarton);
      const committed = clampInventoryQtyState(commitInventoryQtyDraft(qtyEditStateRef.current));
      const nextState = clampInventoryQtyState(
        field === "carton"
          ? { ...committed, cartonsCount: Math.max(0, Math.round(value)), inputMode: "carton", draft: null }
          : { ...committed, unitsCount: Math.max(0, Math.round(value)), inputMode: "unit", draft: null },
      );
      setQtyEditState(nextState);
      await persistQtyPieces(inventoryTotalPieces(nextState, pack), pack);
    },
    [packaging.loaded, packaging.unitsPerCarton, persistQtyPieces],
  );

  const setQtyInputMode = useCallback((mode: WmsQtyInputMode) => {
    setQtyEditState((prev) => ({ ...prev, inputMode: mode, draft: null }));
  }, []);

  const setQtyDraft = useCallback((draft: string | null) => {
    setQtyEditState((prev) => ({ ...prev, draft }));
  }, []);

  const commitQtyDraft = useCallback(() => {
    if (qtyEditState.draft === null || !packaging.loaded) return;
    const committed = clampInventoryQtyState(commitInventoryQtyDraft(qtyEditState));
    const pack = Math.max(1, packaging.unitsPerCarton);
    setQtyEditState({ ...committed, draft: null });
    void persistQtyPieces(inventoryTotalPieces(committed, pack), pack);
  }, [packaging.loaded, packaging.unitsPerCarton, persistQtyPieces, qtyEditState]);

  const markActiveDefect = useCallback((note: string | null) => {
    if (activeLineId == null) return;
    setCountedProducts((prev) => {
      const row = prev[activeLineId];
      if (!row) return prev;
      return {
        ...prev,
        [activeLineId]: {
          ...row,
          defectReported: true,
          defectNote: note,
        },
      };
    });
  }, [activeLineId]);

  const clearActiveProduct = useCallback(() => {
    setActiveScan(null);
    setActiveLineId(null);
    setLastScanKind(null);
  }, []);

  const selectCountedProduct = useCallback(
    (item: WmsCountedProduct) => {
      setActiveScan(item.scan);
      setActiveLineId(item.line_id);
      setLastScanKind(null);
      lastSyncedPackRef.current = null;
      if (warehouseId && item.product_id) {
        void loadPackagingForProduct(tenantId, warehouseId, item.product_id).then((pack) => {
          setPackaging(pack);
          setQtyEditState(inventoryQtyFromPieces(item.counted_quantity, pack.unitsPerCarton));
        });
      } else {
        setQtyEditState(inventoryQtyFromPieces(item.counted_quantity, 1));
      }
    },
    [tenantId, warehouseId],
  );

  const handleScan = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code || !task) return;

      const now = Date.now();
      if (scanInFlight.current) return;
      if (code === lastScanSubmit.current.code && now - lastScanSubmit.current.at < SCAN_LOCK_MS) return;

      scanInFlight.current = true;
      lastScanSubmit.current = { code, at: now };

      try {
        if (!locationActive) {
          await resolveLocationScan(code);
          return;
        }
        if (carrierScanMode || isCarrierBarcode(code)) {
          await attachCarrier(code);
          return;
        }
        await handleProductScan(code);
      } finally {
        scanInFlight.current = false;
      }
    },
    [attachCarrier, carrierScanMode, handleProductScan, locationActive, resolveLocationScan, task],
  );

  const handleSearchProduct = useCallback(
    (code: string) => {
      if (task && locationActive) void handleProductScan(code, "search");
    },
    [handleProductScan, locationActive, task],
  );

  const handleSearchLocation = useCallback(
    async (locationCode: string, pickTaskId?: number | null) => {
      if (pickTaskId && Number(taskId) !== pickTaskId) {
        goToTask(pickTaskId, sessionId);
        return;
      }
      await resolveLocationScan(locationCode);
    },
    [goToTask, resolveLocationScan, sessionId, taskId],
  );

  const handleSearchCarrier = useCallback(
    (code: string) => {
      void attachCarrier(code);
    },
    [attachCarrier],
  );

  const enterCarrierScan = useCallback(() => {
    if (!activeScan) {
      scanFeedback.warning("Najpierw zeskanuj produkt");
      return;
    }
    setCarrierScanMode(true);
  }, [activeScan, scanFeedback]);
  const skipCarrier = useCallback(() => setCarrierScanMode(false), []);
  const clearCarrier = useCallback(() => {
    if (activeLineId == null) return;
    setCarrierContext(null);
    setCarrierScanMode(false);
    setActiveScan((prev) => (prev ? { ...prev, carrier_id: null } : prev));
    setCountedProducts((prev) => {
      const row = prev[activeLineId];
      if (!row) return prev;
      return {
        ...prev,
        [activeLineId]: {
          ...row,
          carrier_id: null,
          carrier_code: null,
          scan: { ...row.scan, carrier_id: null },
        },
      };
    });
  }, [activeLineId]);

  const finishLocation = useCallback(() => {
    if (task) commitLocationSessionToRecent(task.id);
    hydratedTaskIdRef.current = null;
    const docId = task?.inventory_document_id;
    setTask(null);
    resetCountingUi(uiResetters);
    if (docId) {
      navigate(wmsInventoryCountPaths.document(docId), { replace: true });
    } else {
      navigate(wmsInventoryCountPaths.root, { replace: true });
    }
    scanFeedback.success(undefined);
  }, [navigate, scanFeedback, task, uiResetters]);

  return {
    loading,
    error,
    task,
    sessionId,
    step,
    locationContext,
    carrierContext,
    locationActive,
    locationLabel,
    locationSubline,
    inventoryType,
    isPartialInventory,
    activeScan,
    activeLineId,
    activeCountedProduct,
    operatorRecentList,
    countConflict,
    unexpectedItems,
    packaging,
    qtyEditState,
    lastScanKind,
    pulseLineId,
    qtyPulse,
    invalidPulse,
    carrierScanMode,
    unknownOpen,
    lastScanCode,
    setUnknownOpen,
    setQtyInputMode,
    setQtyDraft,
    commitQtyDraft,
    adjustQty,
    setQtyField,
    selectCountedProduct,
    clearActiveProduct,
    enterCarrierScan,
    skipCarrier,
    clearCarrier,
    finishLocation,
    reloadFromServer,
    markActiveDefect,
    goToTask,
    handleScan,
    handleSearchProduct,
    handleSearchLocation,
    handleSearchCarrier,
  };
}
