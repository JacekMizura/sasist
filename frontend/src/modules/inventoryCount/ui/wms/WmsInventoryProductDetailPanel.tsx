import { Image as ImageIcon, Package, X } from "lucide-react";

import type { WmsBarcodeResolveResult } from "@/api/inventoryCountApi";
import { CarrierBadge } from "@/components/warehouse/carriers/CarrierBadge";
import { LocationBadge } from "@/components/warehouse/LocationBadge";
import type { WmsLastScanKind } from "@/modules/inventoryCount/hooks/useWmsInventoryCountTerminal";
import type { InventoryQtyEditState } from "@/modules/inventoryCount/ui/wms/inventoryQtyUtils";
import WmsInventoryPartialProductLocations from "@/modules/inventoryCount/ui/wms/WmsInventoryPartialProductLocations";
import WmsInventoryQtyControl from "@/modules/inventoryCount/ui/wms/WmsInventoryQtyControl";
import type { WmsCountedProduct, WmsInventoryPackaging, WmsQtyInputMode } from "@/modules/inventoryCount/wmsInventoryExecutionContext";

type Props = {
  scan: WmsBarcodeResolveResult;
  counted?: WmsCountedProduct | null;
  isPartialInventory?: boolean;
  tenantId: number;
  warehouseId?: number;
  currentLocationId?: number | null;
  locationCode?: string | null;
  packaging: WmsInventoryPackaging;
  qtyState: InventoryQtyEditState;
  lastScanKind: WmsLastScanKind;
  carrierScanMode?: boolean;
  countConflict?: boolean;
  onEnterCarrierScan: () => void;
  onClearCarrier: () => void;
  onSkipCarrier?: () => void;
  onAdjust: (field: WmsQtyInputMode, delta: number) => void;
  onSetInputMode: (mode: WmsQtyInputMode) => void;
  onSetDraft: (draft: string | null) => void;
  onCommitDraft: () => void;
};

function carrierLabel(counted: WmsCountedProduct | null | undefined, scan: WmsBarcodeResolveResult): string | null {
  if (counted?.carrier_code?.trim()) return counted.carrier_code.trim();
  if (counted?.carrier_id != null) return `#${counted.carrier_id}`;
  if (scan.carrier_id != null) return `#${scan.carrier_id}`;
  return null;
}

/** Collector product hero — photo first, then meta, carrier, qty. */
export default function WmsInventoryProductDetailPanel({
  scan,
  counted,
  isPartialInventory,
  tenantId,
  warehouseId,
  currentLocationId,
  locationCode,
  packaging,
  qtyState,
  lastScanKind,
  carrierScanMode,
  countConflict,
  onEnterCarrierScan,
  onClearCarrier,
  onSkipCarrier,
  onAdjust,
  onSetInputMode,
  onSetDraft,
  onCommitDraft,
}: Props) {
  const pack = Math.max(1, packaging.unitsPerCarton);
  const carrierCode = carrierLabel(counted, scan);

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center text-center">
        <div className="mb-4 flex h-44 w-44 items-center justify-center sm:h-52 sm:w-52">
          {scan.image_url ? (
            <img
              src={scan.image_url}
              alt=""
              className="max-h-full max-w-full object-contain mix-blend-multiply"
            />
          ) : (
            <ImageIcon size={64} className="text-slate-200" strokeWidth={1.5} />
          )}
        </div>
        <h2 className="max-w-full px-2 text-xl font-black leading-tight text-slate-900 sm:text-2xl">
          {scan.product_name ?? scan.sku ?? "—"}
        </h2>
        {scan.ean ? (
          <p className="mt-2 font-mono text-sm font-bold text-slate-600 sm:text-base">EAN: {scan.ean}</p>
        ) : null}
      </div>

      {countConflict ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-center text-sm font-bold text-amber-800">
          Konflikt liczenia — kierownik musi zatwierdzić wynik
        </p>
      ) : null}

      <div className="space-y-3">
        {locationCode ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Lokalizacja</span>
            <LocationBadge code={locationCode} type="PICK" />
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nośnik</span>
          {carrierScanMode ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-indigo-700">Skanuj nośnik…</span>
              {onSkipCarrier ? (
                <button type="button" onClick={onSkipCarrier} className="text-xs font-bold text-slate-500 underline">
                  Anuluj
                </button>
              ) : null}
            </div>
          ) : carrierCode ? (
            <div className="flex items-center gap-2">
              <CarrierBadge code={carrierCode} />
              <button
                type="button"
                onClick={onClearCarrier}
                className="rounded-full p-1 text-slate-400 active:bg-slate-100"
                aria-label="Usuń nośnik"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onEnterCarrierScan}
              className="inline-flex items-center gap-1.5 text-sm font-black uppercase tracking-wide text-slate-600 active:text-slate-900"
            >
              <Package className="h-4 w-4" /> Przypisz nośnik
            </button>
          )}
        </div>

        {pack > 1 ? (
          <p className="text-center text-[11px] font-bold text-slate-500">
            Karton zbiorczy: {pack} szt.
            {packaging.cartonEan ? ` · EAN ${packaging.cartonEan}` : ""}
          </p>
        ) : null}
      </div>

      <WmsInventoryQtyControl
        qtyState={qtyState}
        unitsPerCarton={pack}
        onAdjust={onAdjust}
        onSetInputMode={onSetInputMode}
        onSetDraft={onSetDraft}
        onCommitDraft={onCommitDraft}
      />

      {lastScanKind === "carton" && pack > 1 ? (
        <p className="text-center text-sm font-bold text-emerald-700">+1 karton (+{pack} szt.)</p>
      ) : lastScanKind === "unit" ? (
        <p className="text-center text-sm font-bold text-emerald-700">+1 szt.</p>
      ) : null}

      {isPartialInventory && warehouseId && scan.product_id ? (
        <WmsInventoryPartialProductLocations
          tenantId={tenantId}
          warehouseId={warehouseId}
          productId={scan.product_id}
          currentLocationId={currentLocationId}
        />
      ) : null}
    </div>
  );
}
