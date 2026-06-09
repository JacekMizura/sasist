import { Link } from "react-router-dom";

import type { WmsInventoryTerminalPageState } from "@/modules/inventoryCount/hooks/useWmsInventoryTerminalPage";
import WmsInventoryActiveContextBar from "@/modules/inventoryCount/ui/wms/WmsInventoryActiveContextBar";
import WmsInventoryLocationCounts from "@/modules/inventoryCount/ui/wms/WmsInventoryLocationCounts";
import WmsInventoryLiveSearchPanel from "@/modules/inventoryCount/ui/wms/WmsInventoryLiveSearchPanel";
import WmsInventoryProductDetailPanel from "@/modules/inventoryCount/ui/wms/WmsInventoryProductDetailPanel";
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

  const focusScan = () => {
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className={`${WMS_INV.shell} relative`}>
      <WmsInventoryActiveContextBar
        location={locationContext}
        carrier={carrierContext}
        carrierScanMode={carrierScanMode}
        locationSubline={locationSubline}
        onEnterCarrierScan={enterCarrierScan}
        onClearCarrier={clearCarrier}
        onSkipCarrier={skipCarrier}
      />

      {counting ? (
        <>
          <div>
            <p className={`${WMS_INV.textLabel} mb-3`}>
              Zeskanuj produkt{locationSubline ? ` • ${locationSubline}` : ""}
            </p>
            <WmsInventoryScanField
              inputRef={inputRef}
              value={query}
              onChange={onChange}
              onSubmit={submitField}
              onKeyDown={onInputKeyDown}
              placeholder={placeholder}
              aria-expanded={searchActive}
              dropdown={
                !carrierScanMode ? (
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
          </div>

          <WmsInventoryLocationCounts
            groups={countedProductGroups}
            locationCode={locationContext?.locationCode ?? null}
            activeLineId={activeLineId}
            pulseLineId={pulseLineId}
            onSelect={selectCountedProduct}
          />
        </>
      ) : (
        <WmsInventoryScanField
          inputRef={inputRef}
          value={query}
          onChange={onChange}
          onSubmit={submitField}
          onKeyDown={onInputKeyDown}
          placeholder={placeholder}
          size="hero"
        />
      )}

      {counting && activeScan ? (
        <WmsInventoryProductDetailPanel
          scan={activeScan}
          pulse={qtyPulse}
          invalid={invalidPulse}
          isPartialInventory={isPartialInventory}
          tenantId={tenantId}
          warehouseId={warehouseId}
          currentLocationId={task?.location_id}
          onAdjust={(d) => void adjustQty(d)}
          onSetQuantity={(q) => void setQty(q)}
          onClose={focusScan}
          onConfirm={focusScan}
        />
      ) : null}

      {counting ? (
        <div className={WMS_INV.bottomBar}>
          <div className={WMS_INV.bottomBarInner}>
            <button type="button" className={WMS_INV.btnAction} onClick={() => setUnknownOpen(true)}>
              Nieznany produkt
            </button>
            <button type="button" className={WMS_INV.btnActionPrimary} onClick={finishLocation}>
              Zakończ lokalizację
            </button>
          </div>
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
    <div className={WMS_INV.shellWide}>
      <p className="text-sm font-bold text-red-700">{message}</p>
      <Link to={backHref} className={`mt-2 inline-block text-xs font-bold ${WMS_INV.textMuted}`}>
        Wróć
      </Link>
    </div>
  );
}

export function WmsInventoryTerminalLoadingState({ label = "…" }: { label?: string }) {
  return (
    <div className={WMS_INV.shellWide}>
      <p className={`py-2 text-sm font-bold ${WMS_INV.textMuted}`}>{label}</p>
    </div>
  );
}
