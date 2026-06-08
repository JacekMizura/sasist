import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  confirmWmsInventoryLocation,
  fetchWmsInventoryTask,
  openWmsInventorySession,
  recordInventoryScan,
  resolveWmsInventoryBarcode,
  WmsBarcodeResolveError,
  type InventoryTaskRead,
  type WmsBarcodeResolveResult,
} from "../../../api/inventoryCountApi";
import { useScanFeedback } from "../../../components/wms/execution/useScanFeedback";
import { useWmsPageScanHandler } from "../../../components/wms/execution/useWmsPageScanHandler";
import { wmsInventoryCountPaths } from "../inventoryCountPaths";
import { cacheTaskSnapshot, inventoryCountSyncQueue } from "../offline/inventoryCountSyncQueue";
import { useInventoryCountOfflineStatus } from "../offline/useInventoryCountOfflineStatus";

export type WmsTerminalStep = "location" | "product";

export type WmsLastScanEntry = {
  at: string;
  line_id: number;
  product_name: string | null;
  sku?: string | null;
  ean?: string | null;
  image_url?: string | null;
  delta: number;
  counted_quantity: number;
  scan: WmsBarcodeResolveResult;
};

const SCAN_DEBOUNCE_MS = 120;
const LAST_SCAN_LIMIT = 5;

function buildLocationMeta(task: InventoryTaskRead | null): string | null {
  if (!task) return null;
  const parts: string[] = [];
  if (task.zone_code) parts.push(`STREFA ${task.zone_code}`);
  if (task.aisle_code) parts.push(`REGAŁ ${task.aisle_code}`);
  const code = task.location_code ?? task.location_name ?? "";
  const segs = code.split(/[-/]/).filter(Boolean);
  if (segs.length >= 3) parts.push(`POZIOM ${segs[segs.length - 1]}`);
  return parts.length ? parts.join(" • ") : null;
}

function resetCountingUi(setters: {
  setStep: (s: WmsTerminalStep) => void;
  setCarrierCode: (v: string | null) => void;
  setCarrierScanMode: (v: boolean) => void;
  setManualOpen: (v: boolean) => void;
  setActiveLineId: (v: number | null) => void;
  setActiveScan: (v: WmsBarcodeResolveResult | null) => void;
  setLastScans: (v: WmsLastScanEntry[]) => void;
  setPendingQty: (v: number) => void;
}) {
  setters.setStep("location");
  setters.setCarrierCode(null);
  setters.setCarrierScanMode(false);
  setters.setManualOpen(false);
  setters.setActiveLineId(null);
  setters.setActiveScan(null);
  setters.setLastScans([]);
  setters.setPendingQty(1);
}

/**
 * WMS inventory terminal — route param `taskId` is the ONLY source of truth for active task.
 * Never auto-navigate during fetch/hydration; navigate only on explicit operator actions.
 */
