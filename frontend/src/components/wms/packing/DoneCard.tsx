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
  PACKING_PRODUCT_GRID_IMAGE_HEIGHT,
  PACKING_PRODUCT_LIST_IMAGE_SIZE,
  packingProductCardRootSizeClass,
  packingProductCardSizeStyle,
} from "./packingProductCardLayout";
import {
  PackingCardFieldLabel,
  PackingDoneCheckIcon,
  PackingDoneCloseIcon,
  PackingGridLocationHeader,
  PackingLocationPill,
  PackingProductThumb,
  PACKING_DONE_CARD_CLASS,
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
  });
  const isGrid = displayMode === "grid";
  const qtyPacked = line.quantity_packed;
  const qtyReq = typeof line.quantity_required === "number" ? line.quantity_required : line.quantity;
  const showLocCorner =
    fieldVisibility.show_location &&
    fieldVisibility.location_placement === "top_right" &&
    Boolean(locBadge);
  const showImg = fieldVisibility.show_image;

  const flashStyle = flash
    ? { boxShadow: "0 0 0 3px rgba(76, 175, 80, 0.45)" }
    : { boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" };

  const closeIcon = (
    <span className="inline-flex h-7 w-7 items-center justify-center" aria-hidden>
      <PackingDoneCloseIcon />
    </span>
  );

  const packedStatus = (
    <div className="flex items-center gap-1.5">
      <PackingDoneCheckIcon />
      <span className="text-sm font-bold text-[#2e7d32]">
        Spakowano {qtyPacked}/{qtyReq}
      </span>
    </div>
  );

  return (
    <div
      className={[
        "pointer-events-none relative flex h-full cursor-default flex-col overflow-hidden rounded-lg",
        PACKING_DONE_CARD_CLASS,
        packingProductCardRootSizeClass(displayMode),
        isGrid ? "p-3" : "px-3 py-2.5",
      ].join(" ")}
      style={{ ...packingProductCardSizeStyle(displayMode), ...flashStyle }}
    >
      {isGrid ? (
        <>
          <div className="flex items-start gap-2">
            <div className="min-w-0 shrink-0">{packedStatus}</div>
            <PackingGridLocationHeader
              showLocation={showLocCorner}
              locBadge={locBadge}
              menu={closeIcon}
              muted
            />
          </div>

          {showImg ? (
            <div
              className="mt-2 flex w-full items-center justify-center overflow-hidden bg-transparent"
              style={{ height: PACKING_PRODUCT_GRID_IMAGE_HEIGHT }}
            >
              {line.image_url ? (
                <img
                  src={line.image_url}
                  alt=""
                  className="max-h-full max-w-full object-contain opacity-55 grayscale"
                  loading="lazy"
                />
              ) : (
                <span className="text-3xl text-slate-200/80" aria-hidden>
                  {"\u00A0"}
                </span>
              )}
            </div>
          ) : null}

          <div className="mt-2 min-h-0 min-w-0 flex-1 overflow-hidden">
            {title ? (
              <p className="line-clamp-3 text-[13px] font-bold leading-snug text-slate-600/85">{title}</p>
            ) : null}
            <LineDetailsBlock line={line} variant="done" fieldVisibility={fieldVisibility} layout="columns" />
          </div>
        </>
      ) : (
        <div className="flex h-full items-stretch gap-3">
          {showImg ? (
            <PackingProductThumb url={line.image_url} size={PACKING_PRODUCT_LIST_IMAGE_SIZE} muted />
          ) : null}

          <div className="flex min-w-0 flex-1 flex-col justify-center overflow-hidden">
            {title ? (
              <p className="line-clamp-2 text-[13px] font-bold leading-snug text-slate-600/85">{title}</p>
            ) : null}
            <LineDetailsBlock line={line} variant="done" fieldVisibility={fieldVisibility} layout="columns" />
          </div>

          <div className="flex w-[7.5rem] shrink-0 flex-col justify-center">{packedStatus}</div>

          {showLocCorner ? (
            <div className="flex w-[7.25rem] shrink-0 flex-col items-end justify-start gap-1 pt-0.5">
              <PackingCardFieldLabel muted>LOKALIZACJA</PackingCardFieldLabel>
              <PackingLocationPill text={locBadge} muted />
            </div>
          ) : null}

          <div className="-mr-1 flex shrink-0 items-start pt-0.5">{closeIcon}</div>
        </div>
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
