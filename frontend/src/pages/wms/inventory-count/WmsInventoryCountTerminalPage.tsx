import { useCallback, useEffect, useMemo, useRef } from "react";
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
import WmsInventoryQtyControl from "../../../modules/inventoryCount/components/WmsInventoryQtyControl";
import WmsInventoryUnknownProductModal from "../../../modules/inventoryCount/components/WmsInventoryUnknownProductModal";
import { useInventoryScanInput } from "../../../modules/inventoryCount/hooks/useInventoryScanInput";
import { useWmsInventoryCountTerminal } from "../../../modules/inventoryCount/hooks/useWmsInventoryCountTerminal";
import { wmsInventoryCountPaths } from "../../../modules/inventoryCount/inventoryCountPaths";
import { WMS_INV } from "../../../modules/inventoryCount/wmsIndustrialTheme";
import { useWarehouse } from "../../../context/WarehouseContext";

const TENANT_ID = 1;

export default function WmsInventoryCountTerminalPage() {
  const { taskId: taskIdParam } = useParams();
  const taskId = taskIdParam ? Number(taskIdParam) : NaN;
  const { warehouse } = useWarehouse();
  const tenantId = TENANT_ID;
  const warehouseId = warehouse?.id;
  const inputRef = useRef<HTMLInputElement>(null);
  const pickingRef = useRef(false);

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
    carrierCode,
    carrierScanMode,
    unknownOpen,
    lastScanCode,
    setUnknownOpen,
    adjustQty,
    setQty,
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
  const counting = Boolean(task && step === "product");

  const { query, searchOpen, isScannerMode, onChange, submitScanOnce, closeSearch, clearInput } =
    useInventoryScanInput({
      searchEnabled: counting && !carrierScanMode,
      onScan: handleScan,
      onSearchQuery: runSearch,
    });

  const searchActive = searchOpen && !isScannerMode && query.trim().length >= 2;

  useEffect(() => {
    if (!searchActive) clearSearch();
  }, [clearSearch, searchActive]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [step, task, carrierScanMode]);

  const applyLivePick = useCallback(
    async (pick: LiveSearchPick) => {
      if (pickingRef.current) return;
      pickingRef.current = true;
      clearInput();
      closeSearch();
      clearSearch();
      try {
        if (pick.kind === "product") await handleSearchProduct(pick.scanCode);
        else if (pick.kind === "location") await handleSearchLocation(pick.locationCode, pick.taskId);
        else await handleSearchCarrier(pick.code);
      } finally {
        pickingRef.current = false;
        inputRef.current?.focus();
      }
    },
    [clearInput, clearSearch, closeSearch, handleSearchCarrier, handleSearchLocation, handleSearchProduct],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchActive && !searchLoading && !isScannerMode) {
      const first = pickFirstLiveSearch(searchRows);
      if (first) {
        void applyLivePick(first);
        return;
      }
    }
    void submitScanOnce(query);
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      closeSearch();
      return;
    }
    if (e.key === "Enter" && searchActive && !searchLoading && !isScannerMode) {
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
    return <p className={`py-6 text-center ${WMS_INV.textMuted}`}>…</p>;
  }

  if (!Number.isFinite(taskId)) {
    return (
      <div className="text-center">
        <p className="text-lg font-bold text-[#b42318]">Brak lokalizacji w adresie URL.</p>
        <Link to={wmsInventoryCountPaths.root} className={`mt-3 inline-block text-sm ${WMS_INV.textMuted}`}>
          Wróć
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center">
        <p className="text-lg font-bold text-[#b42318]">{error}</p>
        <Link to={wmsInventoryCountPaths.root} className={`mt-3 inline-block text-sm ${WMS_INV.textMuted}`}>
          Wróć
        </Link>
      </div>
    );
  }

  const placeholder = carrierScanMode ? "Nośnik" : "Kod / EAN / SKU / nazwa";

  return (
    <div className="mx-auto flex max-w-lg flex-col px-3 pb-2">
      <header className="shrink-0 text-center">
        <p className="text-2xl font-black tracking-tight text-[#1a2b3c]">{locationLabel}</p>
        {locationSubline ? (
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8a9bb0]">{locationSubline}</p>
        ) : null}
      </header>

      <form onSubmit={onSubmit} className="mt-1.5 w-full shrink-0">
        <div className="relative">
          <ScanLine className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a9bb0]" />
          <input
            ref={inputRef}
            type="text"
            autoComplete="off"
            inputMode="search"
            value={query}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={placeholder}
            className={`${WMS_INV.inputTerminal} pl-9 pr-9`}
            aria-label={placeholder}
            aria-expanded={searchActive}
          />
          <Search className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a9bb0]" />
          {counting && !carrierScanMode ? (
            <WmsInventoryLiveSearchPanel
              query={query}
              open={searchActive}
              loading={searchLoading}
              productRows={searchRows.products}
              locationRows={searchRows.locations}
              carrierRows={searchRows.carriers}
              onPick={(pick) => void applyLivePick(pick)}
            />
          ) : null}
        </div>

        <div className="mt-1 flex items-center gap-1.5">
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
              + nośnik
            </button>
          )}
          {carrierScanMode ? (
            <button type="button" onClick={skipCarrier} className="text-[10px] font-semibold text-[#8a9bb0] underline">
              Pomiń
            </button>
          ) : null}
        </div>
      </form>

      <div className="mt-1 shrink-0 border-b border-[#eef1f5] pb-1">
        <WmsInventoryProductPreview scan={counting ? activeScan : null} pulse={qtyPulse} invalid={invalidPulse} />
      </div>

      {counting ? (
        <div className="mt-1.5 shrink-0">
          <WmsInventoryQtyControl
            quantity={activeScan?.counted_quantity ?? 0}
            disabled={!activeScan}
            onAdjust={(d) => void adjustQty(d)}
            onSetQuantity={(q) => void setQty(q)}
          />
        </div>
      ) : null}

      <div className="mt-2 shrink-0">
        {counting ? <WmsInventoryLastScans items={lastScans} /> : null}
      </div>

      {counting ? (
        <footer className="mt-2 grid shrink-0 grid-cols-2 gap-1.5">
          <button type="button" className={WMS_INV.btnFooter} onClick={() => setUnknownOpen(true)}>
            Nieznany produkt
          </button>
          <button type="button" className={`${WMS_INV.btnFooter} bg-[#1e4d8c] text-white`} onClick={finishLocation}>
            Zakończ lokalizację
          </button>
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
