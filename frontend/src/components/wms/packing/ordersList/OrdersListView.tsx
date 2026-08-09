import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { WmsPackingOrderCardApi } from "../../../../api/wmsPackingApi";
import type { PackingOrdersListLayout } from "../../../../types/wmsPackingExtendedUi";
import {
  computeOrdersListStats,
  isPackingOrderCardPacked,
  sortPackingOrdersForList,
} from "./ordersListStats";
import {
  DEFAULT_ORDERS_LIST_PRODUCT_FIELDS,
  type OrdersListProductFieldVisibility,
} from "./ordersListProductFields";
import { ExpandedHorizontalOrderCard } from "./ExpandedHorizontalOrderCard";
import { ExpandedVerticalOrderCard } from "./ExpandedVerticalOrderCard";
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
  loadingMore?: boolean;
  hasMore?: boolean;
  error: string | null;
  showBasketCode?: boolean;
  showAllNotes?: boolean;
  /** `compact` | `cards` | `expanded_vertical`. */
  ordersListLayout?: PackingOrdersListLayout;
  /** Pola produktu w kafelkach (układy rozbudowane). Standardowy ignoruje zdjęcie. */
  productFields?: OrdersListProductFieldVisibility;
  /** Ustawienie WMS: czy spakowane są na liście na stałe. */
  showPackedOrders?: boolean;
  onLoadMore?: () => void;
  onOpenOrder: (orderId: number) => void;
  onProductClick?: (orderItemId: number, orderId: number) => void;
  onBack: () => void;
  cartLine?: { mode: "bulk" | "baskets"; code: string } | null;
  statusLabelRight: string;
  statusBadgeStyle: CSSProperties;
};

function LoadMoreSentinel({
  enabled,
  loadingMore,
  onLoadMore,
  horizontal,
}: {
  enabled: boolean;
  loadingMore: boolean;
  onLoadMore?: () => void;
  horizontal?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!enabled || !onLoadMore) return;
    const el = ref.current;
    if (!el) return;
    const root = el.closest("[data-packing-orders-scroll]") as HTMLElement | null;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore();
      },
      { root: root ?? null, rootMargin: horizontal ? "0px 160px 0px 0px" : "160px 0px", threshold: 0 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [enabled, onLoadMore, horizontal]);

  if (!enabled && !loadingMore) return null;
  return (
    <div
      ref={ref}
      className={
        horizontal
          ? "flex min-w-[4rem] shrink-0 items-center justify-center self-center px-2 py-4"
          : "flex w-full items-center justify-center py-4"
      }
      aria-hidden={!loadingMore}
    >
      {loadingMore ? <span className="text-sm font-medium text-slate-500">Doczytywanie…</span> : null}
    </div>
  );
}

const SCROLL_AREA =
  "min-h-0 flex-1 overflow-auto bg-white px-3 pb-8 pt-3 sm:px-4 [scrollbar-color:theme(colors.slate.300)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-slate-100";
const HORIZONTAL_ROW = "flex w-max min-w-full items-start gap-4 pb-2";

