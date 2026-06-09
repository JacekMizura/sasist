import { useEffect, useState } from "react";
import { AlertTriangle, Image as ImageIcon, Package } from "lucide-react";

import type { WmsBarcodeResolveResult } from "@/api/inventoryCountApi";
import { LocationBadge } from "@/components/warehouse/LocationBadge";
import { CarrierBadge } from "@/components/warehouse/carriers/CarrierBadge";
import type { WmsLastScanKind } from "@/modules/inventoryCount/hooks/useWmsInventoryCountTerminal";
import type { InventoryQtyEditState } from "@/modules/inventoryCount/ui/wms/inventoryQtyUtils";
import WmsInventoryDamageModal from "@/modules/inventoryCount/ui/wms/WmsInventoryDamageModal";
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
  onAdjust: (field: WmsQtyInputMode, delta: number) => void;
  onSetField: (field: WmsQtyInputMode, value: number) => void;
  onSetInputMode: (mode: WmsQtyInputMode) => void;
  onSetDraft: (draft: string | null) => void;
  onCommitDraft: () => void;
  onDefectSaved: (note: string | null) => void;
};

function carrierLabel(counted: WmsCountedProduct | null | undefined, scan: WmsBarcodeResolveResult): string | null {
  if (counted?.carrier_code?.trim()) return counted.carrier_code.trim();
  if (counted?.carrier_id != null) return `#${counted.carrier_id}`;
  if (scan.carrier_id != null) return `#${scan.carrier_id}`;
  return null;
}

/** Inline scan-first product hero — no modal, product dominates, compact qty below. */
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
  onAdjust,
  onSetField,
  onSetInputMode,
  onSetDraft,
  onCommitDraft,
  onDefectSaved,
}: Props) {
  const [damageOpen, setDamageOpen] = useState(false);
  const pack = Math.max(1, packaging.unitsPerCarton);
  const carrierCode = carrierLabel(counted, scan);
  const totalPieces = scan.counted_quantity ?? 0;

  useEffect(() => {
    setDamageOpen(false);
  }, [scan.line_id]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-4">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-4">
          <div className="flex h-28 w-28 shrink-0 items-center justify-center sm:h-32 sm:w-32">
            {scan.image_url ? (
              <img
                src={scan.image_url}
                alt=""
                className="max-h-full max-w-full object-contain mix-blend-multiply"
              />
            ) : (
              <ImageIcon size={48} className="text-slate-200" strokeWidth={1.5} />
            )}
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h2 className="text-lg font-black leading-tight text-slate-900 sm:text-xl">
              {scan.product_name ?? scan.sku ?? "—"}
            </h2>
            {scan.ean ? (
              <p className="mt-1 font-mono text-sm font-bold text-slate-600">EAN: {scan.ean}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
              {pack > 1 ? (
                <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-600">
                  Karton zbiorczy {pack} szt.
                </span>
              ) : null}
              {carrierCode ? (
                <CarrierBadge code={carrierCode} />
              ) : (
                <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-500">
                  <Package size={12} /> Luzem
                </span>
              )}
              {locationCode ? <LocationBadge code={locationCode} type="PICK" /> : null}
              {counted?.defectReported ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase text-amber-700">
                  <AlertTriangle className="h-3 w-3" /> Wada
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-3">
        <WmsInventoryQtyControl
          qtyState={qtyState}
          unitsPerCarton={pack}
          lastScanKind={lastScanKind}
          onAdjust={onAdjust}
          onSetField={onSetField}
          onSetInputMode={onSetInputMode}
          onSetDraft={onSetDraft}
          onCommitDraft={onCommitDraft}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {warehouseId && scan.product_id ? (
            <button
              type="button"
              onClick={() => setDamageOpen(true)}
              className="rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-red-600 hover:bg-red-100"
            >
              Wada
            </button>
          ) : null}
          {lastScanKind === "carton" && pack > 1 ? (
            <span className="text-[11px] font-bold text-emerald-700">+1 karton (+{pack} szt.)</span>
          ) : lastScanKind === "unit" ? (
            <span className="text-[11px] font-bold text-emerald-700">+1 szt.</span>
          ) : null}
        </div>
      </div>

      {isPartialInventory && warehouseId && scan.product_id ? (
        <div className="border-t border-slate-100 px-4 py-3">
          <WmsInventoryPartialProductLocations
            tenantId={tenantId}
            warehouseId={warehouseId}
            productId={scan.product_id}
            currentLocationId={currentLocationId}
          />
        </div>
      ) : null}

      {warehouseId && scan.product_id ? (
        <WmsInventoryDamageModal
          open={damageOpen}
          onClose={() => setDamageOpen(false)}
          tenantId={tenantId}
          warehouseId={warehouseId}
          productId={scan.product_id}
          productName={scan.product_name ?? scan.sku ?? "Produkt"}
          maxQty={Math.max(1, totalPieces || 1)}
          onSaved={(note) => {
            onDefectSaved(note);
            setDamageOpen(false);
          }}
        />
      ) : null}
    </section>
  );
}
