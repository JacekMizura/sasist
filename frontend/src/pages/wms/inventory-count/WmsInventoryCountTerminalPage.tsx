import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ScanLine, Search } from "lucide-react";

import WmsInventoryLastScans from "../../../modules/inventoryCount/components/WmsInventoryLastScans";
import WmsInventoryLiveSearchPanel from "../../../modules/inventoryCount/components/WmsInventoryLiveSearchPanel";
import {
  buildLiveSearchRows,
  pickFirstLiveSearch,
  useWmsInventoryLiveSearch,
  type LiveSearchPick,
} from "../../../modules/inventoryCount/components/WmsInventoryLiveSearchDropdown";
import WmsInventoryProductPreview from "../../../modules/inventoryCount/components/WmsInventoryProductPreview";
import WmsInventoryUnknownProductModal from "../../../modules/inventoryCount/components/WmsInventoryUnknownProductModal";
import { useWmsInventoryCountTerminal } from "../../../modules/inventoryCount/hooks/useWmsInventoryCountTerminal";
import { WMS_INV } from "../../../modules/inventoryCount/wmsIndustrialTheme";
import { useWarehouse } from "../../../context/WarehouseContext";

const TENANT_ID = 1;

function looksLikeScannerInput(value: string): boolean {
  const t = value.trim();
  return t.length >= 8 && /^[0-9A-Za-z.-]+$/.test(t);
}

