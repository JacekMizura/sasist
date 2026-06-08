import { useEffect, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { Package, ScanLine } from "lucide-react";

import WmsInventoryProductPreview from "../../../modules/inventoryCount/components/WmsInventoryProductPreview";
import WmsInventoryUnknownProductModal from "../../../modules/inventoryCount/components/WmsInventoryUnknownProductModal";
import { useWmsInventoryCountTerminal } from "../../../modules/inventoryCount/hooks/useWmsInventoryCountTerminal";
import { WMS_INV } from "../../../modules/inventoryCount/wmsIndustrialTheme";
import { useWarehouse } from "../../../context/WarehouseContext";

const TENANT_ID = 1;

export default function WmsInventoryCountTerminalPage() {
  const { taskId: taskIdParam } = useParams();
  const taskId = taskIdParam ? Number(taskIdParam) : undefined;
  const { warehouse } = useWarehouse();
  const tenantId = TENANT_ID;
  const warehouseId = warehouse?.id;
  const scanInputRef = useRef<HTMLInputElement>(null);

  const {
    loading,
    error,
    task,
    sessionId,
    step,
    locationLabel,
    activeScan,
    qtyPulse,
    manualOpen,
    pendingQty,
    carrierScanMode,
    unknownOpen,
    lastScanCode,
    setManualOpen,
    setManualQty,
    setUnknownOpen,
    confirmManualQty,
    enterCarrierScan,
    cancelCarrierScan,
    finishLocation,
    handleScan,
  } = useWmsInventoryCountTerminal(taskId, tenantId, warehouseId);

  useEffect(() => {
    scanInputRef.current?.focus();
  }, [step, task, carrierScanMode, manualOpen]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = scanInputRef.current?.value ?? "";
    if (v.trim()) {
      void handleScan(v);
      if (scanInputRef.current) scanInputRef.current.value = "";
    }
  };

  if (!warehouseId) {
    return <p className={`py-8 text-center ${WMS_INV.textMuted}`}>Wybierz magazyn.</p>;
  }

  if (loading && !task) {
    return <p className={`py-16 text-center ${WMS_INV.textMuted}`}>…</p>;
  }

  if (error && taskId) {
    return (
      <div className="text-center">
        <p className="text-lg font-bold text-[#b42318]">{error}</p>
        <Link to="/wms/inventory-count/tasks" className={`mt-4 inline-block text-sm ${WMS_INV.textMuted}`}>
          Wróć
        </Link>
      </div>
    );
  }

  const counting = task && step === "product";
  const placeholder = !task || step === "location" ? "Lokalizacja" : carrierScanMode ? "Nośnik" : "Kod / EAN / SKU / nazwa";

  return (
    <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-lg flex-col">
      <div className="shrink-0 pt-2 text-center">
        {task ? (
          <p className="text-4xl font-black tracking-tight text-[#1a2b3c]">{locationLabel}</p>
        ) : (
          <p className="text-2xl font-bold text-[#5a6b7d]">Inwentaryzacja</p>
        )}
      </div>

      <form onSubmit={onSubmit} className="relative mx-auto mt-8 w-full max-w-md shrink-0">
        <div className="relative">
          <ScanLine
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8a9bb0]"
            strokeWidth={2}
          />
          <input
            ref={scanInputRef}
            type="text"
            autoComplete="off"
            inputMode="search"
            placeholder={placeholder}
            className={`${WMS_INV.input} pl-12`}
            aria-label={placeholder}
          />
        </div>
        {counting ? (
          <button
            type="button"
            onClick={carrierScanMode ? cancelCarrierScan : enterCarrierScan}
            className={`${WMS_INV.btnIcon} absolute -right-2 top-1/2 -translate-y-1/2`}
            aria-label="Nośnik"
            title="Nośnik"
          >
            <Package className="h-5 w-5" strokeWidth={2} />
          </button>
        ) : null}
      </form>

      <div className="flex flex-1 flex-col justify-center">
        <WmsInventoryProductPreview scan={counting ? activeScan : null} pulse={qtyPulse} />
      </div>

      {manualOpen && activeScan ? (
        <div className="mx-auto mb-4 w-full max-w-md shrink-0 space-y-3">
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 5, 10, 25, 50, 100].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setManualQty(n)}
                className="min-h-[48px] rounded-lg border border-[#d0d7e2] bg-white text-lg font-bold tabular-nums active:bg-[#f0f2f5]"
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-center text-4xl font-black tabular-nums text-[#1e4d8c]">{pendingQty}</p>
          <button type="button" className={`${WMS_INV.btnPrimary} w-full`} onClick={() => void confirmManualQty()}>
            Zapisz {pendingQty}
          </button>
        </div>
      ) : null}

      {counting ? (
        <div className="sticky bottom-0 mx-auto flex w-full max-w-md shrink-0 gap-3 pb-4 pt-2">
          <button
            type="button"
            className={manualOpen ? `${WMS_INV.btnPrimary}` : WMS_INV.btnSecondary}
            onClick={() => setManualOpen((v) => !v)}
          >
            Ręczna ilość
          </button>
          <button type="button" className={WMS_INV.btnPrimary} onClick={finishLocation}>
            Zakończ lokalizację
          </button>
        </div>
      ) : null}

      {task ? (
        <WmsInventoryUnknownProductModal
          open={unknownOpen}
          onClose={() => setUnknownOpen(false)}
          tenantId={tenantId}
          warehouseId={warehouseId}
          documentId={task.inventory_document_id}
          taskId={task.id}
          locationId={task.location_id}
          locationCode={locationLabel}
          sessionId={sessionId}
          initialBarcode={lastScanCode ?? undefined}
          onCreated={() => setUnknownOpen(false)}
        />
      ) : null}
    </div>
  );
}
