import { memo, type MouseEvent } from "react";
import type { WmsPackingOrderCardApi, WmsPackingOrderLineApi } from "../../../../api/wmsPackingApi";
import { ShippingMethodLogo } from "../../../../components/shipping/ShippingMethodLogo";
import { shippingMethodLogoForDisplay } from "../../../../utils/shippingMethodLogoUrl";
import { lineQuantityRequired } from "../packingHelpers";
import {
  DEFAULT_ORDERS_LIST_PRODUCT_FIELDS,
  OrdersListProductMeta,
  OrdersListProductThumb,
  formatOrdersListProductName,
  ordersListProductFieldsEqual,
  type OrdersListProductFieldVisibility,
} from "./ordersListProductFields";

export type ExpandedHorizontalOrderCardProps = {
  order: WmsPackingOrderCardApi;
  onOpenOrder: (orderId: number) => void;
  onProductClick?: (orderItemId: number, orderId: number) => void;
  /** Ile produktów pokazać przed „+N innych” (jak mock). */
  maxVisibleLines?: number;
  productFields?: OrdersListProductFieldVisibility;
};

const CARD_WIDTH = "18.75rem"; // ~300px — proporcje jak na mocku
const THUMB = 52;
const DEFAULT_VISIBLE = 4;

function isFullyPacked(order: WmsPackingOrderCardApi): boolean {
  if (order.is_completed === true) return true;
  const t = Number(order.total_quantity || 0);
  const p = Number(order.packed_quantity || 0);
  return t > 0 && p >= t;
}

function isPersonalPickup(method: string | null | undefined): boolean {
  const s = (method || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!s.trim()) return false;
  if (s.includes("odbior") && s.includes("osobist")) return true;
  if (s.includes("personal pickup") || s.includes("odbior osobisty")) return true;
  return false;
}

function brandFallbackMark(method: string | null | undefined): "ups" | "dachser" | null {
  const s = (method || "").toLowerCase();
  if (s.includes("ups")) return "ups";
  if (s.includes("dachser")) return "dachser";
  return null;
}

function lineShortageQty(line: WmsPackingOrderLineApi): number {
  const req = lineQuantityRequired(line);
  const missing = Number(line.missing_quantity ?? 0);
  if (missing > 0) return Math.min(missing, req);
  if (line.stock_quantity != null && Number.isFinite(line.stock_quantity) && line.stock_quantity < req) {
    return Math.max(0, req - Math.max(0, Math.floor(line.stock_quantity)));
  }
  return 0;
}

function orderHasShortage(order: WmsPackingOrderCardApi): boolean {
  return order.lines.some((l) => lineShortageQty(l) > 0);
}

function IconOrderBox({ muted }: { muted?: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      className={muted ? "shrink-0 text-slate-400" : "shrink-0 text-emerald-600"}
      aria-hidden
    >
      <path
        d="M21 8l-9-5-9 5v8l9 5 9-5V8z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M3 8l9 5 9-5M12 13v10" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <circle cx="17.5" cy="7.5" r="2.25" fill="currentColor" />
    </svg>
  );
}

