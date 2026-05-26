import { memo } from "react";
import type { WmsPackingOrderLineApi } from "../../../../api/wmsPackingApi";

export type ProductInlineItemProps = {
  line: WmsPackingOrderLineApi;
  onProductClick?: (orderItemId: number) => void;
};

/** Min. 64px, prefer 72px — czytelność z dystansu / handheld. */
const IMG = 72;

function ProductInlineItemInner({ line, onProductClick }: ProductInlineItemProps) {
  const packed = line.quantity > 0 && line.quantity_packed >= line.quantity;
  const ean = (line.ean ?? "").trim() || "—";
  const colorRaw = (line.color_name ?? "").trim();
  const title = `${line.quantity}x ${line.product_name}`;

  return (
    <div
      role={onProductClick ? "button" : undefined}
      tabIndex={onProductClick ? 0 : undefined}
      className={[
        "relative flex min-w-[12.5rem] max-w-[20rem] shrink-0 items-start gap-3 text-left sm:min-w-[14rem]",
        packed ? "opacity-[0.72]" : "",
        onProductClick ? "cursor-pointer rounded-md outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-slate-400" : "",
      ].join(" ")}
      onClick={(e) => {
        if (!onProductClick) return;
        e.stopPropagation();
        onProductClick(line.order_item_id);
      }}
      onKeyDown={(e) => {
        if (!onProductClick) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          onProductClick(line.order_item_id);
        }
      }}
    >
      <div className="relative shrink-0" style={{ width: IMG, height: IMG }}>
        {packed ? (
          <span
            className="absolute -top-1 left-1/2 z-[1] flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full bg-[#4CAF50] text-sm font-bold text-white shadow-md ring-2 ring-white"
            aria-hidden
          >
            ✓
          </span>
        ) : null}
        <div
          className="flex h-full w-full items-center justify-center overflow-hidden rounded-lg"
          style={{ width: IMG, height: IMG }}
        >
          {line.image_url ? (
            <img src={line.image_url} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
          ) : (
            <span className="text-sm text-slate-300">—</span>
          )}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 leading-snug">
        {packed ? (
          <span className="inline-flex w-fit max-w-full items-center rounded-md border-2 border-emerald-400 bg-emerald-100 px-3 py-1.5 text-sm font-bold leading-tight text-emerald-900 shadow-sm">
            Spakowane {line.quantity_packed}/{line.quantity}
          </span>
        ) : null}
        <p className="text-[15px] font-bold leading-snug text-[#1a1a1a] line-clamp-3 sm:text-base">{title}</p>
        <p className="mt-1 text-[13px] leading-snug text-[#555]">EAN: {ean}</p>
        {colorRaw ? (
          <p className="mt-0.5 text-[13px] leading-snug text-[#555]">Kolor: {colorRaw}</p>
        ) : null}
      </div>
    </div>
  );
}

function lineEqual(a: WmsPackingOrderLineApi, b: WmsPackingOrderLineApi): boolean {
  return (
    a.order_item_id === b.order_item_id &&
    a.quantity === b.quantity &&
    a.quantity_packed === b.quantity_packed &&
    a.product_name === b.product_name &&
    a.ean === b.ean &&
    a.color_name === b.color_name &&
    a.image_url === b.image_url
  );
}

function equal(a: ProductInlineItemProps, b: ProductInlineItemProps): boolean {
  return lineEqual(a.line, b.line) && a.onProductClick === b.onProductClick;
}

export const ProductInlineItem = memo(ProductInlineItemInner, equal);
