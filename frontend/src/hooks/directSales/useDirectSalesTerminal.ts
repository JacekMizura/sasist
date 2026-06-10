import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { useWarehouse } from "../../context/WarehouseContext";
import { useOperationalStatus } from "../operational/useOperationalStatus";
import { useOperationalRuntime } from "../runtime/useOperationalRuntime";
import { resolveDirectSalesUnavailableReason } from "../../services/operational/operationalFeatureGuard";
import { useDirectSalesCustomer } from "./useDirectSalesCustomer";
import { useDirectSalesKeyboard } from "./useDirectSalesKeyboard";
import { useDirectSalesSession } from "./useDirectSalesSession";
import { useProductSearch } from "./useProductSearch";
import { useDirectSalesHistory } from "./useDirectSalesHistory";
import { useSuspendedSessions } from "./useSuspendedSessions";
import { useLocationStock } from "./useLocationStock";
import { useResolvedDirectSalesSettings } from "../../modules/directSales/settings/resolvedDirectSalesSettings";

export function useDirectSalesTerminal() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const resolvedDirectSalesSettings = useResolvedDirectSalesSettings();
  const runtime = useOperationalRuntime();
  const [issueFlash, setIssueFlash] = useState(false);
  const [suspendedKey, setSuspendedKey] = useState(0);
  const [historyKey, setHistoryKey] = useState(0);
  const { stockSnap, refreshStock, clearStock } = useLocationStock(warehouseId, runtime.subscribe);

  const status = useOperationalStatus({
    warehouseId,
    health: runtime.health,
    connected: runtime.connected,
    liveMode: runtime.liveMode,
  });

  const salesEnabled = runtime.featuresLoaded && runtime.directSalesEnabled;

  const onProductAdded = useCallback(
    (productId: number) => {
      void refreshStock(productId, stockSnap?.revision);
    },
    [refreshStock, stockSnap?.revision],
  );

  const sessionState = useDirectSalesSession({
    warehouseId,
    onProductAdded,
    enabled: salesEnabled,
    onSuspended: () => setSuspendedKey((k) => k + 1),
  });

  const suspended = useSuspendedSessions({
    warehouseId,
    enabled: salesEnabled,
    refreshKey: suspendedKey,
  });

  const history = useDirectSalesHistory({
    warehouseId,
    enabled: salesEnabled,
    refreshKey: historyKey,
  });

  const productSearch = useProductSearch({
    warehouseId,
    enabled: salesEnabled && !sessionState.unavailable,
    searchEnabled: runtime.directSalesSearchEnabled,
  });

  const customer = useDirectSalesCustomer({
    warehouseId,
    sessionId: sessionState.session?.id ?? null,
    customerId: sessionState.session?.customer_id ?? null,
    customerIsRetail: sessionState.session?.customer_is_retail ?? false,
    onSessionUpdated: sessionState.applySession,
  });

  const location = useLocation();
  const prefillDoneRef = useRef(false);

  const attachCustomer = customer.attachCustomer;
  const changeDocumentSubtype = sessionState.changeDocumentSubtype;

  useEffect(() => {
    const state = location.state as { prefillCustomerId?: number; prefillDocumentSubtype?: "INVOICE" | "RECEIPT" } | null;
    const cid = state?.prefillCustomerId;
    if (prefillDoneRef.current || cid == null || !Number.isFinite(cid) || warehouseId == null) return;
    if (!sessionState.session?.id || sessionState.busy) return;

    prefillDoneRef.current = true;
    void (async () => {
      await attachCustomer(Math.trunc(cid));
      if (state?.prefillDocumentSubtype === "INVOICE") {
        await changeDocumentSubtype("INVOICE");
      }
    })();
  }, [
    location.state,
    warehouseId,
    sessionState.session?.id,
    sessionState.busy,
    attachCustomer,
    changeDocumentSubtype,
  ]);

  const unavailableReason = useMemo(
    () => resolveDirectSalesUnavailableReason(status.features, sessionState.unavailable),
    [status.features, sessionState.unavailable],
  );

  const handleComplete = useCallback(async () => {
    if (sessionState.busy) return;
    const result = await sessionState.complete();
    if (result) {
      clearStock();
      setIssueFlash(true);
      window.setTimeout(() => setIssueFlash(false), 800);
      setSuspendedKey((k) => k + 1);
      setHistoryKey((k) => k + 1);
    }
  }, [sessionState, sessionState.busy, clearStock]);

  const handleNewSession = useCallback(() => {
    sessionState.dismissCompletion();
    clearStock();
    productSearch.clear();
    setHistoryKey((k) => k + 1);
  }, [sessionState, clearStock, productSearch]);

  const handleRefresh = useCallback(() => {
    sessionState.resetAvailability();
    void runtime.refreshFeatures();
    void status.refreshDebug();
  }, [runtime, sessionState, status]);

  const handleRestoreSuspended = useCallback(
    async (id: number) => {
      const ok = await sessionState.restoreSession(id);
      if (ok) setSuspendedKey((k) => k + 1);
    },
    [sessionState],
  );

  useDirectSalesKeyboard({
    enabled:
      salesEnabled &&
      !sessionState.unavailable &&
      !sessionState.busy &&
      resolvedDirectSalesSettings.keyboard_shortcuts,
    onCash: () => sessionState.setPaymentMethod("CASH"),
    onCard: () => sessionState.setPaymentMethod("CARD"),
    onBlik: () => sessionState.setPaymentMethod("BLIK"),
    onComplete: () => void handleComplete(),
  });

  return {
    warehouse,
    warehouseId,
    resolvedDirectSalesSettings,
    runtime,
    status,
    salesEnabled,
    unavailableReason,
    sessionState,
    productSearch,
    customer,
    suspended,
    history,
    issueFlash,
    handleComplete,
    handleNewSession,
    handleRefresh,
    handleRestoreSuspended,
  };
}

export type DirectSalesTerminalState = ReturnType<typeof useDirectSalesTerminal>;
