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
}: ActiveCardProps) {
  const qtyReq = lineQuantityRequired(line);
  const maxPack = Math.max(0, qtyReq - line.quantity_packed);
  const loc = (line.location_label ?? "").trim();
  const locQty = line.location_bin_qty;
  const locBadge =
    loc && locQty != null && locQty > 0 ? `${loc} (x${locQty})` : loc || "—";
  const title = formatPackingProductName(line.product_name, {
    showName: fieldVisibility.show_product_name,
    truncate: fieldVisibility.truncate_names,
    qty: line.quantity,
  });

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
          "0 0 0 4px #1b5e20, 0 0 0 1px rgba(27, 94, 32, 0.35), 0 14px 32px -6px rgba(27, 94, 32, 0.45), 0 6px 16px rgba(15, 23, 42, 0.12)",
      };

  const atMax = maxPack > 0 && packQty >= maxPack;

  return (
    <div
      className="relative flex h-full w-full cursor-default flex-col rounded-xl border-[3px] border-[#1b5e20] bg-white p-3 text-left shadow-md"
      style={flashStyle}
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

        <div className="relative z-10 flex min-w-0 flex-1 flex-col items-center justify-center self-stretch">
          <div className="flex w-full max-w-[240px] flex-col items-stretch gap-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-center gap-2.5">
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-lg border-2 border-slate-400 bg-white text-xl font-bold text-slate-900 shadow-sm hover:bg-slate-50"
                aria-label="Zmniejsz"
                onClick={() => bump(-1)}
              >
                −
              </button>
              <span className="flex min-h-[2.5rem] min-w-[3.25rem] items-center justify-center text-center text-2xl font-black tabular-nums text-slate-900">
                {packQty}
              </span>
              <button
                type="button"
                disabled={atMax || linePackBusy || scanBusy}
                className="flex h-11 w-11 items-center justify-center rounded-lg border-2 border-slate-400 bg-white text-xl font-bold text-slate-900 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Zwiększ"
                onClick={() => bump(1)}
              >
                +
              </button>
            </div>
            <button
              type="button"
              disabled={scanBusy || linePackBusy || packQty <= 0}
              className="w-full rounded-lg py-3 text-base font-bold text-white shadow-md disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: PRIMARY_GREEN }}
              onClick={() => onConfirmPack(line.order_item_id)}
            >
              Spakuj
            </button>
          </div>
        </div>

        {fieldVisibility.show_location ? (
          <div className="flex shrink-0 flex-col items-end justify-between gap-0.5 self-stretch">
            <div className="flex items-start gap-1">
              <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">LOKALIZACJA</span>
              {onMarkShortage ? (
                <PackingLineActionsMenu
                  disabled={scanBusy || linePackBusy}
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
              disabled={scanBusy || linePackBusy}
              onMarkShortage={() => onMarkShortage(line.order_item_id)}
            />
          </div>
        ) : null}
      </div>

      {title ? <p className="mt-auto pt-3 text-[15px] font-bold leading-tight text-slate-900">{title}</p> : null}

      <LineDetailsBlock line={line} variant="active" fieldVisibility={fieldVisibility} />
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
    packingProductFieldVisibilityEqual(a.fieldVisibility, b.fieldVisibility) &&
    a.onPackQtyChange === b.onPackQtyChange &&
    a.onConfirmPack === b.onConfirmPack &&
    a.onMarkShortage === b.onMarkShortage
  );
}

export const ActiveCard = memo(ActiveCardInner, activeCardEqual);
