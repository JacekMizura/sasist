import type { CSSProperties } from "react";
import type { WmsPackingOrderCardApi } from "../../../../api/wmsPackingApi";
import type { PackingOrdersListLayout } from "../../../../types/wmsPackingExtendedUi";
import { computeOrdersListStats } from "./ordersListStats";
import { ExpandedHorizontalOrderCard } from "./ExpandedHorizontalOrderCard";
import { OrderRow } from "./OrderRow";
import { StandardOrderCard } from "./StandardOrderCard";
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
  showAllNotes?: boolean;
  /** `compact` = Standardowy, `cards` = Rozbudowany (Poziomy). */
  ordersListLayout?: PackingOrdersListLayout;
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
  showAllNotes = true,
  ordersListLayout = "compact",
  onOpenOrder,
  onProductClick,
  onBack,
  cartLine,
  statusLabelRight,
  statusBadgeStyle,
}: OrdersListViewProps) {
  const n = orders.length;
  const stats = computeOrdersListStats(orders);
  const isStandard = ordersListLayout === "compact";
  const isHorizontal = ordersListLayout === "cards";
  const sellasistHeader = isStandard || isHorizontal;

  const cartHint =
    cartLine != null && cartLine.code.trim() !== "" ? (
      <span
        className={
          sellasistHeader
            ? "ml-auto min-w-0 max-w-[14rem] shrink truncate text-sm font-semibold text-slate-700"
            : "hidden min-w-0 max-w-[10rem] shrink truncate text-xs font-semibold text-slate-600 md:inline lg:max-w-[14rem] lg:text-sm"
        }
      >
        {cartLine.mode === "baskets" ? "Wózek z koszykami: " : "Wózek: "}
        <span className="font-bold text-slate-900">{cartLine.code}</span>
      </span>
    ) : null;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-white">
      <div
        className={
          sellasistHeader
            ? "sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-white px-3 py-2.5 sm:px-4"
            : "sticky top-0 z-20 shrink-0 border-b border-slate-200/90 bg-white/95 px-3 py-3 shadow-sm backdrop-blur-md sm:px-5"
        }
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            className={
              sellasistHeader
                ? "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-800 transition hover:bg-slate-50"
                : "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-800 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-950"
            }
            onClick={onBack}
            aria-label="Wstecz do wyboru statusu"
          >
            <IconBack />
          </button>
          <h1
            className={
              sellasistHeader
                ? "shrink-0 whitespace-nowrap text-base font-bold leading-none tracking-tight text-slate-900 sm:text-lg"
                : "shrink-0 whitespace-nowrap text-lg font-black leading-none tracking-tight text-slate-900 sm:text-xl"
            }
          >
            Zamówień: {loading ? "…" : n}
          </h1>
          {!loading ? (
            <StatusBadges
              spakowane={stats.spakowane}
              doSpakowania={stats.doSpakowania}
              wTrakcie={stats.wTrakcie}
              braki={isHorizontal ? stats.braki : 0}
            />
          ) : null}
          {cartHint}
          {!sellasistHeader ? (
            <span
              className="ml-auto inline-flex h-9 max-w-[min(40%,14rem)] min-w-[1.75rem] shrink-0 items-center justify-center truncate rounded-xl px-3 text-xs font-semibold leading-tight sm:max-w-[16rem] sm:px-4 sm:text-sm"
              style={statusBadgeStyle}
              title={statusLabelRight}
            >
              {statusLabelRight}
            </span>
          ) : cartHint == null ? (
            <span className="ml-auto" />
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="mx-4 mb-3 rounded-2xl border border-red-200/90 bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-900 shadow-sm sm:mx-5">
          {error}
        </p>
      ) : null}

      <div
        className={
          isHorizontal
            ? "flex min-h-0 flex-1 flex-col bg-white px-3 pb-3 pt-3 sm:px-4"
            : isStandard
              ? "min-h-0 flex-1 px-3 pb-8 pt-3 sm:px-4"
              : "min-h-0 flex-1 px-4 pb-8 pt-0 sm:px-6"
        }
      >
        {loading ? (
          <p className="py-14 text-center text-base font-medium text-slate-500">Ładowanie…</p>
        ) : !error && orders.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center text-base leading-relaxed text-slate-500 shadow-sm">
            Brak zamówień dla wybranego sposobu pakowania.
          </p>
        ) : isStandard ? (
          <div
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
            role="list"
            aria-label="Lista zamówień do pakowania"
          >
            {orders.map((o) => (
              <div key={o.order_id} role="listitem">
                <StandardOrderCard order={o} onOpenOrder={onOpenOrder} />
              </div>
            ))}
          </div>
        ) : isHorizontal ? (
          <div
            className="flex min-h-0 flex-1 items-stretch gap-4 overflow-x-auto overflow-y-hidden pb-2 [scrollbar-color:theme(colors.slate.300)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-slate-100"
            role="list"
            aria-label="Lista zamówień do pakowania"
          >
            {orders.map((o) => (
              <div key={o.order_id} role="listitem" className="flex shrink-0 self-stretch">
                <ExpandedHorizontalOrderCard
                  order={o}
                  onOpenOrder={onOpenOrder}
                  onProductClick={onProductClick}
                />
              </div>
            ))}
          </div>
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
                showAllNotes={showAllNotes}
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
