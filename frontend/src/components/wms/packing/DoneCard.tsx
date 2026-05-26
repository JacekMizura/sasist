import { memo } from "react";
import type { WmsPackingOrderLineApi } from "../../../api/wmsPackingApi";
import type { WmsPackingInterfaceDisplay } from "../../../types/wmsPackingSettings";
import { LineDetailsBlock } from "./LineDetailsBlock";

export type DoneCardProps = {
  line: WmsPackingOrderLineApi;
  flash: boolean;
  fieldVisibility: WmsPackingInterfaceDisplay;
};

function DoneCardInner({ line, flash, fieldVisibility }: DoneCardProps) {
  const loc = (line.location_label ?? "").trim();
  const locQty = line.location_bin_qty;
  const locBadge =
    loc && locQty != null && locQty > 0 ? `${loc} (x${locQty})` : loc || "—";

  const flashStyle = flash
    ? { boxShadow: "0 0 0 3px rgba(52, 211, 153, 0.75)" }
    : { boxShadow: "0 1px 4px rgba(15, 23, 42, 0.06)" };

  return (
    <div
      className="pointer-events-none relative flex h-full w-full cursor-default flex-col overflow-hidden rounded-lg border border-emerald-200/70 bg-emerald-50/95 p-3 text-left [container-type:inline-size]"
      style={flashStyle}
    >
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 z-10 select-none font-black uppercase text-emerald-600/45"
        style={{
          transform: "translate(-50%, -50%) rotate(-30deg)",
          fontSize: "min(clamp(24px, 4vw, 48px), 14cqw)",
          whiteSpace: "nowrap",
        }}
        aria-hidden
      >
        SPAKOWANO
      </span>
      <div className="relative z-[1] flex flex-1 gap-2.5">
        <div className="flex h-[5.5rem] w-[5.5rem] shrink-0 items-center justify-center overflow-hidden rounded-md">
          {line.image_url ? (
            <img
              src={line.image_url}
              alt=""
              className="max-h-full max-w-full object-contain grayscale"
              loading="lazy"
            />
          ) : (
            <span className="text-2xl text-slate-300">—</span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col items-center justify-center text-center" aria-hidden />

        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">LOKALIZACJA</span>
          <span className="max-w-[9.5rem] rounded-full border-2 border-slate-400 px-2 py-0.5 text-center text-[11px] font-bold leading-tight text-slate-500">
            {locBadge}
          </span>
        </div>
      </div>

      <p className="relative z-[1] mt-auto pt-3 text-[15px] font-bold leading-tight text-slate-500">
        {line.quantity}x {line.product_name}
      </p>

      <div className="relative z-[1]">
        <LineDetailsBlock line={line} variant="done" fieldVisibility={fieldVisibility} />
      </div>
    </div>
  );
}

function doneCardEqual(a: DoneCardProps, b: DoneCardProps): boolean {
  return (
    a.line.order_item_id === b.line.order_item_id &&
    a.line.quantity === b.line.quantity &&
    a.line.quantity_packed === b.line.quantity_packed &&
    a.line.product_name === b.line.product_name &&
    a.line.ean === b.line.ean &&
    a.line.sku === b.line.sku &&
    a.line.image_url === b.line.image_url &&
    a.line.location_label === b.line.location_label &&
    a.line.location_bin_qty === b.line.location_bin_qty &&
    a.line.stock_quantity === b.line.stock_quantity &&
    a.line.color_name === b.line.color_name &&
    a.line.catalog_number === b.line.catalog_number &&
    a.line.product_symbol === b.line.product_symbol &&
    a.line.bundle_name === b.line.bundle_name &&
    a.flash === b.flash &&
    a.fieldVisibility.show_stock === b.fieldVisibility.show_stock &&
    a.fieldVisibility.show_ean === b.fieldVisibility.show_ean &&
    a.fieldVisibility.show_symbol === b.fieldVisibility.show_symbol &&
    a.fieldVisibility.show_catalog_number === b.fieldVisibility.show_catalog_number
  );
}

export const DoneCard = memo(DoneCardInner, doneCardEqual);
