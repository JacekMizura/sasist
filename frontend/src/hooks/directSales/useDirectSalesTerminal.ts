import { useCallback, useMemo, useState } from "react";

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
import { useDirectSalesResolvedSettings } from "./useDirectSalesResolvedSettings";

export function useDirectSalesTerminal() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const settingsState = useDirectSalesResolvedSettings(warehouseId);
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
    settings: settingsState.config,
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
    onSessionUpdate: sessionState.onCustomerAttached,
  });

  const unavailableReason = useMemo(
    () => resolveDirectSalesUnavailableReason(status.features, sessionState.unavailable),
    [status.features, sessionState.unavailable],
  );

  const handleComplete = useCallback(async () => {
    const result = await sessionState.complete();
    if (result) {
      clearStock();
      setIssueFlash(true);
      window.setTimeout(() => setIssueFlash(false), 800);
      setSuspendedKey((k) => k + 1);
      setHistoryKey((k) => k + 1);
    }
  }, [sessionState, clearStock]);

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
    enabled: salesEnabled && !sessionState.unavailable && settingsState.config.keyboard_shortcuts,
    onCash: () => sessionState.setPaymentMethod("CASH"),
    onCard: () => sessionState.setPaymentMethod("CARD"),
    onBlik: () => sessionState.setPaymentMethod("BLIK"),
    onComplete: () => void handleComplete(),
  });

  return {
    warehouse,
    warehouseId,
    settings: settingsState.config,
    settingsLoading: settingsState.loading,
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
