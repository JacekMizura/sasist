import { memo, type MouseEvent } from "react";
import { Mail } from "lucide-react";
import type { WmsPackingOrderCardApi, WmsPackingOrderLineApi } from "../../../../api/wmsPackingApi";
import { ShippingMethodLogo } from "../../../../components/shipping/ShippingMethodLogo";
import { shippingMethodLogoForDisplay } from "../../../../utils/shippingMethodLogoUrl";
import { filterPackingOperationalNotes, packingNotesAlertTitle } from "../packingNotes";
import { lineQuantityRequired } from "../packingHelpers";

export type ExpandedVerticalOrderCardProps = {
  order: WmsPackingOrderCardApi;
  showBasketCode?: boolean;
  showAllNotes?: boolean;
  onOpenOrder: (orderId: number) => void;
  onProductClick?: (orderItemId: number, orderId: number) => void;
};

const THUMB = 56;
const MAX_FULL = 5;
const SHOWN = 4;

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

function documentFaBadge(order: WmsPackingOrderCardApi): string | null {
  const prefix = (order.document_prefix ?? "").trim();
  if (prefix) return prefix;
  const label = (order.sales_document_label ?? "").trim();
  if (!label) return null;
  const m = label.match(/^(Fa|Pa)\b/i);
  if (m) return m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1).toLowerCase();
  return "Fa";
}

function IconPin() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className="shrink-0 text-emerald-600" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"
      />
    </svg>
  );
}

