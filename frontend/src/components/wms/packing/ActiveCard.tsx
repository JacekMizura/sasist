import { memo, useCallback } from "react";
import type { WmsPackingOrderLineApi } from "../../../api/wmsPackingApi";
import type { WmsPackingInterfaceDisplay } from "../../../types/wmsPackingSettings";
import { LineDetailsBlock } from "./LineDetailsBlock";

const PRIMARY_GREEN = "#4caf50";

export type ActiveCardProps = {
  line: WmsPackingOrderLineApi;
  packQty: number;
  flash: boolean;
  scanBusy: boolean;
  linePackBusy: boolean;
  fieldVisibility: WmsPackingInterfaceDisplay;
  onPackQtyChange: (orderItemId: number, qty: number) => void;
  onConfirmPack: (orderItemId: number, qtyOverride?: number) => void;
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
}: ActiveCardProps) {
  const maxPack = Math.max(0, line.quantity - line.quantity_packed);
  const loc = (line.location_label ?? "").trim();
  const locQty = line.location_bin_qty;
  const locBadge =
    loc && locQty != null && locQty > 0 ? `${loc} (x${locQty})` : loc || "—";

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
        <div className="flex h-[5.5rem] w-[5.5rem] shrink-0 items-center justify-center overflow-hidden rounded-md">
          {line.image_url ? (
            <img src={line.image_url} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
          ) : (
            <span className="text-2xl text-slate-300">—</span>
          )}
        </div>

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
    a.line.bundle_name === b.line.bundle_name &&
    a.packQty === b.packQty &&
    a.flash === b.flash &&
    a.scanBusy === b.scanBusy &&
    a.linePackBusy === b.linePackBusy &&
    a.fieldVisibility.show_stock === b.fieldVisibility.show_stock &&
    a.fieldVisibility.show_ean === b.fieldVisibility.show_ean &&
    a.fieldVisibility.show_symbol === b.fieldVisibility.show_symbol &&
    a.fieldVisibility.show_catalog_number === b.fieldVisibility.show_catalog_number &&
    a.onPackQtyChange === b.onPackQtyChange &&
    a.onConfirmPack === b.onConfirmPack
  );
}

export const ActiveCard = memo(ActiveCardInner, activeCardEqual);
