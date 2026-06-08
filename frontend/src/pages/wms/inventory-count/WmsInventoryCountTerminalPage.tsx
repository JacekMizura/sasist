import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Search, ScanLine } from "lucide-react";

import WmsInventoryLastScans from "../../../modules/inventoryCount/components/WmsInventoryLastScans";
import WmsInventoryOperationalSearchModal from "../../../modules/inventoryCount/components/WmsInventoryOperationalSearchModal";
import WmsInventoryProductPreview from "../../../modules/inventoryCount/components/WmsInventoryProductPreview";
import WmsInventoryUnknownProductModal from "../../../modules/inventoryCount/components/WmsInventoryUnknownProductModal";
import { useWmsInventoryCountTerminal } from "../../../modules/inventoryCount/hooks/useWmsInventoryCountTerminal";
import { WMS_INV } from "../../../modules/inventoryCount/wmsIndustrialTheme";
import { useWarehouse } from "../../../context/WarehouseContext";

const TENANT_ID = 1;

export default function WmsInventoryCountTerminalPage() {
  const { taskId: taskIdParam } = useParams();
  const taskId = taskIdParam ? Number(taskIdParam) : NaN;
  const { warehouse } = useWarehouse();
  const tenantId = TENANT_ID;
  const warehouseId = warehouse?.id;
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const {
    loading,
    error,
    task,
    sessionId,
    step,
    locationLabel,
    locationMeta,
    activeScan,
    lastScans,
    qtyPulse,
    invalidPulse,
    manualOpen,
    pendingQty,
    carrierCode,
    carrierScanMode,
    unknownOpen,
    lastScanCode,
    setManualOpen,
    setManualQty,
    setUnknownOpen,
    confirmManualQty,
    quickAddDelta,
    undoLastScan,
    enterCarrierScan,
    skipCarrier,
    finishLocation,
    handleScan,
    handleSearchProduct,
    handleSearchLocation,
    handleSearchCarrier,
  } = useWmsInventoryCountTerminal(Number.isFinite(taskId) ? taskId : undefined, tenantId, warehouseId);

  useEffect(() => {
    scanInputRef.current?.focus();
  }, [step, task, carrierScanMode, manualOpen, searchOpen]);

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
    return <p className={`py-12 text-center ${WMS_INV.textMuted}`}>…</p>;
  }

  if (!Number.isFinite(taskId)) {
    return (
      <div className="text-center">
        <p className="text-lg font-bold text-[#b42318]">Brak zadania w adresie URL.</p>
        <Link to="/wms/inventory-count/tasks" className={`mt-4 inline-block text-sm ${WMS_INV.textMuted}`}>
          Wróć do kolejki
        </Link>
      </div>
    );
  }

  if (error) {
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
  const placeholder =
    !task || step === "location" ? "Lokalizacja" : carrierScanMode ? "Nośnik" : "Kod / EAN / SKU / nazwa";

  return (
    <div className="relative mx-auto flex h-[calc(100dvh-2rem)] max-w-lg flex-col px-3">
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="absolute right-3 top-0 z-10 inline-flex items-center gap-1 rounded-md border border-[#d0d7e2] bg-white px-2.5 py-1.5 text-xs font-bold text-[#1a2b3c] shadow-sm active:bg-[#f0f2f5]"
      >
        <Search className="h-3.5 w-3.5" />
        Szukaj
      </button>

      <header className="shrink-0 pt-1 text-center">
        {task ? (
          <>
            <p className="text-3xl font-black tracking-tight text-[#1a2b3c]">{locationLabel}</p>
            {locationMeta ? <p className="mt-0.5 text-xs font-semibold text-[#8a9bb0]">{locationMeta}</p> : null}
          </>
        ) : (
          <p className="text-xl font-bold text-[#5a6b7d]">Inwentaryzacja</p>
        )}
      </header>

      <form onSubmit={onSubmit} className="mx-auto mt-4 w-full shrink-0">
        <div className="relative">
          <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a9bb0]" />
          <input
            ref={scanInputRef}
            type="text"
            autoComplete="off"
            inputMode="search"
            placeholder={placeholder}
            className={`${WMS_INV.inputTerminal} pl-10`}
            aria-label={placeholder}
          />
        </div>
        {counting ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={enterCarrierScan} className={WMS_INV.btnCompact}>
              Przypisz nośnik
            </button>
            {carrierScanMode ? (
              <button type="button" onClick={skipCarrier} className="text-xs font-semibold text-[#5a6b7d] underline">
                Pomiń
              </button>
            ) : null}
            {carrierCode ? (
              <span className="rounded bg-[#eef3fa] px-2 py-0.5 text-[10px] font-bold uppercase text-[#1e4d8c]">
                Nośnik: {carrierCode}
              </span>
            ) : null}
          </div>
        ) : null}
      </form>

      <div className="mt-3 shrink-0">
        <WmsInventoryProductPreview
          scan={counting ? activeScan : null}
          pulse={qtyPulse}
          invalid={invalidPulse}
        />
      </div>

      {counting ? (
        <div className="mt-2 grid shrink-0 grid-cols-4 gap-1.5">
          <button type="button" className={WMS_INV.btnQuick} onClick={() => void quickAddDelta(1)}>
            +1
          </button>
          <button type="button" className={WMS_INV.btnQuick} onClick={() => void quickAddDelta(5)}>
            +5
          </button>
          <button
            type="button"
            className={`${WMS_INV.btnQuick} ${manualOpen ? "border-[#1e4d8c] text-[#1e4d8c]" : ""}`}
            onClick={() => setManualOpen((v) => !v)}
          >
            Ilość ręczna
          </button>
          <button type="button" className={WMS_INV.btnQuick} onClick={() => void undoLastScan()}>
            Cofnij
          </button>
        </div>
      ) : null}

      {manualOpen && activeScan ? (
        <div className="mt-2 shrink-0 space-y-2">
          <div className="grid grid-cols-4 gap-1.5">
            {[1, 2, 5, 10, 25, 50, 100].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setManualQty(n)}
                className="min-h-[40px] rounded-md border border-[#d0d7e2] bg-white text-sm font-bold tabular-nums active:bg-[#f0f2f5]"
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-center text-2xl font-black tabular-nums text-[#1e4d8c]">{pendingQty}</p>
          <button type="button" className={`${WMS_INV.btnPrimary} w-full`} onClick={() => void confirmManualQty()}>
            Zapisz {pendingQty}
          </button>
        </div>
      ) : null}

      <div className="mt-3 min-h-0 flex-1 overflow-hidden">
        {counting ? <WmsInventoryLastScans items={lastScans} /> : null}
      </div>

      {counting ? (
        <footer className="sticky bottom-0 shrink-0 border-t border-[#e8edf3] bg-white pb-2 pt-2">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              className={WMS_INV.btnFooter}
              onClick={() => {
                setManualOpen(true);
              }}
            >
              Ilość ręczna
            </button>
            <button type="button" className={WMS_INV.btnFooter} onClick={() => setUnknownOpen(true)}>
              Nieznany produkt
            </button>
            <button type="button" className={`${WMS_INV.btnFooter} bg-[#1e4d8c] text-white`} onClick={finishLocation}>
              Zakończ lokalizację
            </button>
          </div>
        </footer>
      ) : null}

      <WmsInventoryOperationalSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        tenantId={tenantId}
        warehouseId={warehouseId!}
        documentId={task?.inventory_document_id}
        taskId={task?.id}
        onPickProduct={handleSearchProduct}
        onPickLocation={(code, tid) => void handleSearchLocation(code, tid)}
        onPickCarrier={handleSearchCarrier}
      />

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