function IconDocument({ generated }: { generated: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      className={generated ? "shrink-0 text-emerald-600" : "shrink-0 text-slate-400"}
      aria-hidden
    >
      <path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
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

function IconPersonalPickup() {
  return (
    <svg width="28" height="28" viewBox="0 0 48 48" fill="none" className="shrink-0 text-slate-800" aria-hidden>
      <circle cx="24" cy="12" r="6" stroke="currentColor" strokeWidth="2.2" />
      <path
        d="M12 36c0-6.627 5.373-12 12-12s12 5.373 12 12"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <rect x="30" y="28" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function CarrierZone({ order }: { order: WmsPackingOrderCardApi }) {
  if (isPersonalPickup(order.shipping_method)) {
    return (
      <div className="flex shrink-0 flex-col items-start justify-center gap-0.5">
        <IconPersonalPickup />
        <span className="max-w-[5.5rem] text-[9px] font-extrabold uppercase leading-tight tracking-wide text-slate-900">
          Odbiór osobisty
        </span>
      </div>
    );
  }

  const src = shippingMethodLogoForDisplay(order.shipping_method_logo_url, order.shipping_method);
  const brand = !src ? brandFallbackMark(order.shipping_method) : null;

  return (
    <div className="flex h-10 shrink-0 items-center">
      {brand === "ups" ? (
        <span className="rounded bg-[#351C15] px-1.5 py-1 text-[11px] font-black tracking-wide text-[#FFB500]">
          UPS
        </span>
      ) : brand === "dachser" ? (
        <span className="text-[9px] font-extrabold uppercase leading-tight text-[#003399]">Dachser</span>
      ) : (
        <ShippingMethodLogo
          logoUrl={order.shipping_method_logo_url}
          methodName={order.shipping_method}
          size="sm"
          className="!self-center"
        />
      )}
    </div>
  );
}

function ProductCell({
  line,
  onProductClick,
  withSeparator,
}: {
  line: WmsPackingOrderLineApi;
  onProductClick?: (orderItemId: number) => void;
  withSeparator: boolean;
}) {
  const qtyReq = lineQuantityRequired(line);
  const packed = qtyReq > 0 && line.quantity_packed >= qtyReq;
  const ean = (line.ean ?? "").trim() || "—";
  const colorRaw = (line.color_name ?? "").trim();
  const name = (line.product_name ?? "").trim() || "—";

  const stopX = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      role={onProductClick ? "button" : undefined}
      tabIndex={onProductClick ? 0 : undefined}
      className={[
        "relative flex min-w-[13rem] max-w-[18rem] shrink-0 items-start gap-3 py-1 pr-4",
        withSeparator ? "border-r border-slate-200" : "",
        packed ? "opacity-[0.55]" : "",
        onProductClick ? "cursor-pointer outline-none hover:bg-slate-50/70" : "",
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
      <div
        className="flex shrink-0 items-center justify-center overflow-hidden"
        style={{ width: THUMB, height: THUMB }}
      >
        {line.image_url ? (
          <img src={line.image_url} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
        ) : (
          <span className="text-xs text-slate-300">—</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {packed ? (
          <div className="mb-1 flex items-center gap-1.5">
            <IconPackedCheck />
            <span className="truncate text-xs font-semibold text-[#4CAF50]">
              Spakowane {line.quantity_packed}/{qtyReq}
            </span>
            <button type="button" className="ml-auto shrink-0" aria-label="Zamknij" onClick={stopX}>
              <IconPackedClose />
            </button>
          </div>
        ) : null}
        <p className="text-[13px] leading-snug text-slate-900 sm:text-sm">
          <span className="font-extrabold tabular-nums">{line.quantity}x</span>{" "}
          <span className="font-medium">{name}</span>
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-500">EAN: {ean}</p>
        {colorRaw ? <p className="text-[11px] leading-snug text-slate-500">Kolor: {colorRaw}</p> : null}
      </div>
    </div>
  );
}

function ExpandedVerticalOrderCardInner({
  order,
  showBasketCode,
  showAllNotes = true,
  onOpenOrder,
  onProductClick,
}: ExpandedVerticalOrderCardProps) {
  const rawNum = order.number.replace(/^#/, "").trim();
  const pq = order.packed_quantity;
  const tq = order.total_quantity;
  const fa = documentFaBadge(order);
  const docGenerated = Boolean((order.sales_document_label ?? "").trim()) || Boolean(fa);
  const showCustomerComm =
    Boolean((order.customer_comment ?? "").trim()) || Boolean((order.staff_notes ?? "").trim());
  const opsPacking = filterPackingOperationalNotes(order.operational_notes_packing, showAllNotes);
  const showOps = opsPacking.length > 0;
  const alertTitle = packingNotesAlertTitle(opsPacking, order.wms_operational_alert_title);

  const lines = order.lines;
  const overflow = lines.length > MAX_FULL ? Math.max(0, lines.length - SHOWN) : 0;
  const visible = overflow > 0 ? lines.slice(0, SHOWN) : lines;

  const productHandler = onProductClick
    ? (orderItemId: number) => onProductClick(orderItemId, order.order_id)
    : undefined;

  const labelCls = "text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-400";

  return (
    <div className="w-full rounded-lg border border-slate-200 bg-white">
      {alertTitle ? (
        <div className="rounded-t-lg border-b border-amber-300/90 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-950" role="status">
          <span aria-hidden>⚠ </span>
          {alertTitle}
        </div>
      ) : null}

      <div
        role="button"
        tabIndex={0}
        className="cursor-pointer px-5 py-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400"
        onClick={() => onOpenOrder(order.order_id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenOrder(order.order_id);
          }
        }}
      >
        <div className="flex w-max max-w-full flex-wrap items-start gap-x-5 gap-y-2">
          <div className="min-w-0">
            <div className={labelCls}>Nr zamówienia</div>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5">
              <IconDocument generated={docGenerated} />
              {showOps ? <IconPin /> : null}
              {showCustomerComm ? <Mail className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2} aria-hidden /> : null}
              <span className="truncate text-xl font-extrabold tabular-nums leading-none tracking-tight text-slate-900">
                {rawNum}
              </span>
              {fa ? (
                <span className="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-bold leading-none text-white bg-[#42A5F5]">
                  {fa}
                </span>
              ) : null}
              {showBasketCode && order.basket_code?.trim() ? (
                <span className="truncate text-[10px] font-semibold text-slate-500">[{order.basket_code.trim()}]</span>
              ) : null}
            </div>
          </div>

          <div className="shrink-0">
            <div className={labelCls}>Spakowano</div>
            <div className="mt-0.5 text-xl font-extrabold tabular-nums leading-none tracking-tight text-slate-900">
              {pq}/{tq}
            </div>
          </div>

          <div className="flex items-end self-end pb-0.5">
            <CarrierZone order={order} />
          </div>
        </div>

        <div className="mt-4 min-w-0 overflow-hidden">
          <div className="flex min-w-0 flex-nowrap items-start gap-0 overflow-x-auto overflow-y-visible pb-0.5 [-webkit-overflow-scrolling:touch]">
            {visible.map((line, idx) => (
              <ProductCell
                key={line.order_item_id}
                line={line}
                onProductClick={productHandler}
                withSeparator={idx < visible.length - 1 || overflow > 0}
              />
            ))}
            {overflow > 0 ? (
              <div className="flex h-[4.5rem] min-w-[5.5rem] shrink-0 items-center justify-center self-center pl-2">
                <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800">
                  +{overflow} innych
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function orderEqual(a: WmsPackingOrderCardApi, b: WmsPackingOrderCardApi): boolean {
  if (a.order_id !== b.order_id) return false;
  if (a.number !== b.number || a.packed_quantity !== b.packed_quantity || a.total_quantity !== b.total_quantity)
    return false;
  if (a.shipping_method !== b.shipping_method) return false;
  if ((a.shipping_method_logo_url ?? "") !== (b.shipping_method_logo_url ?? "")) return false;
  if (a.basket_code !== b.basket_code) return false;
  if ((a.customer_comment ?? "") !== (b.customer_comment ?? "")) return false;
  if ((a.staff_notes ?? "") !== (b.staff_notes ?? "")) return false;
  if ((a.sales_document_label ?? "") !== (b.sales_document_label ?? "")) return false;
  if ((a.document_prefix ?? "") !== (b.document_prefix ?? "")) return false;
  if ((a.wms_operational_alert_title ?? "") !== (b.wms_operational_alert_title ?? "")) return false;
  if ((a.operational_notes_packing?.length ?? 0) !== (b.operational_notes_packing?.length ?? 0)) return false;
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
      x.color_name !== y.color_name ||
      x.image_url !== y.image_url
    )
      return false;
  }
  return true;
}

function equal(a: ExpandedVerticalOrderCardProps, b: ExpandedVerticalOrderCardProps): boolean {
  return (
    orderEqual(a.order, b.order) &&
    a.showBasketCode === b.showBasketCode &&
    a.showAllNotes === b.showAllNotes &&
    a.onOpenOrder === b.onOpenOrder &&
    a.onProductClick === b.onProductClick
  );
}

export const ExpandedVerticalOrderCard = memo(ExpandedVerticalOrderCardInner, equal);