export function OrdersListView({
  orders,
  loading,
  loadingMore = false,
  hasMore = false,
  error,
  showBasketCode,
  showAllNotes = true,
  ordersListLayout = "compact",
  productFields = DEFAULT_ORDERS_LIST_PRODUCT_FIELDS,
  showPackedOrders = false,
  onLoadMore,
  onOpenOrder,
  onProductClick,
  onBack,
  cartLine,
  statusLabelRight: _statusLabelRight,
  statusBadgeStyle: _statusBadgeStyle,
}: OrdersListViewProps) {
  /** Tymczasowe odsłonięcie spakowanych — nie zapisuje ustawienia WMS. */
  const [revealPackedOrders, setRevealPackedOrders] = useState(false);

  useEffect(() => {
    if (showPackedOrders) setRevealPackedOrders(false);
  }, [showPackedOrders]);

  /** Liczniki i „Zamówień” z tej samej listy źródłowej (odpowiedź API), nie z widoku po ukryciu spakowanych. */
  const stats = useMemo(() => computeOrdersListStats(orders), [orders]);
  const sourceOrderCount =
    stats.spakowane + stats.doSpakowania + stats.wTrakcie + stats.braki;
  const hidePacked = !showPackedOrders && !revealPackedOrders;
  const displayedOrders = useMemo(() => {
    const scoped = hidePacked ? orders.filter((o) => !isPackingOrderCardPacked(o)) : orders;
    return sortPackingOrdersForList(scoped);
  }, [hidePacked, orders]);
  const showRevealPackedBtn = !showPackedOrders && stats.spakowane > 0;
  const isStandard = ordersListLayout === "compact";
  const isHorizontal = ordersListLayout === "cards";
  const isVertical = ordersListLayout === "expanded_vertical";
  const sentinelEnabled = Boolean(hasMore && onLoadMore && !loading && orders.length > 0);

  const cartHint =
    cartLine != null && cartLine.code.trim() !== "" ? (
      <span className="ml-auto min-w-0 max-w-[14rem] shrink truncate text-sm font-semibold text-slate-700">
        {cartLine.mode === "baskets" ? "Wózek z koszykami: " : "Wózek: "}
        <span className="font-bold text-slate-900">{cartLine.code}</span>
      </span>
    ) : null;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-white">
      <div className="sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-white px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-800 transition hover:bg-slate-50"
            onClick={onBack}
            aria-label="Wstecz do wyboru statusu"
          >
            <IconBack />
          </button>
          <h1 className="shrink-0 whitespace-nowrap text-base font-bold leading-none tracking-tight text-slate-900 sm:text-lg">
            Zamówień: {loading ? "…" : sourceOrderCount}
          </h1>
          {!loading ? (
            <StatusBadges
              spakowane={stats.spakowane}
              doSpakowania={stats.doSpakowania}
              wTrakcie={stats.wTrakcie}
              braki={stats.braki}
            />
          ) : null}
          {showRevealPackedBtn ? (
            <button
              type="button"
              className="shrink-0 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 sm:text-sm"
              onClick={() => setRevealPackedOrders((v) => !v)}
            >
              {revealPackedOrders ? "Ukryj spakowane zamówienia" : "Wyświetl spakowane zamówienia"}
            </button>
          ) : null}
          {cartHint}
          {cartHint == null ? <span className="ml-auto" /> : null}
        </div>
      </div>

      {error ? (
        <p className="mx-4 mb-3 rounded-2xl border border-red-200/90 bg-red-50 px-4 py-3 text-center text-sm font-medium text-red-900 shadow-sm sm:mx-5">
          {error}
        </p>
      ) : null}

      <div data-packing-orders-scroll className={SCROLL_AREA}>
        {loading ? (
          <p className="py-14 text-center text-base font-medium text-slate-500">Ładowanie…</p>
        ) : !error && orders.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center text-base leading-relaxed text-slate-500">
            Brak zamówień dla wybranego sposobu pakowania.
          </p>
        ) : !error && displayedOrders.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center text-base leading-relaxed text-slate-500">
            Brak zamówień do spakowania.
            {showRevealPackedBtn && !revealPackedOrders
              ? " Spakowane zamówienia są ukryte — użyj przycisku powyżej, aby je pokazać."
              : null}
          </p>
        ) : isStandard ? (
          <div className="flex flex-wrap items-start gap-3" role="list" aria-label="Lista zamówień do pakowania">
            {displayedOrders.map((o) => (
              <div key={o.order_id} role="listitem" className="h-auto shrink-0">
                <StandardOrderCard order={o} onOpenOrder={onOpenOrder} />
              </div>
            ))}
            <LoadMoreSentinel enabled={sentinelEnabled} loadingMore={loadingMore} onLoadMore={onLoadMore} />
          </div>
        ) : isHorizontal ? (
          <div className={HORIZONTAL_ROW} role="list" aria-label="Lista zamówień do pakowania">
            {displayedOrders.map((o) => (
              <div key={o.order_id} role="listitem" className="h-auto shrink-0 self-start">
                <ExpandedHorizontalOrderCard
                  order={o}
                  onOpenOrder={onOpenOrder}
                  onProductClick={onProductClick}
                  productFields={productFields}
                />
              </div>
            ))}
            <LoadMoreSentinel
              enabled={sentinelEnabled}
              loadingMore={loadingMore}
              onLoadMore={onLoadMore}
              horizontal
            />
          </div>
        ) : (
          <div className="flex flex-col items-stretch gap-3 bg-white" role="list" aria-label="Lista zamówień do pakowania">
            {displayedOrders.map((o) => (
              <div key={o.order_id} role="listitem" className="h-auto w-full shrink-0">
                <ExpandedVerticalOrderCard
                  order={o}
                  showBasketCode={showBasketCode}
                  showAllNotes={showAllNotes}
                  onOpenOrder={onOpenOrder}
                  onProductClick={onProductClick}
                  productFields={productFields}
                />
              </div>
            ))}
            <LoadMoreSentinel enabled={sentinelEnabled} loadingMore={loadingMore} onLoadMore={onLoadMore} />
          </div>
        )}
      </div>
    </div>
  );
}