export default function WmsInventoryCountTerminalPage() {
  const { taskId: taskIdParam } = useParams();
  const taskId = taskIdParam ? Number(taskIdParam) : NaN;
  const { warehouse } = useWarehouse();
  const tenantId = TENANT_ID;
  const warehouseId = warehouse?.id;
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [scanQuery, setScanQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const {
    loading,
    error,
    task,
    sessionId,
    step,
    locationLabel,
    locationSubline,
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

  const { loading: searchLoading, result, taskMatches, runSearch, clearSearch } = useWmsInventoryLiveSearch(
    tenantId,
    warehouseId ?? 0,
    task?.inventory_document_id,
    task?.id,
  );

  const searchRows = useMemo(() => buildLiveSearchRows(result, taskMatches), [result, taskMatches]);
  const searchActive = dropdownOpen && scanQuery.trim().length >= 2 && !carrierScanMode;

  useEffect(() => {
    scanInputRef.current?.focus();
  }, [step, task, carrierScanMode, manualOpen]);

  useEffect(() => {
    if (!searchActive) {
      clearSearch();
      return;
    }
    const t = window.setTimeout(() => void runSearch(scanQuery), 200);
    return () => window.clearTimeout(t);
  }, [searchActive, scanQuery, runSearch, clearSearch]);

  const applyLivePick = useCallback(
    async (pick: LiveSearchPick) => {
      setScanQuery("");
      setDropdownOpen(false);
      clearSearch();
      if (pick.kind === "product") await handleSearchProduct(pick.scanCode);
      else if (pick.kind === "location") await handleSearchLocation(pick.locationCode, pick.taskId);
      else await handleSearchCarrier(pick.code);
      scanInputRef.current?.focus();
    },
    [clearSearch, handleSearchCarrier, handleSearchLocation, handleSearchProduct],
  );

  const submitScan = useCallback(async () => {
    const v = scanQuery.trim();
    if (!v) return;
    setScanQuery("");
    setDropdownOpen(false);
    clearSearch();
    await handleScan(v);
    scanInputRef.current?.focus();
  }, [scanQuery, clearSearch, handleScan]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!looksLikeScannerInput(scanQuery) && searchActive && !searchLoading) {
      const first = pickFirstLiveSearch(searchRows);
      if (first) {
        void applyLivePick(first);
        return;
      }
    }
    void submitScan();
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setDropdownOpen(false);
      return;
    }
    if (e.key === "Enter" && !looksLikeScannerInput(scanQuery) && searchActive && !searchLoading) {
      const first = pickFirstLiveSearch(searchRows);
      if (first) {
        e.preventDefault();
        void applyLivePick(first);
      }
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
      <header className="shrink-0 pt-0.5 text-center">
        {task ? (
          <>
            <p className="text-2xl font-black tracking-tight text-[#1a2b3c]">{locationLabel}</p>
            {locationSubline ? (
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8a9bb0]">{locationSubline}</p>
            ) : null}
          </>
        ) : (
          <p className="text-lg font-bold text-[#5a6b7d]">Inwentaryzacja</p>
        )}
      </header>

      <form onSubmit={onSubmit} className="mx-auto mt-2 w-full shrink-0">
        <div className="relative">
          <ScanLine className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a9bb0]" />
          <input
            ref={scanInputRef}
            type="text"
            autoComplete="off"
            inputMode="search"
            value={scanQuery}
            onChange={(e) => {
              setScanQuery(e.target.value);
              setDropdownOpen(e.target.value.trim().length >= 2 && !carrierScanMode);
            }}
            onFocus={() => {
              if (scanQuery.trim().length >= 2 && !carrierScanMode) setDropdownOpen(true);
            }}
            onKeyDown={onInputKeyDown}
            placeholder={placeholder}
            className={`${WMS_INV.inputTerminal} pl-9 pr-9`}
            aria-label={placeholder}
            aria-expanded={searchActive}
            aria-autocomplete="list"
          />
          <Search className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a9bb0]" />
          {counting && !carrierScanMode ? (
            <WmsInventoryLiveSearchPanel
              query={scanQuery}
              open={searchActive}
              loading={searchLoading}
              productRows={searchRows.products}
              locationRows={searchRows.locations}
              carrierRows={searchRows.carriers}
              onPick={(pick) => void applyLivePick(pick)}
            />
          ) : null}
        </div>

        {counting ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {carrierCode ? (
              <span className="rounded border border-[#d0d7e2] px-2 py-0.5 text-[10px] font-bold uppercase text-[#1e4d8c]">
                Nośnik: {carrierCode}
              </span>
            ) : (
              <button
                type="button"
                onClick={enterCarrierScan}
                className="rounded border border-[#e8edf3] px-2 py-0.5 text-[10px] font-semibold text-[#5a6b7d]"
              >
                Nośnik
              </button>
            )}
            {carrierScanMode ? (
              <button type="button" onClick={skipCarrier} className="text-[10px] font-semibold text-[#8a9bb0] underline">
                Pomiń
              </button>
            ) : null}
          </div>
        ) : null}
      </form>

      <div className="mt-1.5 shrink-0">
        <WmsInventoryProductPreview scan={counting ? activeScan : null} pulse={qtyPulse} invalid={invalidPulse} />
      </div>

      {counting ? (
        <div className="mt-1.5 grid shrink-0 grid-cols-4 gap-1 overflow-hidden rounded-md border border-[#e8edf3]">
          <button type="button" className={`${WMS_INV.btnQuick} rounded-none border-0 border-r border-[#e8edf3]`} onClick={() => void quickAddDelta(1)}>
            +1
          </button>
          <button type="button" className={`${WMS_INV.btnQuick} rounded-none border-0 border-r border-[#e8edf3]`} onClick={() => void quickAddDelta(5)}>
            +5
          </button>
          <button
            type="button"
            className={`${WMS_INV.btnQuick} rounded-none border-0 border-r border-[#e8edf3] ${manualOpen ? "bg-[#eef3fa] text-[#1e4d8c]" : ""}`}
            onClick={() => setManualOpen((v) => !v)}
          >
            Ręczna
          </button>
          <button type="button" className={`${WMS_INV.btnQuick} rounded-none border-0`} onClick={() => void undoLastScan()}>
            Cofnij
          </button>
        </div>
      ) : null}

      {manualOpen && activeScan ? (
        <div className="mt-1.5 shrink-0 space-y-1.5">
          <div className="grid grid-cols-4 gap-1">
            {[1, 2, 5, 10, 25, 50, 100].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setManualQty(n)}
                className="h-8 rounded border border-[#d0d7e2] bg-white text-xs font-bold tabular-nums active:bg-[#f0f2f5]"
              >
                {n}
              </button>
            ))}
          </div>
          <p className="text-center text-xl font-black tabular-nums text-[#1e4d8c]">{pendingQty}</p>
          <button type="button" className={`${WMS_INV.btnPrimary} min-h-[40px] w-full rounded-lg text-sm`} onClick={() => void confirmManualQty()}>
            Zapisz {pendingQty}
          </button>
        </div>
      ) : null}

      <div className="mt-2 min-h-0 flex-1 overflow-hidden">
        {counting ? <WmsInventoryLastScans items={lastScans} /> : null}
      </div>

      {counting ? (
        <footer className="sticky bottom-0 shrink-0 border-t border-[#e8edf3] bg-white pb-1.5 pt-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" className={WMS_INV.btnFooter} onClick={() => setUnknownOpen(true)}>
              Nieznany produkt
            </button>
            <button type="button" className={`${WMS_INV.btnFooter} bg-[#1e4d8c] text-white`} onClick={finishLocation}>
              Zakończ lokalizację
            </button>
          </div>
        </footer>
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
