import { useCallback } from "react";

import { useWarehouse } from "../../../context/WarehouseContext";
import { useOperationalRuntime } from "../../../hooks/runtime/useOperationalRuntime";
import { DirectSalesRuntimeFooter } from "./components/DirectSalesRuntimeFooter";
import { DirectSalesTopBar } from "./components/DirectSalesTopBar";
import { PaymentPanel } from "./components/PaymentPanel";
import { ScannerPanel } from "./components/ScannerPanel";
import { SessionLinesPanel } from "./components/SessionLinesPanel";
import { useDirectSalesSession } from "./hooks/useDirectSalesSession";
import { useLocationStock } from "./hooks/useLocationStock";

export default function DirectSalesPage() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const runtime = useOperationalRuntime();
  const { stockSnap, lastProductId, refreshStock, clearStock } = useLocationStock(warehouseId);

  const onScanSuccess = useCallback(
    (productId: number) => {
      void refreshStock(productId, stockSnap?.revision);
    },
    [refreshStock, stockSnap?.revision],
  );

  const {
    session,
    busy,
    error,
    total,
    paymentMethod,
    setPaymentMethod,
    checkout,
    complete,
    suspend,
  } = useDirectSalesSession({ warehouseId, onScanSuccess });

  const handleComplete = useCallback(async () => {
    const result = await complete();
    if (result) clearStock();
  }, [complete, clearStock]);

  if (warehouseId == null) {
    return <div className="p-4 text-slate-600">Wybierz magazyn, aby rozpocząć sprzedaż bezpośrednią.</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DirectSalesTopBar session={session} runtimeHealth={runtime.health} />
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-2 md:flex-row md:p-4">
        <ScannerPanel
          session={session}
          paymentMethod={paymentMethod}
          error={error}
          onPaymentMethodChange={setPaymentMethod}
        />
        <SessionLinesPanel session={session} stockSnap={stockSnap} lastProductId={lastProductId} />
        <PaymentPanel
          total={total}
          busy={busy}
          hasSession={session != null}
          hasLines={(session?.lines.length ?? 0) > 0}
          onCheckout={() => void checkout()}
          onComplete={() => void handleComplete()}
          onSuspend={() => void suspend()}
        />
      </div>
      <DirectSalesRuntimeFooter
        health={runtime.health}
        connected={runtime.connected}
        scannerReady={!busy}
      />
    </div>
  );
}