export function useWmsInventoryCountTerminal(
  taskId: number | undefined,
  tenantId: number,
  warehouseId: number | undefined,
) {
  const navigate = useNavigate();
  const location = useLocation();
  const scanFeedback = useScanFeedback();
  const { refresh: refreshOffline } = useInventoryCountOfflineStatus();
  const navSessionId = (location.state as { sessionId?: number } | null)?.sessionId ?? null;
  const lastScanAt = useRef(0);
  const hydratedTaskIdRef = useRef<number | null>(null);

  const [loading, setLoading] = useState(Boolean(taskId));
  const [error, setError] = useState<string | null>(null);
  const [task, setTask] = useState<InventoryTaskRead | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(navSessionId);
  const [step, setStep] = useState<WmsTerminalStep>("location");
  const [carrierCode, setCarrierCode] = useState<string | null>(null);
  const [carrierScanMode, setCarrierScanMode] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [pendingQty, setPendingQty] = useState(1);
  const [activeLineId, setActiveLineId] = useState<number | null>(null);
  const [activeScan, setActiveScan] = useState<WmsBarcodeResolveResult | null>(null);
  const [lastScans, setLastScans] = useState<WmsLastScanEntry[]>([]);
  const [qtyPulse, setQtyPulse] = useState(false);
  const [invalidPulse, setInvalidPulse] = useState(false);
  const [unknownOpen, setUnknownOpen] = useState(false);
  const [lastScanCode, setLastScanCode] = useState<string | null>(null);

  const uiResetters = useMemo(
    () => ({
      setStep,
      setCarrierCode,
      setCarrierScanMode,
      setManualOpen,
      setActiveLineId,
      setActiveScan,
      setLastScans,
      setPendingQty,
    }),
    [],
  );

  /** Operator-only navigation to another task route. */
  const goToTask = useCallback(
    (nextTaskId: number, nextSessionId?: number | null) => {
      if (!Number.isFinite(nextTaskId)) return;
      if (Number(taskId) === nextTaskId) return;
      navigate(wmsInventoryCountPaths.count(nextTaskId), {
        state: nextSessionId != null ? { sessionId: nextSessionId } : undefined,
      });
    },
    [navigate, taskId],
  );

  // Hydrate from route param — fetch only, never navigate.
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

    if (hydratedTaskIdRef.current !== taskId) {
      resetCountingUi(uiResetters);
      hydratedTaskIdRef.current = null;
    }

    void (async () => {
      try {
        const t = await fetchWmsInventoryTask(tenantId, taskId);
        if (cancelled) return;

        let sid = navSessionId ?? sessionId;
        if (!sid) {
          const session = await openWmsInventorySession(tenantId, warehouseId, {
            document_id: t.inventory_document_id,
            task_id: t.id,
          });
          sid = session.id;
        }
        if (cancelled) return;

        setTask(t);
        setSessionId(sid);
        hydratedTaskIdRef.current = taskId;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate only when route taskId / warehouse changes
  }, [taskId, warehouseId, tenantId]);

  // Apply session id from navigation state without re-fetching task.
  useEffect(() => {
    if (navSessionId != null) {
      setSessionId(navSessionId);
    }
  }, [navSessionId]);

  const locationLabel = task?.location_code ?? task?.location_name ?? (task ? `#${task.location_id}` : "—");
  const locationMeta = useMemo(() => buildLocationMeta(task), [task]);

  const pulseOk = useCallback(() => {
    setQtyPulse(true);
    window.setTimeout(() => setQtyPulse(false), 280);
  }, []);

  const pulseBad = useCallback(() => {
    setInvalidPulse(true);
    window.setTimeout(() => setInvalidPulse(false), 400);
  }, []);

  const pushLastScan = useCallback((scan: WmsBarcodeResolveResult, delta: number, counted: number) => {
    const entry: WmsLastScanEntry = {
      at: `${Date.now()}-${scan.line_id}`,
      line_id: scan.line_id,
      product_name: scan.product_name,
      sku: scan.sku,
      ean: scan.ean,
      image_url: scan.image_url,
      delta,
      counted_quantity: counted,
      scan,
    };
    setLastScans((prev) => [entry, ...prev].slice(0, LAST_SCAN_LIMIT));
  }, []);

  const applyScanQty = useCallback(
    (scan: WmsBarcodeResolveResult, nextQty: number, delta: number) => {
      setActiveScan({ ...scan, counted_quantity: nextQty });
      pushLastScan({ ...scan, counted_quantity: nextQty }, delta, nextQty);
      pulseOk();
    },
    [pulseOk, pushLastScan],
  );

  const recordScan = useCallback(
    async (lineId: number, opts: { delta?: number; quantity?: number; barcode?: string }) => {
      if (!task) return;
      try {
        await recordInventoryScan(
          tenantId,
          task.inventory_document_id,
          {
            line_id: lineId,
            delta: opts.delta,
            quantity: opts.quantity,
            barcode_value: opts.barcode,
          },
          sessionId ?? undefined,
        );
        refreshOffline();
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
    [refreshOffline, sessionId, task, tenantId],
  );

  const resolveLocationScan = useCallback(
    async (code: string) => {
      if (!task) return false;
      const locLabel = task.location_name ?? task.location_code ?? "";
      const matches =
        code.toUpperCase() === locLabel.toUpperCase() || code === String(task.location_id);
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
      setStep("product");
      scanFeedback.success(undefined);
      return true;
    },
    [pulseBad, scanFeedback, task, tenantId],
  );

  const commitProductDelta = useCallback(
    async (resolved: WmsBarcodeResolveResult, delta: number, barcode?: string) => {
      await recordScan(resolved.line_id, { delta, barcode });
      const nextQty = Math.max(0, (resolved.counted_quantity ?? 0) + delta);
      applyScanQty(resolved, nextQty, delta);
      scanFeedback.success(delta === 1 ? "Dodano +1" : `Dodano +${delta}`);
    },
    [applyScanQty, recordScan, scanFeedback],
  );

  const handleProductScan = useCallback(
    async (code: string) => {
      if (!task) return;
      try {
        const resolved = await resolveWmsInventoryBarcode(tenantId, task.id, code);
        setActiveLineId(resolved.line_id);

        if (manualOpen) {
          setActiveScan(resolved);
          setPendingQty(Math.max(1, Math.round(resolved.counted_quantity ?? 1)));
          scanFeedback.success(undefined);
          return;
        }

        await commitProductDelta(resolved, 1, code);
        setActiveLineId(null);
      } catch (err) {
        pulseBad();
        if (err instanceof WmsBarcodeResolveError) {
          if (err.code === "task_not_found") {
            scanFeedback.error("Zadanie nie istnieje");
          } else if (err.code === "barcode_ambiguous") {
            scanFeedback.warning("Wiele produktów — użyj Szukaj");
          } else if (err.code === "barcode_not_found") {
            scanFeedback.error("Nieznany produkt");
            setUnknownOpen(true);
          } else {
            scanFeedback.error("Nie rozpoznano");
          }
          setLastScanCode(code);
          return;
        }
        scanFeedback.error("Błąd zapisu");
        setLastScanCode(code);
      }
    },
    [commitProductDelta, manualOpen, pulseBad, scanFeedback, task, tenantId],
  );

  const quickAddDelta = useCallback(
    async (delta: number) => {
      const base = activeScan ?? lastScans[0]?.scan;
      if (!base) {
        scanFeedback.warning("Zeskanuj produkt");
        return;
      }
      try {
        await commitProductDelta(base, delta);
      } catch {
        scanFeedback.error("Błąd zapisu");
      }
    },
    [activeScan, commitProductDelta, lastScans, scanFeedback],
  );

  const undoLastScan = useCallback(async () => {
    const last = lastScans[0];
    if (!last || last.delta <= 0) {
      scanFeedback.warning("Brak skanu do cofnięcia");
      return;
    }
    try {
      await recordScan(last.line_id, { delta: -last.delta });
      const nextQty = Math.max(0, last.counted_quantity - last.delta);
      setActiveScan({ ...last.scan, counted_quantity: nextQty });
      setLastScans((prev) => prev.slice(1));
      scanFeedback.success("Cofnięto");
    } catch {
      scanFeedback.error("Nie cofnięto");
    }
  }, [lastScans, recordScan, scanFeedback]);

  const confirmManualQty = useCallback(async () => {
    if (!activeLineId || !activeScan) return;
    try {
      await recordScan(activeLineId, { quantity: pendingQty });
      applyScanQty(activeScan, pendingQty, pendingQty - (activeScan.counted_quantity ?? 0));
      scanFeedback.success(`Zapisano ${pendingQty}`);
      setActiveLineId(null);
      setManualOpen(false);
      setPendingQty(1);
    } catch (e) {
      if ((e as Error).message !== "offline_queue") {
        scanFeedback.error("Nie zapisano");
      } else {
        scanFeedback.warning("Offline");
      }
    }
  }, [activeLineId, activeScan, applyScanQty, pendingQty, recordScan, scanFeedback]);

  const handleScan = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code) return;
      const now = Date.now();
      if (now - lastScanAt.current < SCAN_DEBOUNCE_MS) return;
      lastScanAt.current = now;

      if (!task || step === "location") {
        await resolveLocationScan(code);
        return;
      }
      if (carrierScanMode) {
        setCarrierCode(code);
        setCarrierScanMode(false);
        scanFeedback.success(undefined);
        return;
      }
      await handleProductScan(code);
    },
    [carrierScanMode, handleProductScan, resolveLocationScan, scanFeedback, step, task],
  );

  useWmsPageScanHandler(
    useCallback((value: string) => void handleScan(value), [handleScan]),
    !loading && !error && Boolean(task),
  );

  const handleSearchProduct = useCallback(
    (code: string) => {
      if (task && step === "product") {
        void handleProductScan(code);
      }
    },
    [handleProductScan, step, task],
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

  const handleSearchCarrier = useCallback((code: string) => {
    setCarrierCode(code);
    setCarrierScanMode(false);
    scanFeedback.success(undefined);
  }, [scanFeedback]);

  const enterCarrierScan = useCallback(() => setCarrierScanMode(true), []);
  const skipCarrier = useCallback(() => setCarrierScanMode(false), []);

  const finishLocation = useCallback(() => {
    hydratedTaskIdRef.current = null;
    setTask(null);
    resetCountingUi(uiResetters);
    navigate(wmsInventoryCountPaths.tasks, { replace: true });
    scanFeedback.success(undefined);
  }, [navigate, scanFeedback, uiResetters]);

  return {
    loading,
    error,
    task,
    sessionId,
    step,
    carrierCode,
    carrierScanMode,
    locationLabel,
    locationMeta,
    activeScan,
    lastScans,
    qtyPulse,
    invalidPulse,
    manualOpen,
    pendingQty,
    unknownOpen,
    lastScanCode,
    setManualOpen,
    setManualQty: setPendingQty,
    setUnknownOpen,
    confirmManualQty,
    quickAddDelta,
    undoLastScan,
    enterCarrierScan,
    skipCarrier,
    cancelCarrierScan: skipCarrier,
    finishLocation,
    goToTask,
    handleScan,
    handleSearchProduct,
    handleSearchLocation,
    handleSearchCarrier,
  };
}
