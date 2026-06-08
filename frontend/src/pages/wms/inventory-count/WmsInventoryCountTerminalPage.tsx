import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, HelpCircle, MapPin, Package, ScanLine, X } from "lucide-react";

import { fetchWmsInventoryTaskQueue, type InventoryTaskCompact } from "../../../api/inventoryCountApi";
import WmsInventoryEmergencySearch from "../../../modules/inventoryCount/components/WmsInventoryEmergencySearch";
import WmsInventoryMinimalQueue from "../../../modules/inventoryCount/components/WmsInventoryMinimalQueue";
import WmsInventoryRecentScans from "../../../modules/inventoryCount/components/WmsInventoryRecentScans";
import WmsInventoryScannedProductCard from "../../../modules/inventoryCount/components/WmsInventoryScannedProductCard";
import WmsInventorySessionSummary from "../../../modules/inventoryCount/components/WmsInventorySessionSummary";
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

  const [queueItems, setQueueItems] = useState<InventoryTaskCompact[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);

  const {
    loading,
    error,
    task,
    summary,
    sessionId,
    step,
    locationLabel,
    documentLabel,
    scanHint,
    activeScan,
    recentScans,
    cardPulse,
    carrierCode,
    carrierScanMode,
    pendingQty,
    scanMode,
    autoConfirm,
    unknownOpen,
    lastScanCode,
    online,
    progressPercent,
    progressLabel,
    setManualQty,
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
  } = useWmsInventoryCountTerminal(taskId, tenantId, warehouseId);

  const loadQueue = useCallback(async () => {
    if (!warehouseId || task) return;
    setQueueLoading(true);
    try {
      const page = await fetchWmsInventoryTaskQueue(tenantId, warehouseId, { limit: 12 });
      setQueueItems(page.items);
    } catch {
      setQueueItems([]);
    } finally {
      setQueueLoading(false);
    }
  }, [task, tenantId, warehouseId]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    scanInputRef.current?.focus();
  }, [step, task, carrierScanMode]);

  const onManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = scanInputRef.current?.value ?? "";
    if (v.trim()) {
      void handleScan(v);
      if (scanInputRef.current) scanInputRef.current.value = "";
    }
  };

  if (!warehouseId) {
    return <p className={`py-8 text-center ${WMS_INV.textMuted}`}>Wybierz magazyn w ustawieniach.</p>;
  }

  if (loading && !task) {
    return <p className={`py-16 text-center text-lg font-semibold ${WMS_INV.textMuted}`}>Wczytywanie…</p>;
  }

  if (error && taskId) {
    return (
      <div className="text-center">
        <p className="text-lg font-bold text-[#b42318]">{error}</p>
        <Link to="/wms/inventory-count/tasks" className={`mt-4 inline-block text-sm font-semibold ${WMS_INV.textMuted}`}>
          ← Wróć do liczenia
        </Link>
      </div>
    );
  }

  const showQueue = !task && step === "location";
  const counting = task && step === "product";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-3">
      <header className={`rounded-lg border ${WMS_INV.border} ${WMS_INV.surface} px-4 py-3 shadow-sm`}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold uppercase tracking-wide text-[#5a6b7d]">
          <span>{documentLabel}</span>
          <span className="tabular-nums text-[#1e4d8c]">{progressLabel}</span>
          {!online ? <span className="text-[#b45309]">Offline</span> : null}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <MapPin className="h-5 w-5 shrink-0 text-[#1e4d8c]" />
          <span className="text-2xl font-black tracking-tight text-[#1a2b3c]">{task ? locationLabel : "—"}</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e8edf3]">
          <div
            className="h-full rounded-full bg-[#1e4d8c] transition-all"
            style={{ width: `${Math.min(100, progressPercent)}%` }}
          />
        </div>
      </header>

      {counting ? (
        <WmsInventoryScannedProductCard scan={activeScan} carrierCode={carrierCode} pulse={cardPulse} />
      ) : null}

      <section className={`rounded-xl ${WMS_INV.scanZone} p-4`}>
        <p className="text-center text-xs font-black uppercase tracking-widest text-[#1e4d8c]">
          {step === "location" ? "Krok 1 — lokalizacja" : carrierScanMode ? "Nośnik (opcjonalnie)" : "Krok 2 — produkty"}
        </p>
        <p className="mt-2 text-center text-lg font-bold text-[#1a2b3c]">{scanHint}</p>

        <form onSubmit={onManualSubmit} className="mt-4">
          <label className="sr-only" htmlFor="wms-inv-scan">
            Skan
          </label>
          <div className="relative">
            <ScanLine className="pointer-events-none absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-[#1e4d8c]" />
            <input
              ref={scanInputRef}
              id="wms-inv-scan"
              type="text"
              autoComplete="off"
              inputMode="none"
              placeholder={
                step === "location"
                  ? "Skanuj lokalizację…"
                  : carrierScanMode
                    ? "Skanuj nośnik…"
                    : "Skanuj produkt…"
              }
              className={`${WMS_INV.input} min-h-[56px] pl-14 text-lg`}
            />
          </div>
        </form>

        {counting ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={enterCarrierScan} className={`${WMS_INV.btnGhost} flex-1 text-xs`}>
              <Package className="mr-1 inline h-4 w-4" />
              {carrierCode ? `Nośnik: ${carrierCode}` : "Przypisz nośnik"}
            </button>
            {carrierScanMode ? (
              <button type="button" onClick={cancelCarrierScan} className={`${WMS_INV.btnGhost} px-3`}>
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      {counting ? (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setScanMode("increment")}
              className={`min-h-[44px] flex-1 rounded-lg border-2 px-2 py-2 text-xs font-black uppercase ${
                scanMode === "increment"
                  ? "border-[#1e4d8c] bg-[#1e4d8c] text-white"
                  : `${WMS_INV.border} bg-white text-[#5a6b7d]`
              }`}
            >
              Skan +1
            </button>
            <button
              type="button"
              onClick={() => setScanMode("manual")}
              className={`min-h-[44px] flex-1 rounded-lg border-2 px-2 py-2 text-xs font-black uppercase ${
                scanMode === "manual"
                  ? "border-[#1e4d8c] bg-[#1e4d8c] text-white"
                  : `${WMS_INV.border} bg-white text-[#5a6b7d]`
              }`}
            >
              Ilość ręczna
            </button>
            <label
              className={`flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 ${WMS_INV.border} bg-white px-2 text-xs font-black uppercase`}
            >
              <input
                type="checkbox"
                checked={autoConfirm}
                onChange={(e) => setAutoConfirm(e.target.checked)}
                className="h-4 w-4 accent-[#1e4d8c]"
              />
              Auto
            </label>
          </div>

          {scanMode === "manual" && activeScan ? (
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {[1, 2, 5, 10, 25, 50].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setManualQty(n)}
                    className={`min-h-[48px] rounded-lg border-2 ${WMS_INV.border} bg-white text-lg font-black tabular-nums hover:border-[#1e4d8c]`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-center text-3xl font-black tabular-nums text-[#1e4d8c]">{pendingQty}</p>
              <button type="button" className={`${WMS_INV.btnPrimary} w-full`} onClick={() => void confirmManualQty()}>
                Potwierdź {pendingQty} szt.
              </button>
            </div>
          ) : null}

          <WmsInventoryRecentScans items={recentScans} />
          <WmsInventorySessionSummary summary={summary} />
        </>
      ) : null}

      {showQueue ? (
        <WmsInventoryMinimalQueue items={queueItems} loading={queueLoading} onSelect={(t) => void loadTask(t.id)} />
      ) : null}

      <WmsInventoryEmergencySearch
        tenantId={tenantId}
        warehouseId={warehouseId}
        documentId={task?.inventory_document_id}
        disabled={!warehouseId}
        onPick={(pick) => void handleEmergencyPick(pick)}
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className={`${WMS_INV.btnAccent} flex-1`}
          disabled={!task || step === "location"}
          onClick={() => setUnknownOpen(true)}
        >
          <HelpCircle className="mr-2 h-4 w-4" />
          Nieznany produkt
        </button>
        {counting ? (
          <button type="button" className={`${WMS_INV.btnPrimary} flex-1`} onClick={finishLocation}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Zakończ lokalizację
          </button>
        ) : null}
      </div>

      <Link to="/wms/menu" className={`text-center text-xs font-semibold ${WMS_INV.textMuted}`}>
        ← Menu WMS
      </Link>

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
