import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Eraser } from "lucide-react";

import api from "../../../api/axios";
import {
  EMPTY_WMS_CART_STATS,
  fetchWmsCartStats,
  parseCapacitySnapshot,
  type WmsCartStats,
} from "../../../api/wmsCartStatsApi";
import { useTranslation } from "../../../locales";
import { cartStatsFromWms } from "../../../pages/CartsComponents/cartStats";
import OrderProductPreviewModal from "../../../pages/CartsComponents/ui/OrderProductPreviewModal";
import StatusPill from "../../../pages/CartsComponents/ui/StatusPill";
import { ClearIcon } from "../../../pages/CartsComponents/ui/Icons";
import type { BasketDetail } from "./cartFleetTypes";
import type { CapacitySnapshot } from "../../../types/cartCapacity";
import { basketSlotCode } from "./cartFleetTypes";
import ActivityLogPanel from "../../../components/activityLog/ActivityLogPanel";
import { AdminReleaseCartButton } from "../../../components/carts/AdminReleaseCartButton";
import { CartOrdersHoverPopover, type CartOrderPreview } from "./CartOrdersHoverPopover";
import { AssignedOrdersSection, type AssignedOrderRow } from "./AssignedOrdersSection";

type CartFleetDetailPanelProps = {
  open: boolean;
  cartId: number | null;
  cartName: string;
  isSectional: boolean;
  onClose: () => void;
  onClearSuccess?: () => void;
};

/**
 * Inline expand under cart row — full width (no right Drawer).
 * Occupancy counters: GET /wms/carts/{id}/stats only.
 */
