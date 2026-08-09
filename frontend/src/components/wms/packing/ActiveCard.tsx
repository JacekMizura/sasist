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
  PACKING_PRODUCT_LIST_CARD_HEIGHT,
  PACKING_PRODUCT_LIST_IMAGE_SIZE,
  packingProductCardRootSizeClass,
  packingProductCardSizeStyle,
} from "./packingProductCardLayout";
import {
  PackingCardFieldLabel,
  PackingCardMenu,
  PackingGridLocationHeader,
  PackingLocationPill,
  PackingProductThumb,
  packingLocationBadge,
} from "./packingProductCardParts";

const PRIMARY_GREEN = "#4caf50";

export type ActiveCardProps = {
  line: WmsPackingOrderLineApi;
  packQty: number;
  flash: boolean;
  scanBusy: boolean;
  linePackBusy: boolean;
  fieldVisibility: PackingProductFieldVisibility;
  onPackQtyChange: (orderItemId: number, qty: number) => void;
  onConfirmPack: (orderItemId: number, qtyOverride?: number) => void;
  onMarkShortage?: (orderItemId: number) => void;
  displayMode?: PackingProductDisplayMode;
};

function ActiveCardInner({
  line,
  packQty,
  flash,
  scanBusy,
  linePackBusy,
  fieldVisibility,
  onPackQtyChange,
  onConfirmPack,
  onMarkShortage,
  displayMode = "list",
}: ActiveCardProps) {
  const qtyReq = lineQuantityRequired(line);
  const maxPack = Math.max(0, qtyReq - line.quantity_packed);
  const locBadge = packingLocationBadge(line);
  const title = formatPackingProductName(line.product_name, {
    showName: fieldVisibility.show_product_name,
    truncate: fieldVisibility.truncate_names,
  });
  const isGrid = displayMode === "grid";
  const atMax = maxPack > 0 && packQty >= maxPack;
  const showLoc = fieldVisibility.show_location;
  const showImg = fieldVisibility.show_image;

  const bump = useCallback(
    (delta: number) => {
      const next = Math.min(maxPack, Math.max(0, packQty + delta));
      onPackQtyChange(line.order_item_id, next);
      if (delta > 0 && next >= maxPack && maxPack > 0) {
        queueMicrotask(() => {
          void onConfirmPack(line.order_item_id, next);
        });
      }
    },
    [line.order_item_id, maxPack, packQty, onPackQtyChange, onConfirmPack],
  );

  const flashStyle = flash
    ? { boxShadow: "0 0 0 4px rgba(52, 211, 153, 0.95), 0 8px 24px rgba(16, 185, 129, 0.4)" }
    : {
        boxShadow:
          "0 0 0 3px #1b5e20, 0 0 0 1px rgba(27, 94, 32, 0.35), 0 10px 24px -6px rgba(27, 94, 32, 0.35)",
      };

  const packControls = (
    <div
      className={["flex flex-col items-stretch gap-2", isGrid ? "w-full max-w-[10.5rem]" : "w-full"].join(" ")}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-slate-400 bg-white text-xl font-bold text-slate-900 hover:bg-slate-50"
          aria-label="Zmniejsz"
          onClick={() => bump(-1)}
        >
          −
        </button>
        <span className="flex min-h-[2rem] min-w-[2.5rem] items-center justify-center text-center text-2xl font-black tabular-nums text-slate-900">
          {packQty}
        </span>
        <button
          type="button"
          disabled={atMax || linePackBusy || scanBusy}
          className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-slate-400 bg-white text-xl font-bold text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Zwiększ"
          onClick={() => bump(1)}
        >
          +
        </button>
      </div>
      <button
        type="button"
        disabled={scanBusy || linePackBusy || packQty <= 0}
        className="w-full rounded-lg py-2 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        style={{ background: PRIMARY_GREEN }}
        onClick={() => onConfirmPack(line.order_item_id)}
      >
        Spakuj
      </button>
    </div>
  );

  const menu = (
    <PackingCardMenu
      disabled={scanBusy || linePackBusy}
      onMarkShortage={onMarkShortage ? () => onMarkShortage(line.order_item_id) : undefined}
    />
  );

  return (
    <div
      className={[
        "relative flex h-full cursor-default flex-col rounded-lg border-[3px] border-[#1b5e20] bg-white text-left",
        packingProductCardRootSizeClass(displayMode),
        isGrid ? "p-3" : "px-3 py-2.5",
      ].join(" ")}
      style={{
        ...packingProductCardSizeStyle(displayMode),
        ...(isGrid ? {} : { height: "auto", minHeight: PACKING_PRODUCT_LIST_CARD_HEIGHT }),
        ...flashStyle,
      }}
    >
      {isGrid ? (
        <>
          <div className="flex items-start gap-2">
            <div className="min-w-0 shrink-0">
              <PackingCardFieldLabel>SPAKOWANO</PackingCardFieldLabel>
              <p className="mt-0.5 text-[1.65rem] font-black leading-none tabular-nums text-slate-900">
                {line.quantity_packed}/{qtyReq}
              </p>
            </div>
            <PackingGridLocationHeader showLocation={showLoc} locBadge={locBadge} menu={menu} />
          </div>

          <div className="relative mt-2 flex min-h-0 flex-1 items-start gap-3 overflow-hidden">
            <div className="relative flex w-[11rem] shrink-0 flex-col items-center justify-center bg-transparent">
              {showImg && line.image_url ? (
                <img
                  src={line.image_url}
                  alt=""
                  className="pointer-events-none absolute inset-0 m-auto max-h-[6.5rem] max-w-[90%] object-contain opacity-20"
                  loading="lazy"
                />
              ) : null}
              <div className="relative z-[1] w-full">{packControls}</div>
            </div>
            <div className="min-w-0 flex-1 overflow-hidden opacity-80">
              {title ? (
                <p className="line-clamp-3 text-[13px] font-bold leading-snug text-slate-900">{title}</p>
              ) : null}
              <LineDetailsBlock line={line} variant="active" fieldVisibility={fieldVisibility} layout="columns" />
            </div>
          </div>
        </>
      ) : (
        <div className="flex h-full items-stretch gap-3">
          {showImg ? <PackingProductThumb url={line.image_url} size={PACKING_PRODUCT_LIST_IMAGE_SIZE} /> : null}

          <div className="flex min-w-0 flex-1 flex-col justify-center overflow-hidden">
            {title ? (
              <p className="line-clamp-2 text-[13px] font-bold leading-snug text-slate-900">{title}</p>
            ) : null}
            <LineDetailsBlock line={line} variant="active" fieldVisibility={fieldVisibility} layout="columns" />
          </div>

          <div className="flex w-[11rem] shrink-0 flex-col justify-center">
            <PackingCardFieldLabel>SPAKOWANO</PackingCardFieldLabel>
            <div className="mt-1">{packControls}</div>
          </div>

          {showLoc ? (
            <div className="flex w-[7.25rem] shrink-0 flex-col items-end justify-center gap-1">
              <PackingCardFieldLabel>LOKALIZACJA</PackingCardFieldLabel>
              <PackingLocationPill text={locBadge} />
            </div>
          ) : null}

          <div className="-mr-1 flex shrink-0 items-start pt-0.5">{menu}</div>
        </div>
      )}
    </div>
  );
}

function activeCardEqual(a: ActiveCardProps, b: ActiveCardProps): boolean {
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
    a.packQty === b.packQty &&
    a.flash === b.flash &&
    a.scanBusy === b.scanBusy &&
    a.linePackBusy === b.linePackBusy &&
    a.displayMode === b.displayMode &&
    packingProductFieldVisibilityEqual(a.fieldVisibility, b.fieldVisibility) &&
    a.onPackQtyChange === b.onPackQtyChange &&
    a.onConfirmPack === b.onConfirmPack &&
    a.onMarkShortage === b.onMarkShortage
  );
}

export const ActiveCard = memo(ActiveCardInner, activeCardEqual);
