import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  confirmWmsInventoryLocation,
  fetchWmsExecutionSummary,
  fetchWmsInventoryTask,
  openWmsInventorySession,
  recordInventoryScan,
  resolveWmsInventoryBarcode,
  resolveWmsInventoryLocationScan,
  searchWmsTaskProducts,
  type InventoryExecutionSummary,
  type InventoryTaskRead,
} from "../../../api/inventoryCountApi";
import { useScanFeedback } from "../../../components/wms/execution/useScanFeedback";
import { useWmsPageScanHandler } from "../../../components/wms/execution/useWmsPageScanHandler";
import type { EmergencySearchPick } from "../components/WmsInventoryEmergencySearch";
import { wmsInventoryCountPaths } from "../inventoryCountPaths";
import { cacheTaskSnapshot, inventoryCountSyncQueue } from "../offline/inventoryCountSyncQueue";
import { useInventoryCountOfflineStatus } from "../offline/useInventoryCountOfflineStatus";

export type WmsTerminalStep = "location" | "carrier" | "product";

const SCAN_DEBOUNCE_MS = 120;

export function useWmsInventoryCountTerminal(
  taskId: number | undefined,
  tenantId: number,
  warehouseId: number | undefined,
) {
  const navigate = useNavigate();
  const location = useLocation();
  const scanFeedback = useScanFeedback();
  const { online, refresh: refreshOffline } = useInventoryCountOfflineStatus();
  const navSessionId = (location.state as { sessionId?: number } | null)?.sessionId ?? null;
  const lastScanAt = useRef(0);

  const [loading, setLoading] = useState(Boolean(taskId));
  const [error, setError] = useState<string | null>(null);
  const [task, setTask] = useState<InventoryTaskRead | null>(null);
  const [summary, setSummary] = useState<InventoryExecutionSummary | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(navSessionId);
  const [step, setStep] = useState<WmsTerminalStep>("location");
  const [carrierCode, setCarrierCode] = useState<string | null>(null);
  const [scanMode, setScanMode] = useState<"increment" | "manual">("increment");
  const [autoConfirm, setAutoConfirm] = useState(true);
  const [pendingQty, setPendingQty] = useState(1);
  const [activeLineId, setActiveLineId] = useState<number | null>(null);
  const [activeProductLabel, setActiveProductLabel] = useState<string | null>(null);
  const [unknownOpen, setUnknownOpen] = useState(false);
  const [lastScanCode, setLastScanCode] = useState<string | null>(null);
  const [documentLabel, setDocumentLabel] = useState<string>("—");

  const reloadSummary = useCallback(async () => {
    if (!task) return null;
    const s = await fetchWmsExecutionSummary(tenantId, task.id);
    setSummary(s);
    return s;
  }, [task, tenantId]);

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
        const s = await fetchWmsExecutionSummary(tenantId, id);
        setTask(t);
        setSessionId(sid);
        setSummary(s);
        setDocumentLabel(`INV #${t.inventory_document_id}`);
        setStep("location");
        setCarrierCode(null);
        setActiveLineId(null);
        setActiveProductLabel(null);
        cacheTaskSnapshot({
          taskId: t.id,
          locationCode: t.location_code ?? t.location_name ?? `#${t.location_id}`,
          progressPercent: t.progress_percent,
          cachedAt: new Date().toISOString(),
        });
        navigate(wmsInventoryCountPaths.count(t.id), { replace: true, state: { sessionId: sid } });
      } catch {
        setError("Nie udało się wczytać zadania liczenia.");
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
      setSummary(null);
      setStep("location");
    }
  }, [taskId, warehouseId, navSessionId, loadTask, task]);

  const locationLabel = task?.location_code ?? task?.location_name ?? (task ? `#${task.location_id}` : "—");

  const scanHint = useMemo(() => {
    if (!task) return "Zeskanuj lokalizację aby rozpocząć";
    if (step === "location") return `Zeskanuj lokalizację: ${locationLabel}`;
    if (step === "carrier") return carrierCode ? `Nośnik: ${carrierCode}` : "Zeskanuj nośnik (opcjonalnie) lub pomiń";
    if (activeLineId && scanMode === "manual" && !autoConfirm) return "Potwierdź ilość";
    return "Zeskanuj produkt — auto +1";
  }, [activeLineId, autoConfirm, carrierCode, locationLabel, scanMode, step, task]);

  const progressPercent = summary?.progress_percent ?? task?.progress_percent ?? 0;
  const progressLabel = summary
    ? `${summary.counted_line_count}/${summary.line_count} · ${summary.progress_percent}%`
    : task
      ? `${task.progress_percent}%`
      : "0%";

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
        await reloadSummary();
        const t = await fetchWmsInventoryTask(tenantId, task.id);
        setTask(t);
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
    [reloadSummary, refreshOffline, sessionId, task, tenantId],
  );

  const beginCounting = useCallback(() => {
    setStep("product");
    scanFeedback.success("Gotowe do liczenia produktów");
  }, [scanFeedback]);

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
            scanFeedback.error("Nieprawidłowa lokalizacja.");
            return false;
          }
        }
        setStep("carrier");
        scanFeedback.success("Lokalizacja OK");
        return true;
      }

      try {
        const resolved = await resolveWmsInventoryLocationScan(tenantId, warehouseId, code);
        if (!resolved.found || !resolved.task_id) {
          scanFeedback.error(
            resolved.reason === "location_not_found"
              ? "Nie znaleziono lokalizacji"
              : "Brak otwartego zadania dla lokalizacji",
          );
          return false;
        }
        await loadTask(resolved.task_id);
        setStep("carrier");
        scanFeedback.success(resolved.location_code ?? "Lokalizacja OK");
        return true;
      } catch {
        scanFeedback.error("Błąd skanowania lokalizacji");
        return false;
      }
    },
    [loadTask, scanFeedback, task, tenantId, warehouseId],
  );

  const handleProductScan = useCallback(
    async (code: string) => {
      if (!task) return;
      try {
        const resolved = await resolveWmsInventoryBarcode(tenantId, task.id, code);
        if (scanMode === "increment" && autoConfirm) {
          await recordScan(resolved.line_id, { delta: 1, barcode: code });
          scanFeedback.success(resolved.product_name ?? "+1");
          setActiveLineId(null);
          setActiveProductLabel(null);
          return;
        }
        setActiveLineId(resolved.line_id);
        setActiveProductLabel(resolved.product_name ?? resolved.sku ?? code);
        if (scanMode === "increment") {
          await recordScan(resolved.line_id, { delta: 1, barcode: code });
          scanFeedback.success(resolved.product_name ?? "+1");
        } else {
          setPendingQty(1);
          scanFeedback.success(resolved.product_name ?? "Produkt rozpoznany");
        }
      } catch {
        const matches = await searchWmsTaskProducts(tenantId, task.id, code).catch(() => []);
        if (matches.length === 1) {
          const m = matches[0];
          setActiveLineId(m.line_id);
          setActiveProductLabel(m.product_name ?? m.sku ?? code);
          scanFeedback.warning("Dopasowano — potwierdź ilość");
          return;
        }
        scanFeedback.error("Nie rozpoznano — wyszukiwanie awaryjne");
        setLastScanCode(code);
      }
    },
    [autoConfirm, recordScan, scanFeedback, scanMode, task, tenantId],
  );

  const confirmManualQty = useCallback(async () => {
    if (!activeLineId) return;
    try {
      await recordScan(activeLineId, { quantity: pendingQty });
      scanFeedback.success(`Zapisano: ${pendingQty}`);
      setActiveLineId(null);
      setActiveProductLabel(null);
      setPendingQty(1);
    } catch (e) {
      if ((e as Error).message !== "offline_queue") {
        scanFeedback.error("Nie udało się zapisać.");
      } else {
        scanFeedback.warning("Kolejka offline");
      }
    }
  }, [activeLineId, pendingQty, recordScan, scanFeedback]);

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
      if (step === "carrier") {
        setCarrierCode(code);
        beginCounting();
        scanFeedback.success(`Nośnik: ${code}`);
        return;
      }

      const asQty = Number(code.replace(",", "."));
      if (activeLineId && scanMode === "manual" && Number.isFinite(asQty) && asQty >= 0) {
        setPendingQty(asQty);
        await recordScan(activeLineId, { quantity: asQty });
        scanFeedback.success(`Ilość: ${asQty}`);
        setActiveLineId(null);
        setActiveProductLabel(null);
        return;
      }
      await handleProductScan(code);
    },
    [
      activeLineId,
      beginCounting,
      handleProductScan,
      recordScan,
      resolveLocationScan,
      scanFeedback,
      scanMode,
      step,
      task,
    ],
  );

  useWmsPageScanHandler(
    useCallback((value: string) => void handleScan(value), [handleScan]),
    !loading && !error,
  );

  const skipCarrier = useCallback(() => beginCounting(), [beginCounting]);

  const finishLocation = useCallback(() => {
    setTask(null);
    setSummary(null);
    setStep("location");
    setCarrierCode(null);
    setActiveLineId(null);
    setActiveProductLabel(null);
    navigate(wmsInventoryCountPaths.tasks, { replace: true });
    scanFeedback.success("Lokalizacja zakończona — skanuj następną");
  }, [navigate, scanFeedback]);

  const handleEmergencyPick = useCallback(
    async (pick: EmergencySearchPick) => {
      if (pick.kind === "task") {
        await loadTask(pick.taskId);
        setStep("carrier");
        return;
      }
      if (pick.kind === "location") {
        if (pick.taskId) {
          await loadTask(pick.taskId);
          setStep("carrier");
        } else {
          await resolveLocationScan(pick.locationCode);
        }
        return;
      }
      if (pick.kind === "product" && task) {
        const code = pick.ean ?? pick.sku ?? String(pick.productId);
        await handleProductScan(code);
      }
    },
    [handleProductScan, loadTask, resolveLocationScan, task],
  );

  return {
    loading,
    error,
    task,
    summary,
    sessionId,
    step,
    carrierCode,
    locationLabel,
    documentLabel,
    scanHint,
    activeLineId,
    activeProductLabel,
    pendingQty,
    scanMode,
    autoConfirm,
    unknownOpen,
    lastScanCode,
    online,
    progressPercent,
    progressLabel,
    setManualQty: setPendingQty,
    setScanMode,
    setAutoConfirm,
    setUnknownOpen,
    confirmManualQty,
    skipCarrier,
    finishLocation,
    loadTask,
    handleEmergencyPick,
    handleScan,
    reloadSummary,
  };
}
