import { memo, useCallback } from "react";
import type { WmsPackingOrderLineApi } from "../../../api/wmsPackingApi";
import type { PackingProductDisplayMode } from "../../../types/wmsPackingExtendedUi";
import { lineQuantityRequired } from "./packingHelpers";
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
  PackingCardMenu,
  PackingLocationPill,
  PackingProductThumb,
  packingLocationBadge,
} from "./packingProductCardParts";

export type DefaultCardProps = {
  line: WmsPackingOrderLineApi;
  scanBusy: boolean;
  fieldVisibility: PackingProductFieldVisibility;
  onActivate: (orderItemId: number) => void;
  onMarkShortage?: (orderItemId: number) => void;
  /** `list` = Sidebar lista; `grid` = Sidebar kafelki. */
  displayMode?: PackingProductDisplayMode;
};

function DefaultCardInner({
  line,
  scanBusy,
  fieldVisibility,
  onActivate,
  onMarkShortage,
  displayMode = "list",
}: DefaultCardProps) {
  const qtyReq = lineQuantityRequired(line);
  const locBadge = packingLocationBadge(line);
  const title = formatPackingProductName(line.product_name, {
    showName: fieldVisibility.show_product_name,
    truncate: fieldVisibility.truncate_names,
    qty: line.quantity,
  });
  const isGrid = displayMode === "grid";
  const showLoc = fieldVisibility.show_location;
  const showImg = fieldVisibility.show_image;

  const handleActivate = useCallback(() => {
    if (scanBusy) return;
    onActivate(line.order_item_id);
  }, [scanBusy, onActivate, line.order_item_id]);

  const menu = (
    <PackingCardMenu disabled={scanBusy} onMarkShortage={onMarkShortage ? () => onMarkShortage(line.order_item_id) : undefined} />
  );

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
        "flex cursor-pointer flex-col rounded-lg border border-slate-200 bg-white text-left outline-none transition-[box-shadow]",
        packingProductCardRootSizeClass(displayMode),
        "hover:shadow-md focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1",
        isGrid ? "p-3" : "px-3 pb-2.5 pt-2",
      ].join(" ")}
      style={{
        ...packingProductCardSizeStyle(displayMode),
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.05)",
      }}
    >
      {isGrid ? (
        <>
          {/* Kafelki: SPAKOWANO | LOKALIZACJA + … */}
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <PackingCardFieldLabel>SPAKOWANO</PackingCardFieldLabel>
              <p className="mt-0.5 text-[1.65rem] font-black leading-none tabular-nums text-slate-900">
                {line.quantity_packed}/{qtyReq}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <div className="flex items-start gap-0.5">
                {showLoc ? <PackingCardFieldLabel>LOKALIZACJA</PackingCardFieldLabel> : null}
                {menu}
              </div>
              {showLoc ? <PackingLocationPill text={locBadge} /> : null}
            </div>
          </div>

          {showImg ? (
            <div className="mt-2 flex h-[8.75rem] w-full items-center justify-center overflow-hidden bg-white">
              {line.image_url ? (
                <img src={line.image_url} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
              ) : (
                <span className="text-3xl text-slate-300">—</span>
              )}
            </div>
          ) : null}

          {title ? <p className="mt-2 text-[13px] font-bold leading-snug text-slate-900">{title}</p> : null}
          <LineDetailsBlock line={line} variant="default" fieldVisibility={fieldVisibility} layout="stack" />
        </>
      ) : (
        <>
          {/* Lista Figma: [zdjęcie] [SPAKOWANO/licznik + nazwa | LOKALIZACJA/pill/…] */}
          <div className="flex items-start gap-2.5">
            {showImg ? <PackingProductThumb url={line.image_url} size={76} /> : null}
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <PackingCardFieldLabel>SPAKOWANO</PackingCardFieldLabel>
                  <p className="mt-0.5 text-[1.65rem] font-black leading-none tabular-nums text-slate-900">
                    {line.quantity_packed}/{qtyReq}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <div className="flex items-start gap-0.5">
                    {showLoc ? <PackingCardFieldLabel>LOKALIZACJA</PackingCardFieldLabel> : null}
                    {menu}
                  </div>
                  {showLoc ? <PackingLocationPill text={locBadge} /> : null}
                </div>
              </div>
              {title ? <p className="mt-1.5 text-[13px] font-bold leading-snug text-slate-900">{title}</p> : null}
            </div>
          </div>

          <LineDetailsBlock line={line} variant="default" fieldVisibility={fieldVisibility} layout="columns" />
        </>
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
