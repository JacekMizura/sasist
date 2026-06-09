import { useEffect, useState } from "react";
import { AlertTriangle, Package, X } from "lucide-react";

import type { WmsBarcodeResolveResult } from "@/api/inventoryCountApi";
import type { WmsCountedProduct, WmsInventoryPackaging, WmsQtyInputMode } from "@/modules/inventoryCount/wmsInventoryExecutionContext";
import WmsInventoryDamageModal from "@/modules/inventoryCount/ui/wms/WmsInventoryDamageModal";
import WmsInventoryPartialProductLocations from "@/modules/inventoryCount/ui/wms/WmsInventoryPartialProductLocations";
import WmsInventoryProductThumb from "@/modules/inventoryCount/ui/wms/WmsInventoryProductThumb";
import WmsInventoryQtyControl from "@/modules/inventoryCount/ui/wms/WmsInventoryQtyControl";
import { WMS_INV } from "./theme";

type Props = {
  scan: WmsBarcodeResolveResult;
  counted?: WmsCountedProduct | null;
  pulse?: boolean;
  invalid?: boolean;
  isPartialInventory?: boolean;
  tenantId: number;
  warehouseId?: number;
  currentLocationId?: number | null;
  qtyInputMode: WmsQtyInputMode;
  packaging: WmsInventoryPackaging;
  onQtyModeChange: (mode: WmsQtyInputMode) => void;
  onAdjust: (delta: number) => void;
  onSetQuantity: (qty: number) => void;
  onClose: () => void;
  onConfirm: () => void;
  onDefectSaved: (note: string | null) => void;
};

function carrierLabel(counted: WmsCountedProduct | null | undefined, scan: WmsBarcodeResolveResult): string {
  if (counted?.carrier_code?.trim()) return counted.carrier_code.trim();
  if (counted?.carrier_id != null) return `NOŚNIK #${counted.carrier_id}`;
  if (scan.carrier_id != null) return `NOŚNIK #${scan.carrier_id}`;
  return "LUZEM";
}

