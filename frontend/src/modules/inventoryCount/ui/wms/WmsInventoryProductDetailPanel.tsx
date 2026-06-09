import { useEffect, useState } from "react";
import { AlertTriangle, Image as ImageIcon, X } from "lucide-react";

import type { WmsBarcodeResolveResult } from "@/api/inventoryCountApi";
import { CarrierBadge } from "@/components/warehouse/carriers/CarrierBadge";
import type { WmsCountedProduct, WmsInventoryPackaging } from "@/modules/inventoryCount/wmsInventoryExecutionContext";
import type { InventoryQtyEditState } from "@/modules/inventoryCount/ui/wms/inventoryQtyUtils";
import { inventoryTotalPieces } from "@/modules/inventoryCount/ui/wms/inventoryQtyUtils";
import type { WmsQtyInputMode } from "@/modules/inventoryCount/wmsInventoryExecutionContext";
import WmsInventoryDamageModal from "@/modules/inventoryCount/ui/wms/WmsInventoryDamageModal";
import WmsInventoryPartialProductLocations from "@/modules/inventoryCount/ui/wms/WmsInventoryPartialProductLocations";
import WmsInventoryQtyControl from "@/modules/inventoryCount/ui/wms/WmsInventoryQtyControl";

type Props = {
  scan: WmsBarcodeResolveResult;
  counted?: WmsCountedProduct | null;
  pulse?: boolean;
  invalid?: boolean;
  isPartialInventory?: boolean;
  tenantId: number;
  warehouseId?: number;
  currentLocationId?: number | null;
  qtyState: InventoryQtyEditState;
  packaging: WmsInventoryPackaging;
  onQtyModeChange: (mode: WmsQtyInputMode) => void;
  onQtyDraftChange: (draft: string | null) => void;
  onCommitQtyDraft: () => void;
  onAdjust: (field: WmsQtyInputMode, delta: number) => void;
  onSetField: (field: WmsQtyInputMode, value: number) => void;
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

/** Inline product qty panel — putaway-style, no overlay. */
export default function WmsInventoryProductDetailPanel({
  scan,
  counted,
  pulse,
  invalid,
  isPartialInventory,
  tenantId,
  warehouseId,
  currentLocationId,
  qtyState,
  packaging,
  onQtyModeChange,
  onQtyDraftChange,
  onCommitQtyDraft,
  onAdjust,
  onSetField,
  onClose,
  onConfirm,
  onDefectSaved,
}: Props) {
  const [damageOpen, setDamageOpen] = useState(false);
  const pack = Math.max(1, packaging.unitsPerCarton);
  const totalPieces = inventoryTotalPieces(qtyState, pack);
  const ring = invalid ? "ring-2 ring-red-400/70" : pulse ? "ring-2 ring-emerald-400/60" : "";

  useEffect(() => {
    setDamageOpen(false);
  }, [scan.line_id]);

  const carrierCode = carrierLabel(counted, scan);

  return (
    <>
      <div className={`relative rounded-[28px] border border-slate-200 bg-white p-6 shadow-xl ${ring}`}>
        <div className="mb-6 flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-slate-100 bg-white">
            {scan.image_url ? (
              <img src={scan.image_url} alt="" className="max-h-full max-w-full object-contain mix-blend-multiply" />
            ) : (
              <ImageIcon size={32} className="text-slate-200" strokeWidth={1.5} />
            )}
          </div>
          <div className="min-w-0 flex-1 pr-8">
            <h3 className="line-clamp-2 text-base font-black leading-tight text-slate-900">
              {scan.product_name ?? "—"}
            </h3>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {scan.ean ? (
                <span className="inline-flex rounded-md border border-slate-200 bg-white px-2.5 py-0.5 font-mono text-[11px] font-bold text-slate-500">
                  EAN: {scan.ean}
                </span>
              ) : null}
              {carrierCode !== "Luzem" ? (
                <CarrierBadge code={carrierCode} />
              ) : (
                <span className="inline-flex rounded-md border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-bold uppercase text-slate-500">
                  Luzem
                </span>
              )}
              {counted?.defectReported ? (
                <span className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5" /> Wada
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-6 top-6 rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
            aria-label="Zamknij"
          >
            <X className="h-5 w-5" strokeWidth={2.5} />
          </button>
        </div>

        <WmsInventoryQtyControl
          qtyState={qtyState}
          unitsPerCarton={pack}
          onModeChange={onQtyModeChange}
          onAdjust={onAdjust}
          onSetField={onSetField}
          onDraftChange={onQtyDraftChange}
          onCommitDraft={onCommitQtyDraft}
        />

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
            className="flex items-center gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-[11px] font-black uppercase tracking-wider text-red-600 hover:bg-red-100"
          >
            <AlertTriangle className="h-4 w-4" />
            Zgłoś wadę
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl border border-slate-200 py-3 text-[11px] font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50"
          >
            Zamknij
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-[2] rounded-2xl bg-indigo-600 py-3 text-[11px] font-black uppercase tracking-wider text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-700"
          >
            Zatwierdź ({totalPieces} szt.)
          </button>
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
          maxQty={Math.max(1, totalPieces || 1)}
          onSaved={(note) => {
            onDefectSaved(note);
            setDamageOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