export function CartFleetDetailPanel({
  open,
  cartId,
  cartName,
  isSectional,
  onClose,
  onClearSuccess,
}: CartFleetDetailPanelProps) {
  const t = useTranslation();
  const [loading, setLoading] = useState(false);
  const [baskets, setBaskets] = useState<BasketDetail[]>([]);
  const [detailData, setDetailData] = useState<{
    baskets?: BasketDetail[];
    assigned_orders?: AssignedOrderRow[];
    order_numbers?: string[];
    orders_preview?: CartOrderPreview[];
    total_weight_kg?: number;
    capacity?: CapacitySnapshot | null;
    status?: string;
    assigned_user_id?: number | null;
    current_session_id?: number | null;
  } | null>(null);
  const [wmsStats, setWmsStats] = useState<WmsCartStats>(EMPTY_WMS_CART_STATS);
  const [clearingCart, setClearingCart] = useState(false);
  const [clearingBasketId, setClearingBasketId] = useState<number | null>(null);
  const [basketToConfirmClear, setBasketToConfirmClear] = useState<BasketDetail | null>(null);
  const [confirmWholeCartClearOpen, setConfirmWholeCartClearOpen] = useState(false);
  const [orderPreview, setOrderPreview] = useState<{ orderId: number; basketCode?: string | null } | null>(null);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);

  const reloadCartSurfaces = () => {
    if (cartId == null) return;
    void Promise.all([api.get(`/carts/${cartId}/`), fetchWmsCartStats(cartId)]).then(
      ([detailRes, statsRes]) => {
        const detail = detailRes.data as NonNullable<typeof detailData> & {
          baskets: BasketDetail[];
        };
        setBaskets(detail.baskets ?? []);
        setDetailData({
          ...detail,
          capacity: parseCapacitySnapshot(detail.capacity) ?? statsRes.capacity ?? null,
          status: detail.status != null ? String(detail.status) : statsRes.status,
          assigned_user_id:
            detail.assigned_user_id != null ? Number(detail.assigned_user_id) : null,
          current_session_id:
            detail.current_session_id != null ? Number(detail.current_session_id) : null,
        });
        setWmsStats(statsRes);
        setActivityRefreshKey((n) => n + 1);
      },
    );
  };

  useEffect(() => {
    if (!open || cartId == null) {
      setBaskets([]);
      setDetailData(null);
      setWmsStats(EMPTY_WMS_CART_STATS);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get<typeof detailData & { baskets: BasketDetail[] }>(`/carts/${cartId}/`),
      fetchWmsCartStats(cartId),
    ])
      .then(([detailRes, stats]) => {
        if (cancelled) return;
        const detail = detailRes.data as typeof detailData & { baskets: BasketDetail[] };
        setBaskets(detail.baskets ?? []);
        setDetailData({
          ...detail,
          capacity: parseCapacitySnapshot(detail.capacity) ?? stats.capacity ?? null,
          status: detail.status != null ? String(detail.status) : stats.status,
          assigned_user_id:
            detail.assigned_user_id != null ? Number(detail.assigned_user_id) : null,
          current_session_id:
            detail.current_session_id != null ? Number(detail.current_session_id) : null,
        });
        setWmsStats(stats);
      })
      .catch(() => {
        if (!cancelled) {
          setBaskets([]);
          setDetailData(null);
          setWmsStats(EMPTY_WMS_CART_STATS);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, cartId]);

  const stats = useMemo(() => cartStatsFromWms(wmsStats), [wmsStats]);
  const weightKg = Number(detailData?.total_weight_kg ?? 0);
  const lifecycleStatus = wmsStats.status ?? detailData?.status;

  // Poll while operator may time out (ASSIGNED) so panel/status stay in sync after backend release.
  useEffect(() => {
    if (!open || cartId == null) return;
    const st = String(lifecycleStatus || "").toUpperCase();
    if (st !== "ASSIGNED" && st !== "PICKING") return;
    const timer = window.setInterval(() => {
      void fetchWmsCartStats(cartId).then((statsRes) => {
        setWmsStats(statsRes);
        const next = String(statsRes.status || "").toUpperCase();
        if (next === "AVAILABLE" || next !== st) {
          reloadCartSurfaces();
        }
      });
    }, 12_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reloadCartSurfaces closes over cartId
  }, [open, cartId, lifecycleStatus]);

  const handleClearCartConfirm = async () => {
    if (cartId == null) return;
    setClearingCart(true);
    try {
      await api.post(`/carts/${cartId}/clear/`);
      setConfirmWholeCartClearOpen(false);
      onClearSuccess?.();
      onClose();
    } catch (e) {
      console.error("clear_cart failed:", e);
    } finally {
      setClearingCart(false);
    }
  };

  const handleClearBasketConfirm = async () => {
    const b = basketToConfirmClear;
    setBasketToConfirmClear(null);
    if (!b || cartId == null) return;
    setClearingBasketId(b.id);
    try {
      await api.post(`/carts/basket/${b.id}/clear/`);
      const [detailRes, statsRes] = await Promise.all([
        api.get<{ baskets: BasketDetail[] } & typeof detailData>(`/carts/${cartId}/`),
        fetchWmsCartStats(cartId),
      ]);
      const detail = detailRes.data;
      setBaskets(detail.baskets ?? []);
      setDetailData({
        ...detail,
        capacity: parseCapacitySnapshot(detail.capacity) ?? statsRes.capacity ?? null,
        status: detail.status != null ? String(detail.status) : statsRes.status,
      });
      setWmsStats(statsRes);
      onClearSuccess?.();
    } finally {
      setClearingBasketId(null);
    }
  };

  const renderBasketCell = (b: BasketDetail) => {
    const basketName = b.name && String(b.name).trim() ? b.name : `S-${b.row}-${b.column}`;
    const hasOrders = Boolean(b.order_id);
    const cap = (Number(b.length || 0) * Number(b.width || 0) * Number(b.height || 0)) / 1000;
    const usedDm3 = Number(b.used_volume_dm3 ?? 0);
    const occupancyPct = cap > 0 ? Math.min(100, (usedDm3 / cap) * 100) : 0;
    const displayPct = hasOrders && cap > 0 && occupancyPct === 0 ? 1 : occupancyPct;
    const displayUsed = hasOrders && usedDm3 === 0 && cap > 0 ? 0.05 : usedDm3;
    const orderLabel = hasOrders ? (b.order_number ? `#${b.order_number}` : `#${b.order_id}`) : null;
    const isReady = hasOrders && occupancyPct >= 95;
    const basketTone = !hasOrders
      ? "bg-slate-50 border-slate-300 border-dashed"
      : isReady
        ? "bg-emerald-50 border-emerald-300"
        : "bg-blue-50 border-blue-300";

    return (
      <div key={b.id} className={`relative flex min-h-[4.5rem] flex-col gap-1 rounded-lg border p-2.5 ${basketTone}`}>
        {hasOrders ? (
          <button
            type="button"
            onClick={() => setBasketToConfirmClear(b)}
            disabled={clearingBasketId === b.id}
            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded border border-slate-200 bg-white/90 text-slate-500 hover:bg-amber-200 hover:text-amber-700"
            aria-label={t.clear_basket}
            title={t.clear_basket}
          >
            <ClearIcon className="h-3 w-3" />
          </button>
        ) : null}
        <div className="truncate text-xs font-bold text-slate-800">{basketName}</div>
        {hasOrders ? (
          <>
            <button
              type="button"
              onClick={() => b.order_id != null && setOrderPreview({ orderId: b.order_id, basketCode: basketSlotCode(b) })}
              className="inline-flex w-fit rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700"
            >
              {orderLabel}
            </button>
            <div className="mt-1 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full rounded-full ${displayPct > 100 ? "bg-red-500" : isReady ? "bg-emerald-500" : "bg-blue-500"}`}
                    style={{ width: `${Math.min(100, displayPct)}%` }}
                  />
                </div>
                <span className="shrink-0 text-[9px] font-bold text-slate-500">{displayPct.toFixed(0)}%</span>
              </div>
              {cap > 0 ? (
                <div className="text-[10px] font-semibold text-slate-600">
                  {displayUsed.toFixed(1)} / {cap.toFixed(1)} dm³
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <span className="inline-flex w-fit rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
            PUSTY
          </span>
        )}
      </div>
    );
  };

  const assignedOrders = detailData?.assigned_orders ?? [];
  const ordersPreview = detailData?.orders_preview ?? [];

  return (
    <>
      <div
        className="grid w-full max-w-none transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
        aria-hidden={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="w-full max-w-none border-t border-slate-200 bg-white">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              <p className="text-sm font-semibold text-slate-900">
                Zawartość wózka
                {cartName ? <span className="font-medium text-slate-500"> · {cartName}</span> : null}
              </p>
            </div>

            {open ? (
              loading ? (
                <div className="flex h-32 items-center justify-center text-sm text-slate-400">Ładowanie…</div>
              ) : (
                <div className="space-y-5 px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                      {lifecycleStatus ? (
                        <span className="inline-flex items-center gap-1.5">
                          Status: <StatusPill status={lifecycleStatus} />
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-1">
                        Zamówienia:{" "}
                        <CartOrdersHoverPopover orders={ordersPreview}>
                          <strong className="tabular-nums text-slate-900">{stats.total_orders}</strong>
                        </CartOrdersHoverPopover>
                      </span>
                      <span>
                        Produkty: <strong>{stats.total_products}</strong>
                      </span>
                      {isSectional ? (
                        <span>
                          Zajęte sekcje: <strong>{stats.baskets_used}</strong> / {stats.sections_count || baskets.length}
                        </span>
                      ) : null}
                      <span>
                        Objętość: <strong>{stats.used_volume_dm3.toFixed(1)}</strong> dm³
                      </span>
                      {weightKg > 0 ? (
                        <span>
                          Waga: <strong>{weightKg.toFixed(2)}</strong> kg
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {cartId != null ? (
                        <AdminReleaseCartButton
                          cartId={cartId}
                          status={lifecycleStatus}
                          assignedUserId={detailData?.assigned_user_id}
                          ordersCount={stats.total_orders}
                          hasActiveSession={
                            detailData?.current_session_id != null &&
                            Number(detailData.current_session_id) > 0
                          }
                          onSuccess={() => {
                            onClearSuccess?.();
                            reloadCartSurfaces();
                          }}
                        />
                      ) : null}
                      {(stats.total_orders > 0 || stats.used_volume_dm3 > 0) && (
                        <button
                          type="button"
                          onClick={() => setConfirmWholeCartClearOpen(true)}
                          disabled={clearingCart}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                        >
                          <Eraser className="h-3.5 w-3.5" aria-hidden />
                          {t.clear_cart}
                        </button>
                      )}
                    </div>
                  </div>

                  <AssignedOrdersSection
                    orders={assignedOrders}
                    cartId={cartId}
                    onDetachSuccess={() => {
                      onClearSuccess?.();
                      reloadCartSurfaces();
                    }}
                  />

                  {isSectional && baskets.length > 0 ? (
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Siatka sekcji</h3>
                      {[...new Set(baskets.map((b) => b.row))]
                        .sort((a, b) => b - a)
                        .map((rowNum) => {
                          const rowBaskets = baskets.filter((b) => b.row === rowNum).sort((a, b) => a.column - b.column);
                          return (
                            <div
                              key={rowNum}
                              className="grid w-full gap-2"
                              style={{ gridTemplateColumns: `repeat(${rowBaskets.length}, minmax(0, 1fr))` }}
                            >
                              {rowBaskets.map(renderBasketCell)}
                            </div>
                          );
                        })}
                    </div>
                  ) : null}

                  {cartId ? (
                    <ActivityLogPanel
                      objectType="cart"
                      objectId={cartId}
                      refreshKey={activityRefreshKey}
                      className="mt-2 border-t-0 pt-2"
                    />
                  ) : null}
                </div>
              )
            ) : null}
          </div>
        </div>
      </div>

      <OrderProductPreviewModal
        open={orderPreview != null}
        orderId={orderPreview?.orderId ?? null}
        basketCode={orderPreview?.basketCode ?? null}
        onClose={() => setOrderPreview(null)}
      />

      {confirmWholeCartClearOpen ? (
        <div
          className="fixed inset-0 z-[290] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setConfirmWholeCartClearOpen(false)}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h4 className="mb-2 font-bold text-slate-900">{t.clear_cart_confirm_title}</h4>
            <p className="mb-4 text-sm text-slate-600">{t.clear_cart_confirm_body}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmWholeCartClearOpen(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-100"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={() => void handleClearCartConfirm()}
                disabled={clearingCart}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {clearingCart ? "…" : t.confirm_clear_cart_action}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {basketToConfirmClear ? (
        <div
          className="fixed inset-0 z-[290] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setBasketToConfirmClear(null)}
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-4 text-slate-800">
              Usunąć zamówienie{" "}
              {basketToConfirmClear.order_number
                ? `#${basketToConfirmClear.order_number}`
                : `#${basketToConfirmClear.order_id}`}{" "}
              z koszyka {basketSlotCode(basketToConfirmClear)}?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBasketToConfirmClear(null)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-100"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={() => void handleClearBasketConfirm()}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-700"
              >
                Usuń
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