/** Modal-like product detail panel — presentation only. */
export default function WmsInventoryProductDetailPanel({
  scan,
  counted,
  pulse,
  invalid,
  isPartialInventory,
  tenantId,
  warehouseId,
  currentLocationId,
  qtyInputMode,
  packaging,
  onQtyModeChange,
  onAdjust,
  onSetQuantity,
  onClose,
  onConfirm,
  onDefectSaved,
}: Props) {
  const [detailHidden, setDetailHidden] = useState(false);
  const [damageOpen, setDamageOpen] = useState(false);
  const hasCartons = packaging.unitsPerCarton > 1;

  useEffect(() => {
    setDetailHidden(false);
  }, [scan.line_id, scan.counted_quantity]);

  if (detailHidden) return null;

  const ring = invalid ? "ring-2 ring-red-400/70" : pulse ? "ring-2 ring-emerald-400/60" : "";
  const qtyPieces = scan.counted_quantity ?? 0;
  const cartons =
    packaging.unitsPerCarton > 1 ? Math.floor(qtyPieces / packaging.unitsPerCarton) : 0;
  const loose = packaging.unitsPerCarton > 1 ? qtyPieces % packaging.unitsPerCarton : qtyPieces;

  return (
    <>
      <div className="fixed inset-0 z-30 bg-white/70 backdrop-blur-[1px]" aria-hidden />
      <div className="fixed inset-x-0 top-0 z-40 max-h-full overflow-y-auto pb-28 pt-6">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className={`${WMS_INV.card} relative rounded-[2rem] p-6 sm:p-8 ${ring}`}>
            <button
              type="button"
              onClick={() => {
                setDetailHidden(true);
                onClose();
              }}
              className="absolute right-6 top-6 rounded-full bg-white p-2 text-slate-400 shadow-sm hover:text-slate-600"
              aria-label="Zamknij"
            >
              <X className="h-5 w-5" strokeWidth={2.5} />
            </button>

            <div className="mb-6 flex gap-4 pr-12">
              <WmsInventoryProductThumb url={scan.image_url} name={scan.product_name} size="lg" />
              <div className="min-w-0 flex-1">
                <h2 className="text-2xl font-bold leading-tight text-slate-800">{scan.product_name ?? "—"}</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {scan.sku ? <span className={`${WMS_INV.chip} uppercase`}>SKU: {scan.sku}</span> : null}
                  {scan.ean ? <span className={`${WMS_INV.chip} uppercase`}>EAN: {scan.ean}</span> : null}
                  <span className={`${WMS_INV.chip} flex items-center gap-2 uppercase`}>
                    <Package className="h-3.5 w-3.5 text-slate-400" />
                    {carrierLabel(counted, scan)}
                  </span>
                  {counted?.defectReported ? (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5" /> Wada
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mb-8 flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-6">
              <div className="flex-1 border-r border-slate-100 pr-6">
                <div className="mb-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Dotychczas policzono
                </div>
                <div className="mb-3 flex justify-between border-b border-dashed border-slate-100 pb-2 text-sm font-bold text-slate-600">
                  <span className="tracking-wide">SZTUKI</span>
                  <span>
                    {qtyPieces} <span className="text-xs font-normal text-slate-400">szt.</span>
                  </span>
                </div>
                {hasCartons ? (
                  <div className="flex justify-between text-sm font-bold text-slate-600">
                    <span className="tracking-wide">KARTONY</span>
                    <span>
                      {cartons} <span className="text-xs font-normal text-slate-400">krt.</span>
                      {loose > 0 ? (
                        <span className="text-xs font-normal text-slate-400"> + {loose} szt.</span>
                      ) : null}
                    </span>
                  </div>
                ) : null}
              </div>
              <div className="w-36 pl-6 text-right">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Suma</div>
                <div className="text-5xl font-bold text-[#5a45d0]">
                  {qtyPieces} <span className="text-base font-bold text-slate-400">szt.</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 p-6">
              {hasCartons ? (
                <div className="mb-10 flex rounded-xl border border-slate-100 bg-white p-1.5">
                  <button
                    type="button"
                    onClick={() => onQtyModeChange("unit")}
                    className={`flex-1 rounded-lg py-3 text-xs font-bold uppercase tracking-widest ${
                      qtyInputMode === "unit" ? "bg-[#5a45d0] text-white shadow-sm" : "text-slate-400"
                    }`}
                  >
                    Sztuki
                  </button>
                  <button
                    type="button"
                    onClick={() => onQtyModeChange("carton")}
                    className={`flex-1 rounded-lg py-3 text-xs font-bold uppercase tracking-widest ${
                      qtyInputMode === "carton" ? "bg-[#5a45d0] text-white shadow-sm" : "text-slate-400"
                    }`}
                  >
                    Kartony ({packaging.unitsPerCarton} szt.)
                  </button>
                </div>
              ) : null}

              <WmsInventoryQtyControl
                quantityPieces={qtyPieces}
                mode={qtyInputMode}
                unitsPerCarton={packaging.unitsPerCarton}
                onAdjust={onAdjust}
                onSetQuantity={onSetQuantity}
              />
            </div>

            {isPartialInventory && warehouseId && scan.product_id ? (
              <div className="mt-6">
                <WmsInventoryPartialProductLocations
                  tenantId={tenantId}
                  warehouseId={warehouseId}
                  productId={scan.product_id}
                  currentLocationId={currentLocationId}
                />
              </div>
            ) : null}

            <div className="mt-8 flex gap-3">
              <button
                type="button"
                onClick={() => setDamageOpen(true)}
                className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-5 py-4 text-[11px] font-bold uppercase tracking-widest text-red-600 transition-colors hover:bg-red-100"
              >
                <AlertTriangle className="h-4 w-4" />
                Zgłoś wadę
              </button>
              <button
                type="button"
                onClick={() => {
                  setDetailHidden(true);
                  onClose();
                }}
                className="flex-1 rounded-xl border border-slate-200 py-4 text-[11px] font-bold uppercase tracking-widest text-slate-600 transition-colors hover:bg-slate-50"
              >
                Zamknij
              </button>
              <button
                type="button"
                onClick={() => {
                  setDetailHidden(true);
                  onConfirm();
                }}
                className="flex-1 rounded-xl bg-[#5a45d0] py-4 text-[11px] font-bold uppercase tracking-widest text-white shadow-md transition-colors hover:bg-[#4b39b5]"
              >
                Zatwierdź
              </button>
            </div>
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
