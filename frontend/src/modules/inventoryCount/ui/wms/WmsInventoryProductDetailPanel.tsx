import { useEffect, useState } from "react";
import { AlertTriangle, Package, X } from "lucide-react";

import type { WmsBarcodeResolveResult } from "@/api/inventoryCountApi";
import WmsInventoryPartialProductLocations from "@/modules/inventoryCount/ui/wms/WmsInventoryPartialProductLocations";
import WmsInventoryQtyControl from "@/modules/inventoryCount/ui/wms/WmsInventoryQtyControl";
import { WMS_INV } from "./theme";

type Props = {
  scan: WmsBarcodeResolveResult;
  pulse?: boolean;
  invalid?: boolean;
  isPartialInventory?: boolean;
  tenantId: number;
  warehouseId?: number;
  currentLocationId?: number | null;
  onAdjust: (delta: number) => void;
  onSetQuantity: (qty: number) => void;
  onClose: () => void;
  onConfirm: () => void;
};

/** Modal-like product detail panel — presentation only. */
export default function WmsInventoryProductDetailPanel({
  scan,
  pulse,
  invalid,
  isPartialInventory,
  tenantId,
  warehouseId,
  currentLocationId,
  onAdjust,
  onSetQuantity,
  onClose,
  onConfirm,
}: Props) {
  const [detailHidden, setDetailHidden] = useState(false);

  useEffect(() => {
    setDetailHidden(false);
  }, [scan.line_id, scan.counted_quantity]);

  if (detailHidden) return null;

  const ring = invalid ? "ring-2 ring-red-400/70" : pulse ? "ring-2 ring-emerald-400/60" : "";
  const carrierLabel = scan.carrier_id ? `#${scan.carrier_id}` : "LUZEM";

  return (
    <>
      <div className="fixed inset-0 z-30 bg-slate-900/10" aria-hidden />
      <div className="fixed inset-x-0 top-0 z-40 max-h-full overflow-y-auto pb-28 pt-8">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className={`${WMS_INV.card} relative rounded-[2rem] p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)] sm:p-8 ${ring}`}>
          <button
            type="button"
            onClick={() => {
              setDetailHidden(true);
              onClose();
            }}
            className="absolute right-6 top-6 rounded-full bg-slate-50 p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="Zamknij"
          >
            <X className="h-5 w-5" strokeWidth={2.5} />
          </button>

          <h2 className="mb-6 pr-12 text-2xl font-bold leading-tight text-slate-800">
            {scan.product_name ?? "—"}
          </h2>

          <div className="mb-10 flex flex-wrap gap-2">
            {scan.sku ? (
              <span className={`${WMS_INV.chip} uppercase`}>SKU: {scan.sku}</span>
            ) : null}
            {scan.ean ? (
              <span className={`${WMS_INV.chip} uppercase`}>EAN: {scan.ean}</span>
            ) : null}
            <span className={`${WMS_INV.chip} flex items-center gap-2 bg-slate-50 uppercase`}>
              <Package className="h-3.5 w-3.5 text-slate-400" />
              NOŚNIK: {carrierLabel}
            </span>
          </div>

          <div className="mb-8 flex items-center justify-between rounded-2xl border border-slate-100 bg-[#fafbfc] p-6">
            <div className="flex-1 border-r border-slate-200 pr-6">
              <div className="mb-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Dotychczas przyjęto
              </div>
              <div className="mb-3 flex justify-between border-b border-dashed border-slate-200 pb-2 text-sm font-bold text-slate-600">
                <span className="tracking-wide">SZTUKI</span>
                <span>
                  {scan.counted_quantity ?? 0}{" "}
                  <span className="text-xs font-normal text-slate-400">szt.</span>
                </span>
              </div>
            </div>
            <div className="w-36 pl-6 text-right">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Suma ogólna</div>
              <div className="text-5xl font-bold text-[#5a45d0]">
                {scan.counted_quantity ?? 0}{" "}
                <span className="text-base font-bold text-slate-400">szt.</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 p-6">
            <div className="mb-10 flex rounded-xl bg-slate-50 p-1.5">
              <button type="button" className="flex-1 rounded-lg bg-white py-3 text-xs font-bold uppercase tracking-widest text-slate-800 shadow-sm">
                Sztuki
              </button>
              <button type="button" className="flex-1 py-3 text-xs font-bold uppercase tracking-widest text-slate-400">
                Kartony
              </button>
            </div>

            <WmsInventoryQtyControl
              quantity={scan.counted_quantity ?? 0}
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
              className="flex items-center gap-2 rounded-xl border border-red-100 bg-[#fff5f5] px-5 py-4 text-[11px] font-bold uppercase tracking-widest text-red-600 transition-colors hover:bg-red-50"
            >
              <AlertTriangle className="h-4 w-4" />
              Wada
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
    </>
  );
}
