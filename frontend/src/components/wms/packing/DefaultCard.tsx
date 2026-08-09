import { memo, useCallback } from "react";
import type { WmsPackingOrderLineApi } from "../../../api/wmsPackingApi";
import { lineQuantityRequired } from "./packingHelpers";
import { LineDetailsBlock } from "./LineDetailsBlock";
import { PackingLineActionsMenu } from "./PackingLineActionsMenu";
import {
  formatPackingProductName,
  packingProductFieldVisibilityEqual,
  type PackingProductFieldVisibility,
} from "./packingProductDisplay";

export type DefaultCardProps = {
  line: WmsPackingOrderLineApi;
  scanBusy: boolean;
  fieldVisibility: PackingProductFieldVisibility;
  onActivate: (orderItemId: number) => void;
  onMarkShortage?: (orderItemId: number) => void;
};

function DefaultCardInner({ line, scanBusy, fieldVisibility, onActivate, onMarkShortage }: DefaultCardProps) {
  const qtyReq = lineQuantityRequired(line);
  const loc = (line.location_label ?? "").trim();
  const locQty = line.location_bin_qty;
  const locBadge =
    loc && locQty != null && locQty > 0 ? `${loc} (x${locQty})` : loc || "—";
  const title = formatPackingProductName(line.product_name, {
    showName: fieldVisibility.show_product_name,
    truncate: fieldVisibility.truncate_names,
    qty: line.quantity,
  });

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
        {fieldVisibility.show_image ? (
          <div className="flex h-[5.5rem] w-[5.5rem] shrink-0 items-center justify-center overflow-hidden rounded-md">
            {line.image_url ? (
              <img src={line.image_url} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
            ) : (
              <span className="text-2xl text-slate-300">—</span>
            )}
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center self-stretch text-center">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">SPAKOWANO</span>
          <span className="mt-0.5 flex min-h-[2.5rem] items-center justify-center text-[26px] font-black leading-none tabular-nums text-slate-900 sm:text-[28px]">
            {line.quantity_packed}/{qtyReq}
          </span>
        </div>
        {fieldVisibility.show_location ? (
          <div className="flex shrink-0 flex-col items-end justify-between gap-0.5 self-stretch">
            <div className="flex items-start gap-1">
              <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">LOKALIZACJA</span>
              {onMarkShortage ? (
                <PackingLineActionsMenu
                  disabled={scanBusy}
                  onMarkShortage={() => onMarkShortage(line.order_item_id)}
                />
              ) : null}
            </div>
            <span className="max-w-[9.5rem] rounded-full border-2 border-slate-800 px-2 py-0.5 text-center text-[11px] font-bold leading-tight text-slate-900">
              {locBadge}
            </span>
          </div>
        ) : onMarkShortage ? (
          <div className="flex shrink-0 flex-col items-end self-stretch">
            <PackingLineActionsMenu
              disabled={scanBusy}
              onMarkShortage={() => onMarkShortage(line.order_item_id)}
            />
          </div>
        ) : null}
      </div>

      {title ? <p className="mt-auto pt-3 text-[15px] font-bold leading-tight text-slate-900">{title}</p> : null}

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
    a.line.product_signature === b.line.product_signature &&
    a.line.unit_price_display === b.line.unit_price_display &&
    a.line.bundle_name === b.line.bundle_name &&
    a.scanBusy === b.scanBusy &&
    packingProductFieldVisibilityEqual(a.fieldVisibility, b.fieldVisibility) &&
    a.onActivate === b.onActivate &&
    a.onMarkShortage === b.onMarkShortage
  );
}

export const DefaultCard = memo(DefaultCardInner, defaultCardEqual);
