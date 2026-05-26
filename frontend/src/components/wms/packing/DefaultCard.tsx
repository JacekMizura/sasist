import { memo, useCallback } from "react";
import type { WmsPackingOrderLineApi } from "../../../api/wmsPackingApi";
import type { WmsPackingInterfaceDisplay } from "../../../types/wmsPackingSettings";
import { LineDetailsBlock } from "./LineDetailsBlock";

export type DefaultCardProps = {
  line: WmsPackingOrderLineApi;
  scanBusy: boolean;
  fieldVisibility: WmsPackingInterfaceDisplay;
  onActivate: (orderItemId: number) => void;
};

function DefaultCardInner({ line, scanBusy, fieldVisibility, onActivate }: DefaultCardProps) {
  const loc = (line.location_label ?? "").trim();
  const locQty = line.location_bin_qty;
  const locBadge =
    loc && locQty != null && locQty > 0 ? `${loc} (x${locQty})` : loc || "—";

  const handleActivate = useCallback(() => {
    if (scanBusy) return;
    onActivate(line.order_item_id);
  }, [scanBusy, onActivate, line.order_item_id]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleActivate();
        }
      }}
      className={[
        "flex h-full w-full cursor-pointer flex-col rounded-lg border border-slate-200/95 bg-white p-3 text-left opacity-100 shadow-sm outline-none transition-[box-shadow]",
        "hover:shadow-md focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1",
      ].join(" ")}
      style={{ boxShadow: "0 1px 4px rgba(15, 23, 42, 0.06)" }}
    >
      <div className="flex flex-1 gap-2.5">
        <div className="flex h-[5.5rem] w-[5.5rem] shrink-0 items-center justify-center overflow-hidden rounded-md">
          {line.image_url ? (
            <img src={line.image_url} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
          ) : (
            <span className="text-2xl text-slate-300">—</span>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center self-stretch text-center">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">SPAKOWANO</span>
          <span className="mt-0.5 flex min-h-[2.5rem] items-center justify-center text-[26px] font-black leading-none tabular-nums text-slate-900 sm:text-[28px]">
            {line.quantity_packed}/{line.quantity}
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end justify-between gap-0.5 self-stretch">
          <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">LOKALIZACJA</span>
          <span className="max-w-[9.5rem] rounded-full border-2 border-slate-800 px-2 py-0.5 text-center text-[11px] font-bold leading-tight text-slate-900">
            {locBadge}
          </span>
        </div>
      </div>

      <p className="mt-auto pt-3 text-[15px] font-bold leading-tight text-slate-900">
        {line.quantity}x {line.product_name}
      </p>

      <LineDetailsBlock line={line} variant="default" fieldVisibility={fieldVisibility} />
    </div>
  );
}

function defaultCardEqual(a: DefaultCardProps, b: DefaultCardProps): boolean {
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
    a.scanBusy === b.scanBusy &&
    a.fieldVisibility.show_stock === b.fieldVisibility.show_stock &&
    a.fieldVisibility.show_ean === b.fieldVisibility.show_ean &&
    a.fieldVisibility.show_symbol === b.fieldVisibility.show_symbol &&
    a.fieldVisibility.show_catalog_number === b.fieldVisibility.show_catalog_number &&
    a.onActivate === b.onActivate
  );
}

export const DefaultCard = memo(DefaultCardInner, defaultCardEqual);
