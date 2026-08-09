import { memo, useCallback } from "react";
import type { WmsPackingOrderLineApi } from "../../../api/wmsPackingApi";
import type { PackingProductDisplayMode } from "../../../types/wmsPackingExtendedUi";
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
  /** `list` = kompaktowa karta pozioma; `grid` = pionowa z dużym zdjęciem. */
  displayMode?: PackingProductDisplayMode;
};

function locationBadge(line: WmsPackingOrderLineApi): string {
  const loc = (line.location_label ?? "").trim();
  const locQty = line.location_bin_qty;
  return loc && locQty != null && locQty > 0 ? `${loc} (x${locQty})` : loc || "—";
}

function DefaultCardInner({
  line,
  scanBusy,
  fieldVisibility,
  onActivate,
  onMarkShortage,
  displayMode = "list",
}: DefaultCardProps) {
  const qtyReq = lineQuantityRequired(line);
  const locBadge = locationBadge(line);
  const title = formatPackingProductName(line.product_name, {
    showName: fieldVisibility.show_product_name,
    truncate: fieldVisibility.truncate_names,
    qty: line.quantity,
  });
  const isGrid = displayMode === "grid";

  const handleActivate = useCallback(() => {
    if (scanBusy) return;
    onActivate(line.order_item_id);
  }, [scanBusy, onActivate, line.order_item_id]);

  const shellClass = [
    "flex h-full w-full cursor-pointer flex-col rounded-lg border border-slate-200/95 bg-white text-left opacity-100 shadow-sm outline-none transition-[box-shadow]",
    "hover:shadow-md focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1",
    isGrid ? "p-3" : "p-2.5 sm:p-3",
  ].join(" ");

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
      className={shellClass}
      style={{ boxShadow: "0 1px 4px rgba(15, 23, 42, 0.06)" }}
    >
      {isGrid ? (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 text-left">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">SPAKOWANO</span>
              <p className="mt-0.5 text-2xl font-black leading-none tabular-nums text-slate-900">
                {line.quantity_packed}/{qtyReq}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <div className="flex items-start gap-1">
                {fieldVisibility.show_location ? (
                  <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">LOKALIZACJA</span>
                ) : null}
                {onMarkShortage ? (
                  <PackingLineActionsMenu
                    disabled={scanBusy}
                    onMarkShortage={() => onMarkShortage(line.order_item_id)}
                  />
                ) : null}
              </div>
              {fieldVisibility.show_location ? (
                <span className="max-w-[9.5rem] rounded-full border-2 border-slate-800 px-2 py-0.5 text-center text-[11px] font-bold leading-tight text-slate-900">
                  {locBadge}
                </span>
              ) : null}
            </div>
          </div>

          {fieldVisibility.show_image ? (
            <div className="mt-3 flex min-h-[9rem] w-full items-center justify-center overflow-hidden bg-white">
              {line.image_url ? (
                <img
                  src={line.image_url}
                  alt=""
                  className="max-h-[11rem] max-w-full object-contain"
                  loading="lazy"
                />
              ) : (
                <span className="text-3xl text-slate-300">—</span>
              )}
            </div>
          ) : null}

          {title ? <p className="mt-3 text-[15px] font-bold leading-tight text-slate-900">{title}</p> : null}
          <LineDetailsBlock line={line} variant="default" fieldVisibility={fieldVisibility} />
        </>
      ) : (
        <div className="flex min-h-0 w-full gap-3">
          {fieldVisibility.show_image ? (
            <div className="flex h-[4.75rem] w-[4.75rem] shrink-0 items-center justify-center overflow-hidden bg-white sm:h-[5.25rem] sm:w-[5.25rem]">
              {line.image_url ? (
                <img src={line.image_url} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
              ) : (
                <span className="text-2xl text-slate-300">—</span>
              )}
            </div>
          ) : null}

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                {title ? <p className="text-[15px] font-bold leading-tight text-slate-900">{title}</p> : null}
                <LineDetailsBlock line={line} variant="default" fieldVisibility={fieldVisibility} />
              </div>
              <div className="flex shrink-0 items-start gap-2 sm:gap-3">
                <div className="text-center">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">SPAKOWANO</span>
                  <p className="mt-0.5 text-xl font-black leading-none tabular-nums text-slate-900 sm:text-2xl">
                    {line.quantity_packed}/{qtyReq}
                  </p>
                </div>
                {fieldVisibility.show_location ? (
                  <div className="flex flex-col items-end gap-1">
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
                  <PackingLineActionsMenu
                    disabled={scanBusy}
                    onMarkShortage={() => onMarkShortage(line.order_item_id)}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
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
    a.displayMode === b.displayMode &&
    packingProductFieldVisibilityEqual(a.fieldVisibility, b.fieldVisibility) &&
    a.onActivate === b.onActivate &&
    a.onMarkShortage === b.onMarkShortage
  );
}

export const DefaultCard = memo(DefaultCardInner, defaultCardEqual);
