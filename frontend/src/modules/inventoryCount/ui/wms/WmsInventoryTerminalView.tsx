import { useRef, useState } from "react";
import { Link } from "react-router-dom";

import { WMS_OPERATIONAL_CONTAINER } from "@/components/wms/execution/wmsLayoutTokens";
import { useAuth } from "@/context/AuthContext";
import type { WmsInventoryTerminalPageState } from "@/modules/inventoryCount/hooks/useWmsInventoryTerminalPage";
import { canResolveInventoryCountConflict } from "@/modules/inventoryCount/inventorySupervisorAccess";
import { wmsInventoryCountPaths } from "@/modules/inventoryCount/inventoryCountPaths";
import WmsInventoryActiveContextBar from "@/modules/inventoryCount/ui/wms/WmsInventoryActiveContextBar";
import WmsInventoryDamageModal from "@/modules/inventoryCount/ui/wms/WmsInventoryDamageModal";
import WmsInventoryLiveSearchPanel from "@/modules/inventoryCount/ui/wms/WmsInventoryLiveSearchPanel";
import WmsInventoryOperatorRecent from "@/modules/inventoryCount/ui/wms/WmsInventoryOperatorRecent";
import WmsInventoryProductDetailPanel from "@/modules/inventoryCount/ui/wms/WmsInventoryProductDetailPanel";
import WmsInventoryScanField from "@/modules/inventoryCount/ui/wms/WmsInventoryScanField";
import WmsInventoryUnknownProductModal from "@/modules/inventoryCount/ui/wms/WmsInventoryUnknownProductModal";
import { WMS_INV } from "@/modules/inventoryCount/ui/wms/theme";

type Props = {
  state: WmsInventoryTerminalPageState;
  documentId: number;
};

/** WMS collector terminal — scan-first, product hero, operator-scoped history. */
export default function WmsInventoryTerminalView({ state, documentId }: Props) {
  const scanAnchorRef = useRef<HTMLDivElement>(null);
  const [damageOpen, setDamageOpen] = useState(false);
  const { hasPermission, user } = useAuth();
  const showCountConflict = canResolveInventoryCountConflict(hasPermission, user?.role);
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
    locationSubline,
    activeScan,
    activeLineId,
    activeCountedProduct,
    operatorRecentList,
    countConflict,
    packaging,
    qtyEditState,
    lastScanKind,
    unknownOpen,
    lastScanCode,
    setUnknownOpen,
    setQtyInputMode,
    setQtyDraft,
    commitQtyDraft,
    adjustQty,
    setQtyField,
    selectCountedProduct,
    enterCarrierScan,
    skipCarrier,
    clearCarrier,
    finishLocation,
    reloadFromServer,
    markActiveDefect,
    carrierScanMode,
  } = terminal;

  const focusScan = () => {
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const activeQty = activeScan?.counted_quantity ?? 0;

  return (
    <div className={`${WMS_OPERATIONAL_CONTAINER} space-y-3 py-2 pb-24`}>
      {!activeScan ? (
        <WmsInventoryActiveContextBar location={locationContext} locationSubline={locationSubline} />
      ) : null}

      {counting ? (
        <>
          <WmsInventoryScanField
            inputRef={inputRef}
            anchorRef={scanAnchorRef}
            value={query}
            onChange={onChange}
            onSubmit={submitField}
            onKeyDown={onInputKeyDown}
            placeholder={placeholder}
            aria-expanded={searchActive}
            dropdown={
              !carrierScanMode ? (
                <WmsInventoryLiveSearchPanel
                  anchorRef={scanAnchorRef}
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

          {activeScan ? (
            <WmsInventoryProductDetailPanel
              scan={activeScan}
              counted={activeCountedProduct}
              tenantId={tenantId}
              warehouseId={warehouseId}
              currentLocationId={task?.location_id}
              locationCode={locationContext?.locationCode ?? task?.location_code ?? null}
              packaging={packaging}
              qtyState={qtyEditState}
              lastScanKind={lastScanKind}
              carrierScanMode={carrierScanMode}
              showCountConflict={showCountConflict && countConflict}
              onEnterCarrierScan={enterCarrierScan}
              onClearCarrier={clearCarrier}
              onSkipCarrier={skipCarrier}
              onAdjust={(field, delta) => void adjustQty(field, delta)}
              onSetInputMode={setQtyInputMode}
              onSetDraft={setQtyDraft}
              onCommitDraft={commitQtyDraft}
            />
          ) : null}

          <WmsInventoryOperatorRecent
            items={operatorRecentList}
            activeLineId={activeLineId}
            unitsPerCarton={packaging.unitsPerCarton}
            onSelect={selectCountedProduct}
          />
        </>
      ) : (
        <WmsInventoryScanField
          inputRef={inputRef}
          anchorRef={scanAnchorRef}
          value={query}
          onChange={onChange}
          onSubmit={submitField}
          onKeyDown={onInputKeyDown}
          placeholder={placeholder}
          size="hero"
        />
      )}

      {counting ? (
        <div className={WMS_INV.bottomBar}>
          <div className={`${WMS_OPERATIONAL_CONTAINER} flex gap-2`}>
            <button type="button" className={WMS_INV.btnActionWarning} onClick={() => setUnknownOpen(true)}>
              Nieznany produkt
            </button>
            <button
              type="button"
              className={WMS_INV.btnActionDanger}
              disabled={!activeScan?.product_id}
              onClick={() => setDamageOpen(true)}
            >
              Wada
            </button>
            <button type="button" className={WMS_INV.btnActionPrimary} onClick={finishLocation}>
              Zakończ
            </button>
          </div>
        </div>
      ) : null}

      {task && warehouseId && activeScan?.product_id ? (
        <WmsInventoryDamageModal
          open={damageOpen}
          onClose={() => setDamageOpen(false)}
          tenantId={tenantId}
          warehouseId={warehouseId}
          productId={activeScan.product_id}
          productName={activeScan.product_name ?? activeScan.sku ?? "Produkt"}
          maxQty={Math.max(1, activeQty || 1)}
          onSaved={(note) => {
            markActiveDefect(note);
            setDamageOpen(false);
            focusScan();
          }}
        />
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
          onCreated={() => {
            setUnknownOpen(false);
            void reloadFromServer();
            focusScan();
          }}
        />
      ) : null}

      {!counting && task ? (
        <Link
          to={wmsInventoryCountPaths.document(documentId)}
          className={`inline-block text-xs font-bold ${WMS_INV.textMuted}`}
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
    <div className={`${WMS_OPERATIONAL_CONTAINER} py-8`}>
      <p className="text-sm font-bold text-red-700">{message}</p>
      <Link to={backHref} className={`mt-2 inline-block text-xs font-bold ${WMS_INV.textMuted}`}>
        Wróć
      </Link>
    </div>
  );
}

export function WmsInventoryTerminalLoadingState({ label = "…" }: { label?: string }) {
  return (
    <div className={`${WMS_OPERATIONAL_CONTAINER} py-8`}>
      <p className={`text-sm font-bold ${WMS_INV.textMuted}`}>{label}</p>
    </div>
  );
}
