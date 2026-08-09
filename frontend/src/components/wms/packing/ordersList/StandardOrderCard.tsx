import { memo, type MouseEvent } from "react";
import type { WmsPackingOrderCardApi } from "../../../../api/wmsPackingApi";
import { ShippingMethodLogo } from "../../../../components/shipping/ShippingMethodLogo";
import { shippingMethodLogoForDisplay } from "../../../../utils/shippingMethodLogoUrl";

export type StandardOrderCardProps = {
  order: WmsPackingOrderCardApi;
  onOpenOrder: (orderId: number) => void;
  /** Opcjonalnie — tylko gdy API/listę już ma klienta (bez zmiany kontraktu). */
  customerName?: string | null;
};

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

function documentFaBadge(order: WmsPackingOrderCardApi): string | null {
  const prefix = (order.document_prefix ?? "").trim();
  if (prefix) return prefix;
  const label = (order.sales_document_label ?? "").trim();
  if (!label) return null;
  const m = label.match(/^(Fa|Pa)\b/i);
  if (m) return m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1).toLowerCase();
  return "Fa";
}

function IconOrderBox({ muted }: { muted?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
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
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#4CAF50] text-white"
      aria-hidden
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function IconPackedClose() {
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E53935] text-white"
      aria-hidden
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function IconPersonalPickup({ muted }: { muted?: boolean }) {
  return (
    <svg
      width="28"
      height="28"
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

function brandFallbackMark(method: string | null | undefined): "ups" | "dachser" | null {
  const s = (method || "").toLowerCase();
  if (s.includes("ups")) return "ups";
  if (s.includes("dachser")) return "dachser";
  return null;
}

function CarrierZone({
  order,
  muted,
}: {
  order: WmsPackingOrderCardApi;
  muted?: boolean;
}) {
  if (isPersonalPickup(order.shipping_method)) {
    return (
      <div
        className={`flex shrink-0 flex-col items-start justify-center gap-0.5 ${muted ? "opacity-45 grayscale" : ""}`}
      >
        <IconPersonalPickup muted={muted} />
        <span
          className={`max-w-[5.5rem] text-[9px] font-extrabold uppercase leading-tight tracking-wide ${
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
    <div className={`flex h-11 shrink-0 items-center ${muted ? "opacity-45 grayscale" : ""}`}>
      {brand === "ups" ? (
        <span className="rounded bg-[#351C15] px-1.5 py-1 text-[11px] font-black tracking-wide text-[#FFB500]">
          UPS
        </span>
      ) : brand === "dachser" ? (
        <span className="text-[9px] font-extrabold uppercase leading-tight tracking-tight text-[#003399]">
          Dachser
        </span>
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

function StandardOrderCardInner({ order, onOpenOrder, customerName }: StandardOrderCardProps) {
  const packed = isFullyPacked(order);
  const pq = order.packed_quantity;
  const tq = order.total_quantity;
  const rawNum = order.number.replace(/^#/, "").trim();
  const fa = documentFaBadge(order);
  const customer =
    (customerName ?? "").trim() ||
    (typeof (order as { customer_name?: string }).customer_name === "string"
      ? (order as { customer_name?: string }).customer_name!.trim()
      : "");

  const labelCls = "text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-400";
  const mutedBody = packed ? "opacity-45 grayscale" : "";

  const onDismissClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className="flex w-[17.5rem] max-w-full min-h-[5.75rem] cursor-pointer flex-col rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none transition-colors hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-slate-400"
      onClick={() => onOpenOrder(order.order_id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenOrder(order.order_id);
        }
      }}
    >
      {packed ? (
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <IconPackedCheck />
            <span className="truncate text-xs font-semibold text-slate-500">
              Spakowane {pq}/{tq}
            </span>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
            aria-label="Zamknij podgląd spakowanego"
            onClick={onDismissClick}
          >
            <IconPackedClose />
          </button>
        </div>
      ) : null}

      {/* Zwarty blok: nr | spakowano | przewoźnik — bez rozciągania na szerokość karty */}
      <div className="flex w-max max-w-full flex-wrap items-start gap-x-4 gap-y-2">
        <div className={`min-w-0 ${mutedBody}`}>
          <div className={labelCls}>Nr zamówienia</div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
            <IconOrderBox muted={packed} />
            <span className="truncate text-lg font-extrabold tabular-nums leading-none tracking-tight text-slate-900">
              {rawNum}
            </span>
            {fa ? (
              <span className="inline-flex shrink-0 items-center rounded px-1 py-0.5 text-[10px] font-bold leading-none text-white bg-[#4CAF50]">
                {fa}
              </span>
            ) : null}
          </div>
          {customer ? (
            <p className="mt-1.5 truncate text-xs text-slate-500">
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle" aria-hidden />
              {customer}
            </p>
          ) : null}
        </div>

        <div className={`shrink-0 ${mutedBody}`}>
          <div className={labelCls}>Spakowano</div>
          <div className="mt-0.5 text-xl font-extrabold tabular-nums leading-none tracking-tight text-slate-900">
            {pq}/{tq}
          </div>
        </div>

        <div className="flex items-end self-end pb-0.5">
          <CarrierZone order={order} muted={packed} />
        </div>
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
  if ((a.sales_document_label ?? "") !== (b.sales_document_label ?? "")) return false;
  if ((a.document_prefix ?? "") !== (b.document_prefix ?? "")) return false;
  return true;
}

function equal(a: StandardOrderCardProps, b: StandardOrderCardProps): boolean {
  return (
    orderEqual(a.order, b.order) &&
    a.onOpenOrder === b.onOpenOrder &&
    (a.customerName ?? "") === (b.customerName ?? "")
  );
}

export const StandardOrderCard = memo(StandardOrderCardInner, equal);
