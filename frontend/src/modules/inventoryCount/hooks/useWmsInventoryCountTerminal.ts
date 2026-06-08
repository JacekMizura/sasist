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
  WmsBarcodeResolveError,
  type InventoryExecutionSummary,
  type InventoryTaskRead,
  type WmsBarcodeResolveResult,
  type WmsRecentScanEntry,
} from "../../../api/inventoryCountApi";
import { useScanFeedback } from "../../../components/wms/execution/useScanFeedback";
import { useWmsPageScanHandler } from "../../../components/wms/execution/useWmsPageScanHandler";
import type { EmergencySearchPick } from "../components/WmsInventoryEmergencySearch";
import { wmsInventoryCountPaths } from "../inventoryCountPaths";
import { cacheTaskSnapshot, inventoryCountSyncQueue } from "../offline/inventoryCountSyncQueue";
import { useInventoryCountOfflineStatus } from "../offline/useInventoryCountOfflineStatus";

export type WmsTerminalStep = "location" | "product";

const SCAN_DEBOUNCE_MS = 120;
const RECENT_SCAN_LIMIT = 5;

function feedbackForDiscrepancy(
  scanFeedback: ReturnType<typeof useScanFeedback>,
  disc: WmsBarcodeResolveResult["discrepancy_class"],
  name?: string | null,
) {
  if (disc === "EXPECTED") {
    scanFeedback.success(name ?? "OK");
    return;
  }
  if (disc === "WRONG_LOCATION") {
    scanFeedback.warning(name ?? "Produkt z innej lokalizacji — zapisano");
    return;
  }
  if (disc === "UNPLANNED_PRODUCT") {
    scanFeedback.warning("Produkt spoza planowanej inwentaryzacji");
    return;
  }
  if (disc === "EXTRA_PRODUCT") {
    scanFeedback.warning(name ?? "Nadwyżka — zapisano");
    return;
  }
  scanFeedback.success(name ?? "Zapisano");
}

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
  const [carrierScanMode, setCarrierScanMode] = useState(false);
  const [scanMode, setScanMode] = useState<"increment" | "manual">("increment");
  const [autoConfirm, setAutoConfirm] = useState(true);
  const [pendingQty, setPendingQty] = useState(1);
  const [activeLineId, setActiveLineId] = useState<number | null>(null);
  const [activeScan, setActiveScan] = useState<WmsBarcodeResolveResult | null>(null);
  const [recentScans, setRecentScans] = useState<WmsRecentScanEntry[]>([]);
  const [cardPulse, setCardPulse] = useState<"success" | "warning" | "error" | null>(null);
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
        setCarrierScanMode(false);
        setActiveLineId(null);
        setActiveScan(null);
        setRecentScans([]);
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
    if (carrierScanMode) return carrierCode ? `Nośnik: ${carrierCode}` : "Zeskanuj nośnik (opcjonalnie)";
    if (activeLineId && scanMode === "manual" && !autoConfirm) return "Potwierdź ilość";
    return "Zeskanuj produkt — każdy kod z katalogu jest akceptowany";
  }, [activeLineId, autoConfirm, carrierCode, carrierScanMode, locationLabel, scanMode, step, task]);

  const pushRecentScan = useCallback((scan: WmsBarcodeResolveResult, delta?: number) => {
    const entry: WmsRecentScanEntry = {
      ...scan,
      scanned_at: new Date().toISOString(),
      scan_delta: delta,
    };
    setRecentScans((prev) => [entry, ...prev].slice(0, RECENT_SCAN_LIMIT));
  }, []);

  const flashCard = useCallback((kind: "success" | "warning" | "error") => {
    setCardPulse(kind);
    window.setTimeout(() => setCardPulse(null), 600);
  }, []);

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
        setStep("product");
        scanFeedback.success("Lokalizacja OK — skanuj produkty");
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
        setStep("product");
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
        setActiveScan(resolved);
        setActiveLineId(resolved.line_id);

        const pulseKind =
          resolved.discrepancy_class === "EXPECTED"
            ? "success"
            : resolved.discrepancy_class === "UNKNOWN_PRODUCT"
              ? "error"
              : "warning";
        flashCard(pulseKind);

        if (scanMode === "increment" && autoConfirm) {
          await recordScan(resolved.line_id, { delta: 1, barcode: code });
          const nextCounted = (resolved.counted_quantity ?? 0) + 1;
          const nextDiff = nextCounted - (resolved.expected_quantity ?? 0);
          const updated = {
            ...resolved,
            counted_quantity: nextCounted,
            difference_quantity: nextDiff,
          };
          setActiveScan(updated);
          pushRecentScan(updated, 1);
          feedbackForDiscrepancy(scanFeedback, resolved.discrepancy_class, resolved.product_name);
          setActiveLineId(null);
          return;
        }

        if (scanMode === "increment") {
          await recordScan(resolved.line_id, { delta: 1, barcode: code });
          const nextCounted = (resolved.counted_quantity ?? 0) + 1;
          const updated = {
            ...resolved,
            counted_quantity: nextCounted,
            difference_quantity: nextCounted - (resolved.expected_quantity ?? 0),
          };
          setActiveScan(updated);
          pushRecentScan(updated, 1);
          feedbackForDiscrepancy(scanFeedback, resolved.discrepancy_class, resolved.product_name);
        } else {
          setPendingQty(1);
          feedbackForDiscrepancy(scanFeedback, resolved.discrepancy_class, resolved.product_name);
        }
      } catch (err) {
        if (err instanceof WmsBarcodeResolveError) {
          flashCard("error");
          if (err.code === "task_not_found") {
            scanFeedback.error("Zadanie nie istnieje");
          } else if (err.code === "barcode_ambiguous") {
            scanFeedback.warning("Kod pasuje do wielu produktów — wyszukiwanie awaryjne");
          } else if (err.code === "barcode_not_found") {
            scanFeedback.error("Nieznany produkt");
            setUnknownOpen(true);
          } else {
            scanFeedback.error("Nie znaleziono produktu dla kodu");
          }
          setLastScanCode(code);
          return;
        }
        scanFeedback.error("Błąd skanowania — spróbuj ponownie");
        setLastScanCode(code);
      }
    },
    [autoConfirm, flashCard, pushRecentScan, recordScan, scanFeedback, scanMode, task, tenantId],
  );

  const confirmManualQty = useCallback(async () => {
    if (!activeLineId || !activeScan) return;
    try {
      await recordScan(activeLineId, { quantity: pendingQty });
      const updated = {
        ...activeScan,
        counted_quantity: pendingQty,
        difference_quantity: pendingQty - (activeScan.expected_quantity ?? 0),
      };
      setActiveScan(updated);
      pushRecentScan(updated);
      flashCard("success");
      scanFeedback.success(`Zapisano: ${pendingQty}`);
      setActiveLineId(null);
      setPendingQty(1);
    } catch (e) {
      if ((e as Error).message !== "offline_queue") {
        scanFeedback.error("Nie udało się zapisać.");
      } else {
        scanFeedback.warning("Kolejka offline");
      }
    }
  }, [activeLineId, activeScan, flashCard, pendingQty, pushRecentScan, recordScan, scanFeedback]);

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
        scanFeedback.success(`Nośnik: ${code}`);
        return;
      }

      const asQty = Number(code.replace(",", "."));
      if (activeLineId && scanMode === "manual" && Number.isFinite(asQty) && asQty >= 0) {
        setPendingQty(asQty);
        await recordScan(activeLineId, { quantity: asQty });
        if (activeScan) {
          const updated = {
            ...activeScan,
            counted_quantity: asQty,
            difference_quantity: asQty - (activeScan.expected_quantity ?? 0),
          };
          setActiveScan(updated);
          pushRecentScan(updated);
        }
        flashCard("success");
        scanFeedback.success(`Ilość: ${asQty}`);
        setActiveLineId(null);
        return;
      }
      await handleProductScan(code);
    },
    [
      activeLineId,
      activeScan,
      carrierScanMode,
      flashCard,
      handleProductScan,
      pushRecentScan,
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

  const enterCarrierScan = useCallback(() => {
    setCarrierScanMode(true);
    scanFeedback.success("Tryb nośnika — zeskanuj lub anuluj");
  }, [scanFeedback]);

  const cancelCarrierScan = useCallback(() => {
    setCarrierScanMode(false);
  }, []);

  const finishLocation = useCallback(() => {
    setTask(null);
    setSummary(null);
    setStep("location");
    setCarrierCode(null);
    setCarrierScanMode(false);
    setActiveLineId(null);
    setActiveScan(null);
    setRecentScans([]);
    navigate(wmsInventoryCountPaths.tasks, { replace: true });
    scanFeedback.success("Lokalizacja zakończona — skanuj następną");
  }, [navigate, scanFeedback]);

  const handleEmergencyPick = useCallback(
    async (pick: EmergencySearchPick) => {
      if (pick.kind === "task") {
        await loadTask(pick.taskId);
        setStep("product");
        return;
      }
      if (pick.kind === "location") {
        if (pick.taskId) {
          await loadTask(pick.taskId);
          setStep("product");
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
    carrierScanMode,
    locationLabel,
    documentLabel,
    scanHint,
    activeLineId,
    activeScan,
    recentScans,
    cardPulse,
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
    enterCarrierScan,
    cancelCarrierScan,
    finishLocation,
    loadTask,
    handleEmergencyPick,
    handleScan,
    reloadSummary,
  };
}
