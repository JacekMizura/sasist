import { memo } from "react";
import type { WmsPackingOrderLineApi } from "../../../api/wmsPackingApi";
import type { PackingProductDisplayMode } from "../../../types/wmsPackingExtendedUi";
import { LineDetailsBlock } from "./LineDetailsBlock";
import {
  formatPackingProductName,
  packingProductFieldVisibilityEqual,
  type PackingProductFieldVisibility,
} from "./packingProductDisplay";
import {
  packingProductCardRootSizeClass,
  packingProductCardSizeStyle,
} from "./packingProductCardLayout";
import {
  PackingCardFieldLabel,
  PackingDoneCheckIcon,
  PackingDoneCloseIcon,
  PackingLocationPill,
  PackingProductThumb,
  packingLocationBadge,
} from "./packingProductCardParts";

export type DoneCardProps = {
  line: WmsPackingOrderLineApi;
  flash: boolean;
  fieldVisibility: PackingProductFieldVisibility;
  displayMode?: PackingProductDisplayMode;
};

function DoneCardInner({ line, flash, fieldVisibility, displayMode = "list" }: DoneCardProps) {
  const locBadge = packingLocationBadge(line);
  const title = formatPackingProductName(line.product_name, {
    showName: fieldVisibility.show_product_name,
    truncate: fieldVisibility.truncate_names,
    qty: line.quantity,
  });
  const isGrid = displayMode === "grid";
  const qtyPacked = line.quantity_packed;
  const qtyReq = typeof line.quantity_required === "number" ? line.quantity_required : line.quantity;
  const showLoc = fieldVisibility.show_location;
  const showImg = fieldVisibility.show_image;

  const flashStyle = flash
    ? { boxShadow: "0 0 0 3px rgba(52, 211, 153, 0.75)" }
    : { boxShadow: "0 1px 3px rgba(15, 23, 42, 0.05)" };

  return (
    <div
      className={[
        "pointer-events-none relative flex cursor-default flex-col overflow-hidden rounded-lg border border-slate-200 bg-white text-left opacity-[0.55]",
        packingProductCardRootSizeClass(displayMode),
        isGrid ? "p-3" : "px-3 pb-2.5 pt-2",
      ].join(" ")}
      style={{ ...packingProductCardSizeStyle(displayMode), ...flashStyle }}
    >
      {isGrid ? (
        <>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <PackingDoneCheckIcon />
                <span className="text-xs font-semibold text-[#4CAF50]">
                  Spakowane {qtyPacked}/{qtyReq}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <div className="flex items-start gap-1">
                {showLoc ? <PackingCardFieldLabel muted>LOKALIZACJA</PackingCardFieldLabel> : null}
                <PackingDoneCloseIcon />
              </div>
              {showLoc ? <PackingLocationPill text={locBadge} muted /> : null}
            </div>
          </div>

          {showImg ? (
            <div className="mt-2 flex h-[8.75rem] w-full items-center justify-center overflow-hidden bg-white">
              {line.image_url ? (
                <img
                  src={line.image_url}
                  alt=""
                  className="max-h-full max-w-full object-contain grayscale"
                  loading="lazy"
                />
              ) : (
                <span className="text-3xl text-slate-300">—</span>
              )}
            </div>
          ) : null}

          {title ? <p className="mt-2 text-[13px] font-bold leading-snug text-slate-500">{title}</p> : null}
          <LineDetailsBlock line={line} variant="done" fieldVisibility={fieldVisibility} layout="stack" />
        </>
      ) : (
        <>
          <div className="flex items-start gap-2.5">
            {showImg ? <PackingProductThumb url={line.image_url} size={76} muted /> : null}
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <PackingDoneCheckIcon />
                    <span className="text-xs font-semibold text-[#4CAF50]">
                      Spakowane {qtyPacked}/{qtyReq}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <div className="flex items-start gap-1">
                    {showLoc ? <PackingCardFieldLabel muted>LOKALIZACJA</PackingCardFieldLabel> : null}
                    <PackingDoneCloseIcon />
                  </div>
                  {showLoc ? <PackingLocationPill text={locBadge} muted /> : null}
                </div>
              </div>
              {title ? <p className="mt-1.5 text-[13px] font-bold leading-snug text-slate-500">{title}</p> : null}
            </div>
          </div>

          <LineDetailsBlock line={line} variant="done" fieldVisibility={fieldVisibility} layout="columns" />
        </>
      )}
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
    a.line.product_signature === b.line.product_signature &&
    a.line.unit_price_display === b.line.unit_price_display &&
    a.line.bundle_name === b.line.bundle_name &&
    a.flash === b.flash &&
    a.displayMode === b.displayMode &&
    packingProductFieldVisibilityEqual(a.fieldVisibility, b.fieldVisibility)
  );
}

export const DoneCard = memo(DoneCardInner, doneCardEqual);
