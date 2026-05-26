import { memo } from "react";
import type { CSSProperties } from "react";
import { Mail } from "lucide-react";
import type { WmsPackingOrderCardApi } from "../../../../api/wmsPackingApi";
import { ShippingMethodLogo } from "../../../../components/shipping/ShippingMethodLogo";
import { ProductInlineItem } from "./ProductInlineItem";
import { ProductOverflow } from "./ProductOverflow";

/** Grid: [80px logo] [140px order] [1fr products] [80px status] */
const ROW_GRID =
  "grid w-full min-w-0 grid-cols-[80px_140px_minmax(0,1fr)_80px] gap-x-2 items-center sm:gap-x-3";

/** Ile produktów w pełnym rozmiarze; reszta → „+N innych”. */
const MAX_FULL_STRIP = 5;
const SHOWN_BEFORE_OVERFLOW = 4;

const ORANGE_PACK = "#FF9800";

function IconPin() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" className="shrink-0 text-[#E53935]" aria-hidden>
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
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      className={generated ? "shrink-0 text-[#4CAF50]" : "shrink-0 text-slate-400"}
      aria-label={generated ? "Dokument wygenerowany" : "Dokument nie wygenerowany"}
      role="img"
    >
      <path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export type OrderRowProps = {
  order: WmsPackingOrderCardApi;
  showBasketCode?: boolean;
  onOpenOrder: (orderId: number) => void;
  onProductClick?: (orderItemId: number, orderId: number) => void;
};

/** Compact 0/x badge (~28px row, ~14px figures) for trailing grid column */
function packedRatioBadgeClassCompact(packed: number, total: number): string {
  const base =
    "inline-flex h-7 min-w-[3rem] max-w-full items-center justify-center rounded-md px-2 text-sm font-black tabular-nums leading-none tracking-tight";
  if (total <= 0) return `${base} bg-slate-50 text-slate-700`;
  if (packed === 0) return `${base} text-white shadow-sm`;
  if (packed < total) return `${base} bg-blue-600 text-white shadow-sm`;
  return `${base} bg-green-600 text-white shadow-sm`;
}

function packedRatioBadgeStyle(packed: number, total: number): CSSProperties | undefined {
  if (total > 0 && packed === 0) return { background: ORANGE_PACK };
  return undefined;
}

function OrderRowInner({ order, showBasketCode, onOpenOrder, onProductClick }: OrderRowProps) {
  const rawNum = order.number.replace(/^#/, "").trim();
  const docGenerated = Boolean((order.sales_document_label ?? "").trim());
  const showCustomerComm =
    Boolean((order.customer_comment ?? "").trim()) || Boolean((order.staff_notes ?? "").trim());
  const opsPacking = order.operational_notes_packing ?? [];
  const showOps = opsPacking.length > 0;
  const alertTitle = (order.wms_operational_alert_title ?? "").trim();

  const pq = order.packed_quantity;
  const tq = order.total_quantity;
  const ratioCls = packedRatioBadgeClassCompact(pq, tq);
  const ratioStyle = packedRatioBadgeStyle(pq, tq);

  const lines = order.lines;
  const overflow =
    lines.length > MAX_FULL_STRIP ? Math.max(0, lines.length - SHOWN_BEFORE_OVERFLOW) : 0;
  const visibleLines = overflow > 0 ? lines.slice(0, SHOWN_BEFORE_OVERFLOW) : lines;

  const productHandler = onProductClick
    ? (orderItemId: number) => onProductClick(orderItemId, order.order_id)
    : undefined;

  return (
    <div
      className={
        alertTitle
          ? "border-b border-slate-200/70 bg-white last:border-b-0"
          : "border-b border-slate-200/70 bg-white last:border-b-0"
      }
    >
      {alertTitle ? (
        <div
          className="border-b border-amber-300/90 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950"
          role="status"
        >
          <span aria-hidden>⚠ </span>
          {alertTitle}
        </div>
      ) : null}
      <div
        role="button"
        tabIndex={0}
        className={`${ROW_GRID} min-h-[5.5rem] cursor-pointer py-4 pl-3 pr-3 outline-none hover:bg-[#fafbfc] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400 sm:min-h-[6rem] sm:py-5 sm:pl-4 sm:pr-4`}
        onClick={() => onOpenOrder(order.order_id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenOrder(order.order_id);
          }
        }}
      >
      <div className="flex h-full w-20 items-center justify-center self-stretch">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center">
          <ShippingMethodLogo
            logoUrl={order.shipping_method_logo_url}
            methodName={order.shipping_method}
            size="listRow"
          />
        </div>
      </div>

      <div className="min-w-0 justify-self-stretch">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <span className="truncate text-base font-extrabold tabular-nums tracking-tight text-[#111] sm:text-lg">
            #{rawNum}
          </span>
          <IconDocument generated={docGenerated} />
          {showOps ? <IconPin /> : null}
          {showCustomerComm ? <Mail className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2} aria-hidden /> : null}
          {showBasketCode && order.basket_code?.trim() ? (
            <span className="truncate text-[10px] font-semibold text-slate-500 sm:text-[11px]">
              [{order.basket_code.trim()}]
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[10px] font-semibold uppercase leading-snug tracking-wide text-[#666]">
          {(order.shipping_method ?? "").trim() || "—"}
        </p>
      </div>

      <div className="min-w-0 overflow-hidden">
        <div className="flex min-w-0 flex-nowrap items-center gap-3 overflow-x-auto overflow-y-visible py-1 [-webkit-overflow-scrolling:touch] sm:gap-4">
          {visibleLines.map((line) => (
            <ProductInlineItem key={line.order_item_id} line={line} onProductClick={productHandler} />
          ))}
          {overflow > 0 ? <ProductOverflow count={overflow} /> : null}
        </div>
      </div>

      <div className="flex h-full items-center justify-center justify-self-stretch">
        <span className={ratioCls} style={ratioStyle}>
          {pq}/{tq}
        </span>
      </div>
    </div>
    </div>
  );
}

function orderEqual(a: WmsPackingOrderCardApi, b: WmsPackingOrderCardApi): boolean {
  if (a.order_id !== b.order_id) return false;
  if (a.number !== b.number || a.packed_quantity !== b.packed_quantity || a.total_quantity !== b.total_quantity) return false;
  if (a.shipping_method !== b.shipping_method) return false;
  if ((a.shipping_method_logo_url ?? "") !== (b.shipping_method_logo_url ?? "")) return false;
  if (a.basket_code !== b.basket_code) return false;
  if ((a.customer_comment ?? "") !== (b.customer_comment ?? "")) return false;
  if ((a.staff_notes ?? "") !== (b.staff_notes ?? "")) return false;
  if ((a.wms_operational_alert_title ?? "") !== (b.wms_operational_alert_title ?? "")) return false;
  if ((a.operational_notes_packing?.length ?? 0) !== (b.operational_notes_packing?.length ?? 0)) return false;
  if ((a.sales_document_label ?? "") !== (b.sales_document_label ?? "")) return false;
  if ((a.document_prefix ?? "") !== (b.document_prefix ?? "")) return false;
  const ast = a.order_ui_status;
  const bst = b.order_ui_status;
  if ((ast == null) !== (bst == null)) return false;
  if (ast && bst && (ast.name !== bst.name || ast.color !== bst.color || ast.main_group !== bst.main_group)) return false;
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
      x.image_url !== y.image_url ||
      x.stock_quantity !== y.stock_quantity
    )
      return false;
  }
  return true;
}

function equal(a: OrderRowProps, b: OrderRowProps): boolean {
  return (
    orderEqual(a.order, b.order) &&
    a.showBasketCode === b.showBasketCode &&
    a.onOpenOrder === b.onOpenOrder &&
    a.onProductClick === b.onProductClick
  );
}

export const OrderRow = memo(OrderRowInner, equal);
