import { useCallback, useState } from "react";

import { DirectSalesUnavailable } from "../../../components/operational/fallbacks/DirectSalesUnavailable";
import { useWarehouse } from "../../../context/WarehouseContext";
import { useOperationalRuntime } from "../../../hooks/runtime/useOperationalRuntime";
import { CheckoutPanel } from "./components/CheckoutPanel";
import { DirectSalesRuntimeFooter } from "./components/DirectSalesRuntimeFooter";
import { DirectSalesTopBar } from "./components/DirectSalesTopBar";
import { ProductSearchPanel } from "./components/ProductSearchPanel";
import { SessionLinesPanel } from "./components/SessionLinesPanel";
import { useDirectSalesCustomer } from "./hooks/useDirectSalesCustomer";
import { useDirectSalesSession } from "./hooks/useDirectSalesSession";
import { useLocationStock } from "./hooks/useLocationStock";
import { useProductSearch } from "./hooks/useProductSearch";

export default function DirectSalesPage() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const runtime = useOperationalRuntime();
  const [issueFlash, setIssueFlash] = useState(false);
  const { stockSnap, refreshStock, clearStock } = useLocationStock(warehouseId, runtime.subscribe);

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

  const handleComplete = useCallback(async () => {
    const result = await sessionState.complete();
    if (result) {
      clearStock();
      setIssueFlash(true);
      window.setTimeout(() => setIssueFlash(false), 800);
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
  }, [runtime, sessionState]);

  if (warehouseId == null) {
    return <div className="p-4 text-slate-600">Wybierz magazyn, aby rozpocząć sprzedaż bezpośrednią.</div>;
  }

  if (runtime.featuresLoaded && (!salesEnabled || sessionState.unavailable)) {
    return <DirectSalesUnavailable onRefresh={handleRefresh} />;
  }

  if (!runtime.featuresLoaded) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-slate-500">
        Sprawdzanie dostępności modułu…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DirectSalesTopBar session={sessionState.session} runtimeHealth={runtime.health} />
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-2 md:flex-row md:p-4">
        <ProductSearchPanel
          session={sessionState.session}
          search={productSearch}
          busy={sessionState.busy}
          error={sessionState.error}
          onAddProduct={(id, loc) => void sessionState.addByProductId(id, loc)}
          onScanCode={(code) => void sessionState.addByCode(code)}
        />
        <SessionLinesPanel
          session={sessionState.session}
          warehouseId={warehouseId}
          busy={sessionState.busy}
          highlight={issueFlash}
          onQtyChange={(id, qty) => void sessionState.changeLineQty(id, qty)}
          onLocationChange={(id, loc) => void sessionState.changeLineLocation(id, loc)}
          onRemove={(id) => void sessionState.removeLine(id)}
        />
        <CheckoutPanel
          total={sessionState.total}
          busy={sessionState.busy}
          session={sessionState.session}
          customer={customer}
          paymentMethod={sessionState.paymentMethod}
          documentSubtype={sessionState.documentSubtype}
          lastComplete={sessionState.lastComplete}
          onPaymentMethodChange={sessionState.setPaymentMethod}
          onDocumentSubtypeChange={sessionState.setDocumentSubtype}
          onCheckout={() => void sessionState.checkout()}
          onComplete={() => void handleComplete()}
          onSuspend={() => void sessionState.suspend()}
          onNewSession={handleNewSession}
        />
      </div>
      <DirectSalesRuntimeFooter
        health={runtime.health}
        connected={runtime.connected}
        scannerReady={!sessionState.busy}
      />
    </div>
  );
}
