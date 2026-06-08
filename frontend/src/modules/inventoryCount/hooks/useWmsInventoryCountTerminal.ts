import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  confirmWmsInventoryLocation,
  fetchWmsInventoryTask,
  openWmsInventorySession,
  recordInventoryScan,
  resolveWmsInventoryBarcode,
  resolveWmsInventoryLocationScan,
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

const SCAN_DEBOUNCE_MS = 120;

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
  const [qtyPulse, setQtyPulse] = useState(false);
  const [unknownOpen, setUnknownOpen] = useState(false);
  const [lastScanCode, setLastScanCode] = useState<string | null>(null);

  const loadTask = useCallback(
    async (id: number, existingSessionId?: number | null) => {
      if (!warehouseId) return;
      setLoading(true);
      setError(null);
      try {
        const t = await fetchWmsInventoryTask(tenantId, id);
        let sid = existingSessionId ?? sessionId;
        if (!sid) {
          const session = await openWmsInventorySession(tenantId, warehouseId, {
            document_id: t.inventory_document_id,
            task_id: t.id,
          });
          sid = session.id;
        }
        setTask(t);
        setSessionId(sid);
        setStep("location");
        setCarrierCode(null);
        setCarrierScanMode(false);
        setManualOpen(false);
        setActiveLineId(null);
        setActiveScan(null);
        cacheTaskSnapshot({
          taskId: t.id,
          locationCode: t.location_code ?? t.location_name ?? `#${t.location_id}`,
          progressPercent: t.progress_percent,
          cachedAt: new Date().toISOString(),
        });
        navigate(wmsInventoryCountPaths.count(t.id), { replace: true, state: { sessionId: sid } });
      } catch {
        setError("Nie udało się wczytać zadania.");
      } finally {
        setLoading(false);
      }
    },
    [navigate, sessionId, tenantId, warehouseId],
  );

  useEffect(() => {
    if (!warehouseId) {
      setLoading(false);
      return;
    }
    if (taskId && Number.isFinite(taskId) && (!task || task.id !== taskId)) {
      void loadTask(taskId, navSessionId);
    } else if (!taskId) {
      setLoading(false);
      setTask(null);
      setStep("location");
    }
  }, [taskId, warehouseId, navSessionId, loadTask, task]);

  const locationLabel = task?.location_code ?? task?.location_name ?? (task ? `#${task.location_id}` : "—");

  const pulseQty = useCallback(() => {
    setQtyPulse(true);
    window.setTimeout(() => setQtyPulse(false), 280);
  }, []);

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
      if (!warehouseId) return false;
      if (task) {
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
            return false;
          }
        }
        setStep("product");
        scanFeedback.success(undefined);
        return true;
      }

      try {
        const resolved = await resolveWmsInventoryLocationScan(tenantId, warehouseId, code);
        if (!resolved.found || !resolved.task_id) {
          scanFeedback.error(
            resolved.reason === "location_not_found" ? "Nie znaleziono lokalizacji" : "Brak zadania",
          );
          return false;
        }
        await loadTask(resolved.task_id);
        setStep("product");
        scanFeedback.success(undefined);
        return true;
      } catch {
        scanFeedback.error("Błąd skanowania");
        return false;
      }
    },
    [loadTask, scanFeedback, task, tenantId, warehouseId],
  );

  const applyScanQty = useCallback(
    (resolved: WmsBarcodeResolveResult, nextQty: number) => {
      setActiveScan({ ...resolved, counted_quantity: nextQty });
      pulseQty();
    },
    [pulseQty],
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

        await recordScan(resolved.line_id, { delta: 1, barcode: code });
        const nextQty = (resolved.counted_quantity ?? 0) + 1;
        applyScanQty(resolved, nextQty);
        scanFeedback.success(undefined);
        setActiveLineId(null);
      } catch (err) {
        if (err instanceof WmsBarcodeResolveError) {
          if (err.code === "task_not_found") {
            scanFeedback.error("Zadanie nie istnieje");
          } else if (err.code === "barcode_ambiguous") {
            scanFeedback.warning("Wiele produktów — wpisz SKU");
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
    [applyScanQty, manualOpen, recordScan, scanFeedback, task, tenantId],
  );

  const confirmManualQty = useCallback(async () => {
    if (!activeLineId || !activeScan) return;
    try {
      await recordScan(activeLineId, { quantity: pendingQty });
      applyScanQty(activeScan, pendingQty);
      scanFeedback.success(undefined);
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
    !loading && !error,
  );

  const enterCarrierScan = useCallback(() => {
    setCarrierScanMode(true);
  }, []);

  const finishLocation = useCallback(() => {
    setTask(null);
    setStep("location");
    setCarrierCode(null);
    setCarrierScanMode(false);
    setManualOpen(false);
    setActiveLineId(null);
    setActiveScan(null);
    navigate(wmsInventoryCountPaths.tasks, { replace: true });
    scanFeedback.success(undefined);
  }, [navigate, scanFeedback]);

  return {
    loading,
    error,
    task,
    sessionId,
    step,
    carrierScanMode,
    locationLabel,
    activeScan,
    qtyPulse,
    manualOpen,
    pendingQty,
    unknownOpen,
    lastScanCode,
    setManualOpen,
    setManualQty: setPendingQty,
    setUnknownOpen,
    confirmManualQty,
    enterCarrierScan,
    cancelCarrierScan: () => setCarrierScanMode(false),
    finishLocation,
    loadTask,
    handleScan,
  };
}