function IconPackedCheck() {
  return (
    <span
      className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#4CAF50] text-white"
      aria-hidden
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
        <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function IconPackedClose() {
  return (
    <span
      className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#E53935] text-white"
      aria-hidden
    >
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function IconPersonalPickup({ muted }: { muted?: boolean }) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 48 48"
      fill="none"
      className={muted ? "shrink-0 text-slate-400" : "shrink-0 text-slate-800"}
      aria-hidden
    >
      <circle cx="24" cy="12" r="6" stroke="currentColor" strokeWidth="2.2" />
      <path
        d="M12 36c0-6.627 5.373-12 12-12s12 5.373 12 12"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <rect x="30" y="28" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <path d="M30 31h12M36 28v10" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function CarrierZone({ order, muted }: { order: WmsPackingOrderCardApi; muted?: boolean }) {
  if (isPersonalPickup(order.shipping_method)) {
    return (
      <div
        className={`flex shrink-0 flex-col items-start justify-center gap-0.5 ${muted ? "opacity-50 grayscale" : ""}`}
      >
        <IconPersonalPickup muted={muted} />
        <span
          className={`max-w-[4.75rem] text-[8px] font-extrabold uppercase leading-tight tracking-wide ${
            muted ? "text-slate-400" : "text-slate-900"
          }`}
        >
          Odbiór osobisty
        </span>
      </div>
    );
  }

  const src = shippingMethodLogoForDisplay(order.shipping_method_logo_url, order.shipping_method);
  const brand = !src ? brandFallbackMark(order.shipping_method) : null;

  return (
    <div className={`flex h-9 shrink-0 items-center ${muted ? "opacity-50 grayscale" : ""}`}>
      {brand === "ups" ? (
        <span className="rounded bg-[#351C15] px-1.5 py-0.5 text-[10px] font-black tracking-wide text-[#FFB500]">
          UPS
        </span>
      ) : brand === "dachser" ? (
        <span className="text-[8px] font-extrabold uppercase leading-tight tracking-tight text-[#003399]">
          Dachser
        </span>
      ) : (
        <ShippingMethodLogo
          logoUrl={order.shipping_method_logo_url}
          methodName={order.shipping_method}
          size="xs"
          className="!self-center"
        />
      )}
    </div>
  );
}

function ProductLineRow({
  line,
  mutedCard,
  onProductClick,
  productFields,
}: {
  line: WmsPackingOrderLineApi;
  mutedCard: boolean;
  onProductClick?: (orderItemId: number) => void;
  productFields: OrdersListProductFieldVisibility;
}) {
  const qtyReq = lineQuantityRequired(line);
  const packed = qtyReq > 0 && line.quantity_packed >= qtyReq;
  const shortage = lineShortageQty(line);
  const colorRaw = (line.color_name ?? "").trim();
  const name = formatOrdersListProductName(line.product_name, productFields.truncateNames);

  const stopX = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      role={onProductClick ? "button" : undefined}
      tabIndex={onProductClick ? 0 : undefined}
      className={[
        "flex items-start gap-2.5 border-b border-slate-100 py-2.5 last:border-b-0",
        !mutedCard && packed ? "opacity-55" : "",
        onProductClick ? "cursor-pointer outline-none hover:bg-slate-50/80" : "",
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
      <OrdersListProductThumb line={line} size={THUMB} show={productFields.showImage} />
      <div className="min-w-0 flex-1">
        {packed ? (
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <IconPackedCheck />
              <span className="truncate text-xs font-semibold text-slate-500">
                Spakowane {line.quantity_packed}/{qtyReq}
              </span>
            </div>
            <button type="button" className="shrink-0" aria-label="Zamknij" onClick={stopX}>
              <IconPackedClose />
            </button>
          </div>
        ) : null}
        <p className="text-[13px] leading-snug text-slate-900">
          <span className="font-extrabold tabular-nums">{line.quantity}x</span>{" "}
          <span className="font-medium">{name}</span>
        </p>
        <OrdersListProductMeta line={line} fields={productFields} />
        {colorRaw ? <p className="text-[11px] leading-snug text-slate-500">Kolor: {colorRaw}</p> : null}
        {shortage > 0 && !packed ? (
          <span className="mt-1.5 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold leading-none text-white bg-[#E53935]">
            Brak {shortage}/{qtyReq}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ExpandedHorizontalOrderCardInner({
  order,
  onOpenOrder,
  onProductClick,
  maxVisibleLines = DEFAULT_VISIBLE,
  productFields = DEFAULT_ORDERS_LIST_PRODUCT_FIELDS,
}: ExpandedHorizontalOrderCardProps) {
  const done = isFullyPacked(order);
  const shortage = orderHasShortage(order);
  const pq = order.packed_quantity;
  const tq = order.total_quantity;
  const rawNum = order.number.replace(/^#/, "").trim();
  const lines = order.lines;
  const overflow = lines.length > maxVisibleLines ? lines.length - maxVisibleLines : 0;
  const visible = overflow > 0 ? lines.slice(0, maxVisibleLines) : lines;
  const labelCls = "text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-400";

  const productHandler = onProductClick
    ? (orderItemId: number) => onProductClick(orderItemId, order.order_id)
    : undefined;

  return (
    <div
      role="button"
      tabIndex={0}
      style={{ width: CARD_WIDTH, minWidth: CARD_WIDTH }}
      className={[
        "flex h-full shrink-0 cursor-pointer flex-col rounded-lg bg-white px-5 py-4 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-slate-400",
        shortage && !done ? "border border-[#E53935]" : "border border-slate-200",
        done ? "opacity-[0.5]" : "hover:border-slate-300",
      ].join(" ")}
      onClick={() => onOpenOrder(order.order_id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenOrder(order.order_id);
        }
      }}
    >
      <div className="flex w-max max-w-full flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0">
          <div className={labelCls}>Nr zamówienia</div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
            <IconOrderBox muted={done} />
            <span className="truncate text-lg font-extrabold tabular-nums leading-none tracking-tight text-slate-900">
              {rawNum}
            </span>
          </div>
        </div>

        <div className="shrink-0">
          <div className={labelCls}>Spakowano</div>
          <div className="mt-0.5">
            {done ? (
              <div className="flex items-center gap-1">
                <IconPackedCheck />
                <span className="text-xs font-semibold text-slate-500">
                  Spakowane {pq}/{tq}
                </span>
              </div>
            ) : (
              <div className="text-lg font-extrabold tabular-nums leading-none tracking-tight text-slate-900">
                {pq}/{tq}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-end self-end pb-0.5">
          <CarrierZone order={order} muted={done} />
        </div>
      </div>

      <div className="mt-2 min-h-0 flex-1 border-t border-slate-100">
        {visible.map((line) => (
          <ProductLineRow
            key={line.order_item_id}
            line={line}
            mutedCard={done}
            onProductClick={productHandler}
            productFields={productFields}
          />
        ))}
        {overflow > 0 ? (
          <div className="flex justify-end pb-1 pt-2">
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700">
              +{overflow} innych
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function orderEqual(a: WmsPackingOrderCardApi, b: WmsPackingOrderCardApi): boolean {
  if (a.order_id !== b.order_id) return false;
  if (a.number !== b.number || a.packed_quantity !== b.packed_quantity || a.total_quantity !== b.total_quantity)
    return false;
  if (a.is_completed !== b.is_completed) return false;
  if (a.shipping_method !== b.shipping_method) return false;
  if ((a.shipping_method_logo_url ?? "") !== (b.shipping_method_logo_url ?? "")) return false;
  if (a.lines.length !== b.lines.length) return false;
  for (let i = 0; i < a.lines.length; i++) {
    const x = a.lines[i]!;
    const y = b.lines[i]!;
    if (
      x.order_item_id !== y.order_item_id ||
      x.quantity !== y.quantity ||
      x.quantity_packed !== y.quantity_packed ||
      x.product_name !== y.product_name ||
      x.ean !== y.ean ||
      x.sku !== y.sku ||
      x.product_symbol !== y.product_symbol ||
      x.catalog_number !== y.catalog_number ||
      x.color_name !== y.color_name ||
      x.image_url !== y.image_url ||
      x.stock_quantity !== y.stock_quantity ||
      x.missing_quantity !== y.missing_quantity
    )
      return false;
  }
  return true;
}

function equal(a: ExpandedHorizontalOrderCardProps, b: ExpandedHorizontalOrderCardProps): boolean {
  return (
    orderEqual(a.order, b.order) &&
    ordersListProductFieldsEqual(a.productFields, b.productFields) &&
    a.onOpenOrder === b.onOpenOrder &&
    a.onProductClick === b.onProductClick &&
    (a.maxVisibleLines ?? DEFAULT_VISIBLE) === (b.maxVisibleLines ?? DEFAULT_VISIBLE)
  );
}

export const ExpandedHorizontalOrderCard = memo(ExpandedHorizontalOrderCardInner, equal);
