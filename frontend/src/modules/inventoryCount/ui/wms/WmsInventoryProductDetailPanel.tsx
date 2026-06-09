import { useEffect, useState } from "react";
import { AlertTriangle, Image as ImageIcon, X } from "lucide-react";

import type { WmsBarcodeResolveResult } from "@/api/inventoryCountApi";
import { CarrierBadge } from "@/components/warehouse/carriers/CarrierBadge";
import type { WmsLastScanKind } from "@/modules/inventoryCount/hooks/useWmsInventoryCountTerminal";
import type { WmsCountedProduct, WmsInventoryPackaging } from "@/modules/inventoryCount/wmsInventoryExecutionContext";
import { formatPackagingHelper } from "@/modules/inventoryCount/ui/wms/inventoryQtyUtils";
import WmsInventoryDamageModal from "@/modules/inventoryCount/ui/wms/WmsInventoryDamageModal";
import WmsInventoryPartialProductLocations from "@/modules/inventoryCount/ui/wms/WmsInventoryPartialProductLocations";
import WmsInventoryQtyControl from "@/modules/inventoryCount/ui/wms/WmsInventoryQtyControl";

type Props = {
  scan: WmsBarcodeResolveResult;
  counted?: WmsCountedProduct | null;
  isPartialInventory?: boolean;
  tenantId: number;
  warehouseId?: number;
  currentLocationId?: number | null;
  packaging: WmsInventoryPackaging;
  lastScanKind: WmsLastScanKind;
  onAdjust: (delta: number) => void;
  onSetQuantity: (qty: number) => void;
  onClose: () => void;
  onConfirm: () => void;
  onDefectSaved: (note: string | null) => void;
};

function carrierLabel(counted: WmsCountedProduct | null | undefined, scan: WmsBarcodeResolveResult): string {
  if (counted?.carrier_code?.trim()) return counted.carrier_code.trim();
  if (counted?.carrier_id != null) return `#${counted.carrier_id}`;
  if (scan.carrier_id != null) return `#${scan.carrier_id}`;
  return "Luzem";
}

/** Compact product panel — product-first, qty in pieces only. */
export default function WmsInventoryProductDetailPanel({
  scan,
  counted,
  isPartialInventory,
  tenantId,
  warehouseId,
  currentLocationId,
  packaging,
  lastScanKind,
  onAdjust,
  onSetQuantity,
  onClose,
  onConfirm,
  onDefectSaved,
}: Props) {
  const [damageOpen, setDamageOpen] = useState(false);
  const pack = Math.max(1, packaging.unitsPerCarton);
  const qtyPieces = scan.counted_quantity ?? 0;
  const packagingHint = formatPackagingHelper(qtyPieces, pack);
  const lastScanHint =
    lastScanKind === "carton" && pack > 1
      ? `Ostatni skan: karton zbiorczy (+${pack} szt.)`
      : lastScanKind === "unit"
        ? "Ostatni skan: sztuka (+1 szt.)"
        : null;

  useEffect(() => {
    setDamageOpen(false);
  }, [scan.line_id]);

  const carrierCode = carrierLabel(counted, scan);

  return (
    <>
      <button type="button" className="fixed inset-0 z-30 bg-slate-900/25" aria-label="Zamknij panel" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-40 max-h-[85vh] overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
        <div className="p-5">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-slate-100">
              {scan.image_url ? (
                <img src={scan.image_url} alt="" className="max-h-full max-w-full object-contain mix-blend-multiply" />
              ) : (
                <ImageIcon size={28} className="text-slate-200" strokeWidth={1.5} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-2 text-sm font-black leading-snug text-slate-900">
                {scan.product_name ?? "—"}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {scan.ean ? (
                  <span className="font-mono text-[11px] font-bold text-slate-500">EAN {scan.ean}</span>
                ) : null}
                {carrierCode !== "Luzem" ? <CarrierBadge code={carrierCode} /> : null}
                {counted?.defectReported ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-amber-700">
                    <AlertTriangle className="h-3 w-3" /> Wada
                  </span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              aria-label="Zamknij"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <WmsInventoryQtyControl
            quantityPieces={qtyPieces}
            packagingHint={packagingHint}
            lastScanHint={lastScanHint}
            onAdjust={onAdjust}
            onSetQuantity={onSetQuantity}
          />

          {pack > 1 && packaging.cartonEan ? (
            <p className="mt-3 text-[10px] text-slate-400">
              Karton zbiorczy: EAN {packaging.cartonEan} · {pack} szt./karton
            </p>
          ) : null}

          {isPartialInventory && warehouseId && scan.product_id ? (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <WmsInventoryPartialProductLocations
                tenantId={tenantId}
                warehouseId={warehouseId}
                productId={scan.product_id}
                currentLocationId={currentLocationId}
              />
            </div>
          ) : null}

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => setDamageOpen(true)}
              className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-red-600 hover:bg-red-100"
            >
              Wada
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 py-2 text-[10px] font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50"
            >
              Zamknij
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="flex-[2] rounded-lg bg-indigo-600 py-2 text-[10px] font-black uppercase tracking-wider text-white hover:bg-indigo-700"
            >
              Gotowe
            </button>
          </div>
        </div>
      </div>

      {warehouseId && scan.product_id ? (
        <WmsInventoryDamageModal
          open={damageOpen}
          onClose={() => setDamageOpen(false)}
          tenantId={tenantId}
          warehouseId={warehouseId}
          productId={scan.product_id}
          productName={scan.product_name ?? scan.sku ?? "Produkt"}
          maxQty={Math.max(1, qtyPieces || 1)}
          onSaved={(note) => {
            onDefectSaved(note);
            setDamageOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
