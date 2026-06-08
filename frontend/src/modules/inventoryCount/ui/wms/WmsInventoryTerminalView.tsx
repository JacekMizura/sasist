import { Link } from "react-router-dom";

import type { WmsInventoryTerminalPageState } from "@/modules/inventoryCount/hooks/useWmsInventoryTerminalPage";
import WmsInventoryActiveContextBar from "@/modules/inventoryCount/ui/wms/WmsInventoryActiveContextBar";
import WmsInventoryLocationCounts from "@/modules/inventoryCount/ui/wms/WmsInventoryLocationCounts";
import WmsInventoryLiveSearchPanel from "@/modules/inventoryCount/ui/wms/WmsInventoryLiveSearchPanel";
import WmsInventoryPartialProductLocations from "@/modules/inventoryCount/ui/wms/WmsInventoryPartialProductLocations";
import WmsInventoryProductPreview from "@/modules/inventoryCount/ui/wms/WmsInventoryProductPreview";
import WmsInventoryQtyControl from "@/modules/inventoryCount/ui/wms/WmsInventoryQtyControl";
import WmsInventoryScanField from "@/modules/inventoryCount/ui/wms/WmsInventoryScanField";
import WmsInventoryUnknownProductModal from "@/modules/inventoryCount/ui/wms/WmsInventoryUnknownProductModal";
import { wmsInventoryCountPaths } from "@/modules/inventoryCount/inventoryCountPaths";
import { WMS_INV } from "@/modules/inventoryCount/ui/wms/theme";

type Props = {
  state: WmsInventoryTerminalPageState;
  documentId: number;
};

/** WMS counting terminal — presentation only. */
export default function WmsInventoryTerminalView({ state, documentId }: Props) {
  const {
    inputRef,
    terminal,
    counting,
    query,
    searchActive,
    searchLoading,
    searchRows,
    onChange,
    submitField,
    onInputKeyDown,
    placeholder,
    applyLivePick,
    tenantId,
    warehouseId,
  } = state;

  const {
    task,
    sessionId,
    locationContext,
    carrierContext,
    locationActive,
    locationSubline,
    activeScan,
    activeLineId,
    countedProductGroups,
    pulseLineId,
    isPartialInventory,
    qtyPulse,
    invalidPulse,
    carrierScanMode,
    unknownOpen,
    lastScanCode,
    setUnknownOpen,
    adjustQty,
    setQty,
    selectCountedProduct,
    enterCarrierScan,
    skipCarrier,
    clearCarrier,
    finishLocation,
  } = terminal;

  return (
    <div className={WMS_INV.shell}>
      <header className="space-y-1">
        <WmsInventoryActiveContextBar
          location={locationContext}
          carrier={carrierContext}
          activeProduct={activeScan}
          carrierScanMode={carrierScanMode}
          onEnterCarrierScan={enterCarrierScan}
          onClearCarrier={clearCarrier}
          onSkipCarrier={skipCarrier}
        />
        {locationSubline && locationActive ? <p className={WMS_INV.locationSub}>{locationSubline}</p> : null}
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

      {counting && activeScan ? (
        <>
          <WmsInventoryProductPreview scan={activeScan} pulse={qtyPulse} invalid={invalidPulse} />
          <WmsInventoryQtyControl
            quantity={activeScan.counted_quantity ?? 0}
            onAdjust={(d) => void adjustQty(d)}
            onSetQuantity={(q) => void setQty(q)}
          />
          {isPartialInventory && warehouseId ? (
            <WmsInventoryPartialProductLocations
              tenantId={tenantId}
              warehouseId={warehouseId}
              productId={activeScan.product_id}
              currentLocationId={task?.location_id}
            />
          ) : null}
        </>
      ) : counting ? (
        <p className="text-[11px] font-bold text-slate-400">Zeskanuj produkt lub wyszukaj po nazwie</p>
      ) : null}

      {counting ? (
        <WmsInventoryLocationCounts
          groups={countedProductGroups}
          locationCode={locationContext?.locationCode ?? null}
          activeLineId={activeLineId}
          pulseLineId={pulseLineId}
          onSelect={selectCountedProduct}
        />
      ) : null}

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

      {task && warehouseId ? (
        <WmsInventoryUnknownProductModal
          open={unknownOpen}
          onClose={() => setUnknownOpen(false)}
          tenantId={tenantId}
          warehouseId={warehouseId}
          documentId={task.inventory_document_id}
          taskId={task.id}
          locationId={task.location_id}
          locationCode={locationContext?.locationCode ?? ""}
          sessionId={sessionId}
          initialBarcode={lastScanCode ?? undefined}
          onCreated={() => setUnknownOpen(false)}
        />
      ) : null}

      {!counting && task ? (
        <Link
          to={wmsInventoryCountPaths.document(documentId)}
          className={`mt-2 inline-block text-xs font-bold ${WMS_INV.textMuted}`}
        >
          ← Wróć do skanowania lokalizacji
        </Link>
      ) : null}
    </div>
  );
}

type ErrorProps = {
  message: string;
  backHref: string;
};

export function WmsInventoryTerminalErrorState({ message, backHref }: ErrorProps) {
  return (
    <div>
      <p className="text-sm font-black text-red-700">{message}</p>
      <Link to={backHref} className={`mt-1 inline-block text-xs font-bold ${WMS_INV.textMuted}`}>
        Wróć
      </Link>
    </div>
  );
}

export function WmsInventoryTerminalLoadingState({ label = "…" }: { label?: string }) {
  return <p className={`py-2 ${WMS_INV.textMuted} text-sm font-bold`}>{label}</p>;
}
