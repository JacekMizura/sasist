import { useCallback, useMemo, useState } from "react";

import { useWarehouse } from "../../context/WarehouseContext";
import { useOperationalStatus } from "../operational/useOperationalStatus";
import { useOperationalRuntime } from "../runtime/useOperationalRuntime";
import { resolveDirectSalesUnavailableReason } from "../../services/operational/operationalFeatureGuard";
import { useDirectSalesCustomer } from "./useDirectSalesCustomer";
import { useDirectSalesKeyboard } from "./useDirectSalesKeyboard";
import { useDirectSalesSession } from "./useDirectSalesSession";
import { useProductSearch } from "./useProductSearch";
import { useSuspendedSessions } from "./useSuspendedSessions";
import { useLocationStock } from "../../pages/wms/direct-sales/hooks/useLocationStock";

export function useDirectSalesTerminal() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const runtime = useOperationalRuntime();
  const [issueFlash, setIssueFlash] = useState(false);
  const [suspendedKey, setSuspendedKey] = useState(0);
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

  const productSearch = useProductSearch({
    warehouseId,
    enabled: salesEnabled && !sessionState.unavailable,
    searchEnabled: runtime.directSalesSearchEnabled,
  });

  const customer = useDirectSalesCustomer({
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
    }
  }, [sessionState, clearStock]);

  const handleNewSession = useCallback(() => {
    void sessionState.startNewSession();
    sessionState.clearLastComplete();
    clearStock();
    productSearch.clear();
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
    enabled: salesEnabled && !sessionState.unavailable,
    onCash: () => sessionState.setPaymentMethod("CASH"),
    onCard: () => sessionState.setPaymentMethod("CARD"),
    onBlik: () => sessionState.setPaymentMethod("BLIK"),
    onComplete: () => void handleComplete(),
  });

  return {
    warehouse,
    warehouseId,
    runtime,
    status,
    salesEnabled,
    unavailableReason,
    sessionState,
    productSearch,
    customer,
    suspended,
    issueFlash,
    handleComplete,
    handleNewSession,
    handleRefresh,
    handleRestoreSuspended,
  };
}
