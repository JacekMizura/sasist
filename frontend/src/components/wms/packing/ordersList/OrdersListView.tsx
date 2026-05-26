import type { CSSProperties } from "react";
import type { WmsPackingOrderCardApi } from "../../../../api/wmsPackingApi";
import { computeOrdersListStats } from "./ordersListStats";
import { OrderRow } from "./OrderRow";
import { StatusBadges } from "./StatusBadges";

function IconBack() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export type OrdersListViewProps = {
  orders: WmsPackingOrderCardApi[];
  loading: boolean;
  error: string | null;
  showBasketCode?: boolean;
  onOpenOrder: (orderId: number) => void;
  onProductClick?: (orderItemId: number, orderId: number) => void;
  onBack: () => void;
  cartLine?: { mode: "bulk" | "baskets"; code: string } | null;
  statusLabelRight: string;
  /** Styl badge statusu (sesja) — prawa strona nagłówka. */
  statusBadgeStyle: CSSProperties;
};

export function OrdersListView({
  orders,
  loading,
  error,
  showBasketCode,
  onOpenOrder,
  onProductClick,
  onBack,
  cartLine,
  statusLabelRight,
  statusBadgeStyle,
}: OrdersListViewProps) {
  const n = orders.length;
  const stats = computeOrdersListStats(orders);

  const cartHint =
    cartLine != null && cartLine.code.trim() !== "" ? (
      <span className="hidden min-w-0 max-w-[10rem] shrink truncate text-xs font-semibold text-slate-600 md:inline lg:max-w-[14rem] lg:text-sm">
        {cartLine.mode === "baskets" ? "Wózek z koszykami: " : "Wózek: "}
        <span className="text-slate-900">{cartLine.code}</span>
      </span>
    ) : null;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-white">
      <div className="sticky top-0 z-20 shrink-0 border-b border-slate-200/90 bg-white/95 px-3 py-3 shadow-sm backdrop-blur-md sm:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-800 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-950"
            onClick={onBack}
            aria-label="Wstecz do wyboru statusu"
          >
            <IconBack />
          </button>
          <h1 className="shrink-0 whitespace-nowrap text-lg font-black leading-none tracking-tight text-slate-900 sm:text-xl">
            Zamówień: {loading ? "…" : n}
          </h1>
          {!loading ? (
            <StatusBadges spakowane={stats.spakowane} doSpakowania={stats.doSpakowania} wTrakcie={stats.wTrakcie} />
          ) : null}
          {cartHint}
          <span
            className="ml-auto inline-flex h-9 max-w-[min(40%,14rem)] min-w-[1.75rem] shrink-0 items-center justify-center truncate rounded-xl px-3 text-xs font-semibold leading-tight sm:max-w-[16rem] sm:px-4 sm:text-sm"
            style={statusBadgeStyle}
            title={statusLabelRight}
          >
            {statusLabelRight}
          </span>
        </div>
      </div>

      {error ? (
        <p className="mx-4 mb-3 rounded-2xl border border-red-200/90 bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-900 shadow-sm sm:mx-5">
          {error}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 px-4 pb-8 pt-0 sm:px-6">
        {loading ? (
          <p className="py-14 text-center text-base font-medium text-slate-500">Ładowanie…</p>
        ) : !error && orders.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center text-base leading-relaxed text-slate-500 shadow-sm">
            Brak zamówień dla wybranego sposobu pakowania.
          </p>
        ) : (
          <div
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            role="list"
            aria-label="Lista zamówień do pakowania"
          >
            {orders.map((o) => (
              <OrderRow
                key={o.order_id}
                order={o}
                showBasketCode={showBasketCode}
                onOpenOrder={onOpenOrder}
                onProductClick={onProductClick}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
