import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import {
  confirmWmsInventoryLocation,
  fetchWmsExecutionSummary,
  fetchWmsInventoryTask,
  openWmsInventorySession,
  recordInventoryScan,
  resolveWmsInventoryBarcode,
  searchWmsTaskProducts,
  WmsBarcodeResolveError,
  type InventoryExecutionSummary,
  type InventoryTaskRead,
} from "@/api/inventoryCountApi";
import { useScanFeedback } from "@/components/wms/execution/useScanFeedback";
import { useWmsPageScanHandler } from "@/components/wms/execution/useWmsPageScanHandler";
import { cacheTaskSnapshot, inventoryCountSyncQueue } from "../offline/inventoryCountSyncQueue";
import { useInventoryCountOfflineStatus } from "../offline/useInventoryCountOfflineStatus";

export type WmsCountStep = "location" | "counting";

const SCAN_DEBOUNCE_MS = 120;

export function useWmsInventoryCountExecution(taskId: number, tenantId: number, warehouseId: number | undefined) {
  const location = useLocation();
  const scanFeedback = useScanFeedback();
  const { online, refresh: refreshOffline } = useInventoryCountOfflineStatus();
  const navSessionId = (location.state as { sessionId?: number } | null)?.sessionId ?? null;
  const lastScanAt = useRef(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [task, setTask] = useState<InventoryTaskRead | null>(null);
  const [summary, setSummary] = useState<InventoryExecutionSummary | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(navSessionId);
  const [step, setStep] = useState<WmsCountStep>("location");
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [scanMode, setScanMode] = useState<"increment" | "manual">("increment");
  const [autoConfirm, setAutoConfirm] = useState(true);
  const [pendingQty, setPendingQty] = useState(1);
  const [activeLineId, setActiveLineId] = useState<number | null>(null);
  const [activeProductLabel, setActiveProductLabel] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [unknownOpen, setUnknownOpen] = useState(false);
  const [lastScanCode, setLastScanCode] = useState<string | null>(null);

  const reloadSummary = useCallback(async () => {
    if (!Number.isFinite(taskId)) return null;
    const s = await fetchWmsExecutionSummary(tenantId, taskId);
    setSummary(s);
    return s;
  }, [taskId, tenantId]);

  useEffect(() => {
    if (!warehouseId || !Number.isFinite(taskId)) {
      setLoading(false);
      setError("Brak magazynu lub zadania.");
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const t = await fetchWmsInventoryTask(tenantId, taskId);
        let sid = navSessionId;
        if (!sid) {
          const session = await openWmsInventorySession(tenantId, warehouseId, {
            document_id: t.inventory_document_id,
            task_id: t.id,
          });
          sid = session.id;
        }
        const s = await fetchWmsExecutionSummary(tenantId, taskId);
        if (cancelled) return;
        setTask(t);
        setSessionId(sid);
        setSummary(s);
        cacheTaskSnapshot({
          taskId: t.id,
          locationCode: t.location_code ?? t.location_name ?? `#${t.location_id}`,
          progressPercent: t.progress_percent,
          cachedAt: new Date().toISOString(),
        });
      } catch {
        if (!cancelled) setError("Nie udało się wczytać zadania liczenia.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [warehouseId, taskId, tenantId, navSessionId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const locationLabel = task?.location_code ?? task?.location_name ?? (task ? `#${task.location_id}` : "—");

  const scanHint = useMemo(() => {
    if (step === "location") return `Zeskanuj lokalizację: ${locationLabel}`;
    if (activeLineId && scanMode === "manual" && !autoConfirm) return "Potwierdź ilość lub zeskanuj następny";
    return "Zeskanuj produkt (EAN / SKU) — auto +1";
  }, [activeLineId, autoConfirm, locationLabel, scanMode, step]);

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

  const confirmLocation = useCallback(
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
          scanFeedback.error("Nieprawidłowa lokalizacja.");
          return false;
        }
      }
      setLocationConfirmed(true);
      setStep("counting");
      scanFeedback.success("Lokalizacja potwierdzona");
      return true;
    },
    [scanFeedback, task, tenantId],
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
      } catch (err) {
        if (err instanceof WmsBarcodeResolveError) {
          if (err.code === "task_not_found") {
            scanFeedback.error("Zadanie nie istnieje");
          } else if (err.code === "line_not_found_for_barcode") {
            scanFeedback.error("Produkt rozpoznany, brak w tej lokalizacji");
          } else if (err.code === "barcode_ambiguous") {
            scanFeedback.warning("Kod pasuje do wielu produktów — wyszukiwanie awaryjne");
          } else {
            scanFeedback.error("Nie znaleziono produktu dla kodu");
          }
          setLastScanCode(code);
          return;
        }
        const matches = await searchWmsTaskProducts(tenantId, task.id, code).catch(() => []);
        if (matches.length === 1) {
          const m = matches[0];
          setActiveLineId(m.line_id);
          setActiveProductLabel(m.product_name ?? m.sku ?? code);
          scanFeedback.warning("Dopasowano ręcznie — potwierdź ilość");
          return;
        }
        scanFeedback.error("Nie rozpoznano produktu — użyj wyszukiwania lub nieznanego SKU");
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
        scanFeedback.error("Nie udało się zapisać liczenia.");
      } else {
        scanFeedback.warning("Zapis w kolejce offline");
      }
    }
  }, [activeLineId, pendingQty, recordScan, scanFeedback]);

  const handleScan = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code || !task) return;
      const now = Date.now();
      if (now - lastScanAt.current < SCAN_DEBOUNCE_MS) return;
      lastScanAt.current = now;

      if (step === "location" || !locationConfirmed) {
        await confirmLocation(code);
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
      confirmLocation,
      handleProductScan,
      locationConfirmed,
      recordScan,
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

  const progressLabel = summary
    ? `${summary.counted_line_count}/${summary.line_count} pozycji · ${summary.progress_percent}%`
    : task
      ? `${task.progress_percent}%`
      : "";

  return {
    loading,
    error,
    task,
    summary,
    sessionId,
    step,
    locationConfirmed,
    locationLabel,
    scanHint,
    activeLineId,
    activeProductLabel,
    pendingQty,
    scanMode,
    autoConfirm,
    searchOpen,
    unknownOpen,
    lastScanCode,
    online,
    progressLabel,
    setManualQty: setPendingQty,
    setScanMode,
    setAutoConfirm,
    setSearchOpen,
    setUnknownOpen,
    confirmManualQty,
    reloadSummary,
    handleScan,
  };
}
