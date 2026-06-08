import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import {
  confirmWmsInventoryLocation,
  fetchWmsInventoryTask,
  fetchWmsTaskLines,
  openWmsInventorySession,
  recordInventoryScan,
  resolveWmsInventoryBarcode,
  type InventoryTaskRead,
} from "../../../api/inventoryCountApi";
import { useScanFeedback } from "../../../components/wms/execution/useScanFeedback";
import { useWmsPageScanHandler } from "../../../components/wms/execution/useWmsPageScanHandler";

export type WmsCountStep = "location" | "product" | "qty" | "confirm";

export type WmsTaskLine = {
  id: number;
  product_id: number;
  product_name: string | null;
  sku: string | null;
  ean: string | null;
  counted_quantity: number | null;
  status: string;
};

type ExecutionState = {
  loading: boolean;
  error: string | null;
  task: InventoryTaskRead | null;
  lines: WmsTaskLine[];
  sessionId: number | null;
  step: WmsCountStep;
  scanHint: string;
  activeLineId: number | null;
  activeProductLabel: string | null;
  pendingQty: number;
  scanMode: "increment" | "manual";
};

export function useWmsInventoryCountExecution(taskId: number, tenantId: number, warehouseId: number | undefined) {
  const location = useLocation();
  const scanFeedback = useScanFeedback();
  const navSessionId = (location.state as { sessionId?: number } | null)?.sessionId ?? null;

  const [state, setState] = useState<ExecutionState>({
    loading: true,
    error: null,
    task: null,
    lines: [],
    sessionId: navSessionId,
    step: "location",
    scanHint: "Zeskanuj lokalizację",
    activeLineId: null,
    activeProductLabel: null,
    pendingQty: 1,
    scanMode: "increment",
  });

  const reloadLines = useCallback(async () => {
    if (!Number.isFinite(taskId)) return [];
    const rows = await fetchWmsTaskLines(tenantId, taskId);
    setState((s) => ({ ...s, lines: rows as WmsTaskLine[] }));
    return rows as WmsTaskLine[];
  }, [taskId, tenantId]);

  useEffect(() => {
    if (!warehouseId || !Number.isFinite(taskId)) {
      setState((s) => ({ ...s, loading: false, error: "Brak magazynu lub zadania." }));
      return;
    }
    let cancelled = false;
    (async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const task = await fetchWmsInventoryTask(tenantId, taskId);
        let sessionId = navSessionId;
        if (!sessionId) {
          const session = await openWmsInventorySession(tenantId, warehouseId, {
            document_id: task.inventory_document_id,
            task_id: task.id,
          });
          sessionId = session.id;
        }
        const lines = (await fetchWmsTaskLines(tenantId, taskId)) as WmsTaskLine[];
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loading: false,
          task,
          lines,
          sessionId,
          scanHint: task.location_name ? `Zeskanuj: ${task.location_name}` : "Zeskanuj lokalizację",
        }));
      } catch {
        if (!cancelled) {
          setState((s) => ({ ...s, loading: false, error: "Nie udało się wczytać zadania liczenia." }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [warehouseId, taskId, tenantId, navSessionId]);

  const resetProductFlow = useCallback(() => {
    setState((s) => ({
      ...s,
      step: "product",
      scanHint: "Zeskanuj produkt (EAN / SKU)",
      activeLineId: null,
      activeProductLabel: null,
      pendingQty: 1,
    }));
  }, []);

  const confirmQuantity = useCallback(async () => {
    const { task, sessionId, activeLineId, pendingQty } = state;
    if (!task || !activeLineId) return;
    try {
      await recordInventoryScan(
        tenantId,
        task.inventory_document_id,
        { line_id: activeLineId, quantity: pendingQty },
        sessionId ?? undefined,
      );
      scanFeedback.success(`Zapisano: ${pendingQty} szt.`);
      await reloadLines();
      setState((s) => ({
        ...s,
        step: "product",
        scanHint: "Zeskanuj kolejny produkt",
        activeLineId: null,
        activeProductLabel: null,
        pendingQty: 1,
      }));
    } catch {
      scanFeedback.error("Nie udało się zapisać liczenia.");
    }
  }, [reloadLines, scanFeedback, state, tenantId]);

  const handleScan = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code || !state.task) return;

      if (state.step === "location") {
        const locLabel = state.task.location_name ?? state.task.location_code ?? "";
        const matches =
          code.toUpperCase() === locLabel.toUpperCase() ||
          code === String(state.task.location_id);
        if (!matches) {
          try {
            await confirmWmsInventoryLocation(tenantId, state.task.id, {
              location_id: state.task.location_id,
              scanned_code: code,
            });
          } catch {
            scanFeedback.error("Nieprawidłowa lokalizacja.");
            return;
          }
        }
        scanFeedback.success("Lokalizacja potwierdzona");
        resetProductFlow();
        return;
      }

      if (state.step === "product") {
        try {
          const resolved = await resolveWmsInventoryBarcode(tenantId, state.task.id, code);
          if (state.scanMode === "increment") {
            await recordInventoryScan(
              tenantId,
              state.task.inventory_document_id,
              { line_id: resolved.line_id, delta: 1, barcode_value: code },
              state.sessionId ?? undefined,
            );
            scanFeedback.success(resolved.product_name ?? "Dodano +1");
            await reloadLines();
            setState((s) => ({
              ...s,
              step: "product",
              scanHint: "Zeskanuj kolejny produkt",
              activeLineId: null,
              activeProductLabel: null,
            }));
            return;
          }
          setState((s) => ({
            ...s,
            step: "qty",
            activeLineId: resolved.line_id,
            activeProductLabel: resolved.product_name ?? resolved.sku ?? code,
            scanHint: resolved.product_name ?? "Wprowadź ilość",
            pendingQty: 1,
          }));
          scanFeedback.success(resolved.product_name ?? "Produkt rozpoznany");
        } catch {
          scanFeedback.error("Nie rozpoznano produktu w tej lokalizacji.");
        }
        return;
      }

      if (state.step === "qty") {
        const qty = Number(code.replace(",", "."));
        if (!Number.isFinite(qty) || qty < 0) {
          scanFeedback.error("Nieprawidłowa ilość.");
          return;
        }
        setState((s) => ({ ...s, pendingQty: qty, step: "confirm" }));
        scanFeedback.success(`Ilość: ${qty}`);
      }
    },
    [resetProductFlow, scanFeedback, state, tenantId],
  );

  useWmsPageScanHandler(
    useCallback((value: string) => void handleScan(value), [handleScan]),
    !state.loading && !state.error,
  );

  const setManualQty = useCallback((qty: number) => {
    setState((s) => ({ ...s, pendingQty: qty, step: "confirm" }));
  }, []);

  const setScanMode = useCallback((mode: "increment" | "manual") => {
    setState((s) => ({ ...s, scanMode: mode }));
  }, []);

  const progressLabel = useMemo(() => {
    if (!state.task) return "";
    const done = state.lines.filter((l) => l.counted_quantity != null).length;
    return `${done}/${state.lines.length} pozycji`;
  }, [state.lines, state.task]);

  return {
    ...state,
    progressLabel,
    handleScan,
    confirmQuantity,
    setManualQty,
    setScanMode,
    reloadLines,
  };
}
