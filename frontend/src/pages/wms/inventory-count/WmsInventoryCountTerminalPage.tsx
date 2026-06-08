import { useCallback, useEffect, useMemo, useRef } from "react";
import { Link, useParams } from "react-router-dom";

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
import WmsInventoryScanField from "../../../modules/inventoryCount/components/WmsInventoryScanField";
import WmsInventoryUnknownProductModal from "../../../modules/inventoryCount/components/WmsInventoryUnknownProductModal";
import { useInventoryScanInput } from "../../../modules/inventoryCount/hooks/useInventoryScanInput";
import { useWmsInventoryCountTerminal } from "../../../modules/inventoryCount/hooks/useWmsInventoryCountTerminal";
import { wmsInventoryCountPaths } from "../../../modules/inventoryCount/inventoryCountPaths";
import { LocationBadge } from "../../../components/warehouse/LocationBadge";
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

  const submitField = () => {
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
    return <p className={`py-4 ${WMS_INV.textMuted} text-sm font-bold`}>Wybierz magazyn.</p>;
  }

  if (loading && !task) {
    return <p className={`py-2 ${WMS_INV.textMuted} text-sm font-bold`}>…</p>;
  }

  if (!Number.isFinite(taskId)) {
    return (
      <div>
        <p className="text-sm font-black text-red-700">Brak lokalizacji w adresie URL.</p>
        <Link to={wmsInventoryCountPaths.root} className={`mt-1 inline-block text-xs font-bold ${WMS_INV.textMuted}`}>
          Wróć
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <p className="text-sm font-black text-red-700">{error}</p>
        <Link to={wmsInventoryCountPaths.root} className={`mt-1 inline-block text-xs font-bold ${WMS_INV.textMuted}`}>
          Wróć
        </Link>
      </div>
    );
  }

  const placeholder = carrierScanMode ? "Nośnik" : "Kod / EAN / SKU / nazwa";

  return (
    <div className={WMS_INV.shell}>
      <header>
        <LocationBadge code={locationLabel} type="PICK" />
        {locationSubline ? (
          <p className={`${WMS_INV.locationSub} mt-0.5`}>{locationSubline}</p>
        ) : null}
      </header>

      <WmsInventoryScanField
        inputRef={inputRef}
        value={query}
        onChange={onChange}
        onSubmit={submitField}
        onKeyDown={onInputKeyDown}
        placeholder={placeholder}
        aria-expanded={searchActive}
        dropdown={
          counting && !carrierScanMode ? (
            <WmsInventoryLiveSearchPanel
              query={query}
              open={searchActive}
              loading={searchLoading}
              productRows={searchRows.products}
              locationRows={searchRows.locations}
              carrierRows={searchRows.carriers}
              onPick={(pick) => void applyLivePick(pick)}
            />
          ) : null
        }
      />

      <div className="flex items-center gap-2">
        {carrierCode ? (
          <span className={`${WMS_INV.chip} ${WMS_INV.chipActive}`}>Nośnik: {carrierCode}</span>
        ) : (
          <button type="button" onClick={enterCarrierScan} className={WMS_INV.chip}>
            + nośnik
          </button>
        )}
        {carrierScanMode ? (
          <button type="button" onClick={skipCarrier} className="text-[10px] font-bold text-slate-400 underline">
            Pomiń
          </button>
        ) : null}
      </div>

      {counting && activeScan ? (
        <>
          <WmsInventoryProductPreview scan={activeScan} pulse={qtyPulse} invalid={invalidPulse} />
          <WmsInventoryQtyControl
            quantity={activeScan.counted_quantity ?? 0}
            onAdjust={(d) => void adjustQty(d)}
            onSetQuantity={(q) => void setQty(q)}
          />
        </>
      ) : counting ? (
        <p className="text-[11px] font-bold text-slate-400">Zeskanuj produkt</p>
      ) : null}

      {counting ? <WmsInventoryLastScans items={lastScans} /> : null}

      {counting ? (
        <div className={`${WMS_INV.divider} space-y-1 pt-2`}>
          <button type="button" className={WMS_INV.btnAction} onClick={() => setUnknownOpen(true)}>
            Nieznany produkt
          </button>
          <button type="button" className={WMS_INV.btnActionPrimary} onClick={finishLocation}>
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
