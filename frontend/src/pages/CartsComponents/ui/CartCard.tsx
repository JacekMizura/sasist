import { Package } from "lucide-react";
import ProgressBar from "./ProgressBar";
import ImagePreviewModal from "./ImagePreviewModal";
import SimulationResultModal from "./SimulationResultModal";
import OrderProductPreviewModal from "./OrderProductPreviewModal";
import { CubeIcon, PencilIcon, TrashIcon, MagicWandIcon, ScaleIcon, ClearIcon, PrinterIcon } from "./Icons";
import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "../../../locales";
import api from "../../../api/axios";
import { calculateCartStats } from "../cartStats";

type BasketDetail = {
  id: number;
  name: string | null;
  /** Kod operacyjny koszyka (API), np. CART-0001-B01 */
  barcode?: string | null;
  row: number;
  column: number;
  length?: number;
  width?: number;
  height?: number;
  order_id: number | null;
  order_number: string | null;
  order_customer_name?: string | null;
  used_volume_dm3: number;
  total_weight_kg?: number;
};

/** Kod koszyka do nagłówka modala: `basket.code` z API lub nazwa slotu. */
function basketSlotCode(b: BasketDetail): string {
  const bc = (b.barcode ?? "").trim();
  if (bc) return bc;
  const n = b.name && String(b.name).trim();
  if (n) return n;
  return `S-${b.row}-${b.column}`;
}

/** Karta wózka: miniatura zdjęcia, nazwa, status, pojemność, sekcje/wymiary, pasek zapełnienia, Edytuj/Usuń, opcjonalnie Symuluj przypisanie (tylko multi). */

type SimulationResult = {
  assigned_orders_count: number;
  unassigned_orders_count: number;
  cart_utilization_percent: number;
  status: string;
};

type AssignedOrderRef = { order_id: number; total_volume_dm3: number };

type CartCardProps = {
  id: number;
  name: string;
  /** Kod wózka (operacyjny / skan). */
  code?: string | null;
  status: string;
  used_volume?: number;
  total_volume_dm3?: number;
  /** Fallback: if used_volume missing, sum from here; progress bar shows purple (simulated) */
  assigned_orders?: AssignedOrderRef[];
  image_url?: string | null;
  updated_at?: string | number | null;
  // Multi-specific
  total_baskets?: number;
  // Bulk-specific
  length?: number;
  width?: number;
  height?: number;
  // Simulation (tylko wózki sekcyjne)
  tenant_id?: number;
  warehouse_id?: number;
  order_numbers?: string[];
  total_weight_kg?: number;
  /** Unified stats from backend (list/detail); prefer over deriving */
  total_orders?: number;
  total_products?: number;
  baskets_used?: number;
  capacity_mode?: string;
  max_orders?: number | null;
  max_volume_dm3?: number;
  /** Aktywne zbieranie WMS (picks z przypisanym wózkiem) */
  wms_picking_order_count?: number;
  wms_picking_product_count?: number;
  wms_picking_quantity?: number;
  onSimulateSuccess?: () => void;
  onClearSuccess?: () => void;
  // Actions
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  /** Open cart label print modal (optional). When set, "Drukuj etykietę" button is shown. */
  onPrintLabel?: (cart: { id: number; name: string }) => void;
};

export default function CartCard(props: CartCardProps) {
  const {
    id,
    name,
    code: cartCodeProp,
    status,
    used_volume,
    total_volume_dm3,
    assigned_orders,
    image_url,
    updated_at,
    total_baskets,
    length,
    width,
    height,
    tenant_id,
    warehouse_id,
    order_numbers = [],
    total_weight_kg,
    total_orders: total_orders_prop,
    total_products: total_products_prop,
    baskets_used: baskets_used_prop,
    capacity_mode: capacity_mode_prop,
    max_orders: max_orders_prop,
    max_volume_dm3: max_volume_dm3_prop,
    wms_picking_order_count = 0,
    wms_picking_product_count = 0,
    wms_picking_quantity = 0,
    onSimulateSuccess,
    onClearSuccess,
    onEdit,
    onDelete,
    onPrintLabel,
  } = props;

  const isSectional = total_baskets != null && total_baskets > 0;
  const isBulk = !isSectional;

  const t = useTranslation();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [showContent, setShowContent] = useState(false);
  const [baskets, setBaskets] = useState<BasketDetail[]>([]);
  const cartCodeDisplay = (cartCodeProp ?? "").trim();
  const [contentLoading, setContentLoading] = useState(false);
  const [clearingCart, setClearingCart] = useState(false);
  const [clearingBasketId, setClearingBasketId] = useState<number | null>(null);
  const [orderPreview, setOrderPreview] = useState<{
    orderId: number;
    basketCode?: string | null;
  } | null>(null);
  const [basketToConfirmClear, setBasketToConfirmClear] = useState<BasketDetail | null>(null);
  const [confirmWholeCartClearOpen, setConfirmWholeCartClearOpen] = useState(false);
  const [detailData, setDetailData] = useState<{
    baskets?: BasketDetail[];
    total_orders?: number;
    total_products?: number;
    baskets_used?: number;
    used_volume?: number;
    total_weight_kg?: number;
  } | null>(null);

  useEffect(() => {
    if (!showContent || !isSectional || !id) {
      setBaskets([]);
      setDetailData(null);
      return;
    }
    let cancelled = false;
    setContentLoading(true);
    api
      .get<{
        baskets: BasketDetail[];
        total_orders?: number;
        total_products?: number;
        baskets_used?: number;
        used_volume?: number;
        total_weight_kg?: number;
      }>(`/carts/${id}/`)
      .then((res) => {
        if (!cancelled) {
          setBaskets(res.data.baskets || []);
          setDetailData(res.data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBaskets([]);
          setDetailData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setContentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showContent, isSectional, id]);

  const listCart = useMemo(
    () => ({
      assigned_orders,
      used_volume,
      total_volume_dm3,
      total_weight_kg,
      total_orders: total_orders_prop,
      total_products: total_products_prop,
      baskets_used: baskets_used_prop,
    }),
    [assigned_orders, used_volume, total_volume_dm3, total_weight_kg, total_orders_prop, total_products_prop, baskets_used_prop]
  );
  const cardStats = useMemo(() => calculateCartStats(listCart), [listCart]);
  const contentStats = useMemo(
    () => (detailData ? calculateCartStats(detailData) : null),
    [detailData]
  );

  const usedVol = cardStats.used_volume_dm3;
  const isSimulated =
    (used_volume == null || used_volume === 0) &&
    Array.isArray(assigned_orders) &&
    assigned_orders.length > 0 &&
    assigned_orders.reduce((s, o) => s + Number((o as AssignedOrderRef).total_volume_dm3 ?? 0), 0) > 0;
  const hasImage = Boolean(image_url);
  const imageSrc = useMemo(
    () => (hasImage && image_url ? `${image_url}?v=${updated_at ?? Date.now()}` : null),
    [image_url, updated_at, hasImage]
  );
  const canSimulate = isSectional && tenant_id != null && warehouse_id != null;

  const handleSimulate = async () => {
    if (!canSimulate) return;
    setSimulating(true);
    try {
      const res = await api.post<SimulationResult>("/simulation/assign/", null, {
        params: {
          tenant_id,
          warehouse_id,
          cart_id: id,
        },
      });
      setSimulationResult(res.data);
      onSimulateSuccess?.();
    } catch (err) {
      console.error("Simulation assign error:", err);
    } finally {
      setSimulating(false);
    }
  };

  const closeSimulationModal = () => {
    setSimulationResult(null);
    onSimulateSuccess?.();
  };

  const wmsPickOrders = Number(wms_picking_order_count) || 0;
  const wmsPickProducts = Number(wms_picking_product_count) || 0;
  const wmsPickQty = Number(wms_picking_quantity) || 0;
  const wmsPickingActive = wmsPickOrders > 0 || wmsPickProducts > 0 || wmsPickQty > 0;

  const orderNumbersList = Array.isArray(order_numbers) ? order_numbers : [];
  const orderLabel =
    cardStats.total_orders === 0
      ? null
      : cardStats.total_orders <= 3
        ? `#${orderNumbersList.slice(0, 3).join(", #")}`
        : `${cardStats.total_orders} szt.`;

  const assignedOrderCount = assigned_orders?.length ?? 0;
  const canClearCart =
    usedVol > 0 ||
    orderNumbersList.length > 0 ||
    cardStats.total_orders > 0 ||
    assignedOrderCount > 0 ||
    wmsPickingActive;

  const handleClearCartConfirm = async () => {
    setClearingCart(true);
    try {
      await api.post(`/carts/${id}/clear/`);
      setConfirmWholeCartClearOpen(false);
      onClearSuccess?.();
      setShowContent(false);
      setBaskets([]);
      setDetailData(null);
    } catch (e) {
      console.error("clear_cart failed:", e);
    } finally {
      setClearingCart(false);
    }
  };

  const handleClearBasketClick = (b: BasketDetail) => {
    setBasketToConfirmClear(b);
  };

  const handleClearBasketConfirm = async () => {
    const b = basketToConfirmClear;
    setBasketToConfirmClear(null);
    if (!b) return;
    setClearingBasketId(b.id);
    try {
      await api.post(`/carts/basket/${b.id}/clear/`);
      setBaskets((prev) =>
        prev.map((x) =>
          x.id === b.id
            ? { ...x, order_id: null, order_number: null, used_volume_dm3: 0, total_weight_kg: 0 }
            : x
        )
      );
      const detailRes = await api.get<{
        baskets: BasketDetail[];
        total_orders?: number;
        total_products?: number;
        baskets_used?: number;
      }>(`/carts/${id}/`);
      setBaskets(detailRes.data.baskets || []);
      setDetailData(detailRes.data);
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
      <div
        key={b.id}
        className={`rounded-lg border p-2 flex flex-col gap-1 relative min-h-[4rem] ${basketTone}`}
        title={hasOrders ? t.cart_basket_occupied : t.cart_basket_empty}
      >
        {hasOrders && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleClearBasketClick(b);
            }}
            disabled={clearingBasketId === b.id}
            className="absolute top-1 right-1 w-5 h-5 rounded bg-white/90 hover:bg-amber-200 flex items-center justify-center text-slate-500 hover:text-amber-700 border border-slate-200"
            aria-label={t.clear_basket}
            title={t.clear_basket}
          >
            <ClearIcon className="w-3 h-3" />
          </button>
        )}
        <div className="font-bold text-xs text-slate-800 truncate">{basketName}</div>
        {hasOrders ? (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (b.order_id != null) {
                  setOrderPreview({ orderId: b.order_id, basketCode: basketSlotCode(b) });
                }
              }}
              className="inline-flex w-fit px-2 py-0.5 rounded-md border border-violet-200 bg-violet-50 text-[11px] font-semibold text-violet-700"
            >
              {orderLabel}
            </button>
            <div className="mt-1 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden min-w-0">
                  <div
                    className={`h-full rounded-full transition-all ${
                      displayPct > 100 ? "bg-red-500" : isReady ? "bg-emerald-500" : "bg-blue-500"
                    }`}
                    style={{ width: `${Math.min(100, displayPct)}%` }}
                  />
                </div>
                <span className="text-[9px] font-bold text-slate-500 shrink-0">
                  {displayPct.toFixed(0)}%
                </span>
              </div>
              {cap > 0 ? (
                <div className="text-[10px] font-semibold text-slate-600">
                  {displayUsed.toFixed(1)} / {cap.toFixed(1)} dm³
                </div>
              ) : null}
              {isReady ? (
                <span className="inline-flex w-fit px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase">
                  Gotowe
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <span className="inline-flex w-fit px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold uppercase">
            PUSTY
          </span>
        )}
      </div>
    );
  };

  return (
    <>
      <div className={`group relative flex gap-4 py-4 ${simulating ? "pointer-events-none opacity-70" : ""}`}>
        <button
          className="w-16 h-16 rounded-lg bg-slate-50 border border-slate-200 overflow-hidden flex items-center justify-center text-slate-300 hover:border-blue-600 transition-colors"
          onClick={() => setPreviewOpen(true)}
          aria-label="Open image preview"
          type="button"
        >
          {hasImage && imageSrc ? (
            <img src={imageSrc} alt={name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs font-medium text-slate-400">{t.imageAbbr}</span>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="truncate text-base font-semibold text-slate-900">{name}</div>
              {cartCodeDisplay ? (
                <div className="mt-1.5">
                  <div className="text-xs font-medium text-slate-500">Kod</div>
                  <div className="font-mono text-sm font-semibold tracking-tight text-slate-700">{cartCodeDisplay}</div>
                </div>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                <div className="flex items-center gap-1.5 font-medium">
                  <CubeIcon className="h-4 w-4 text-slate-300" />
                  {Number(total_volume_dm3 ?? 0).toFixed(1)} dm³
                </div>
                {isSectional ? (
                  <div className="font-medium">
                    {t.sections}: {total_baskets}
                  </div>
                ) : (
                  <div className="font-medium tabular-nums">
                    {length ?? 0}×{width ?? 0}×{height ?? 0} cm
                  </div>
                )}
              </div>
              {String(status).toUpperCase() === "FULL" ? (
                <div className="mt-2">
                  <span className="inline-flex px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold">
                    Gotowe do pakowania
                  </span>
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onEdit(id)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:border-blue-300 hover:bg-blue-50/50"
                aria-label={t.edit}
                type="button"
              >
                Edytuj
              </button>
              <button
                onClick={() => onDelete(id)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:border-red-300 hover:bg-red-50/40"
                aria-label={t.delete}
                type="button"
              >
                Usuń
              </button>
              {onPrintLabel != null && (
                <button
                  onClick={() => onPrintLabel({ id, name })}
                  className="h-9 rounded-lg bg-white hover:bg-cyan-50 text-slate-600 border border-slate-200 hover:border-cyan-300 transition-colors px-3 text-xs font-bold"
                  aria-label="Drukuj etykietę"
                  type="button"
                  title="Drukuj etykietę"
                >
                  Drukuj
                </button>
              )}
              {canClearCart && (
                <button
                  onClick={() => setConfirmWholeCartClearOpen(true)}
                  disabled={clearingCart}
                  className="h-9 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-300 transition-colors px-3 text-xs font-bold disabled:opacity-50"
                  aria-label={t.clear_cart}
                  title={t.clear_cart}
                  type="button"
                >
                  Wyczyść wózek
                </button>
              )}
              {canSimulate && (
                <button
                  onClick={handleSimulate}
                  disabled={simulating}
                  className="w-9 h-9 rounded-full bg-slate-50 hover:bg-violet-600 text-slate-500 hover:text-white border border-slate-200 hover:border-violet-600 transition-colors flex items-center justify-center"
                  aria-label={t.simulation_assign_button}
                  type="button"
                >
                  <MagicWandIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="mt-4" key={`${id}-${usedVol}`}>
            {(() => {
              const mode = (capacity_mode_prop ?? "volume").toLowerCase();
              const maxVol = Number(max_volume_dm3_prop ?? total_volume_dm3 ?? 0);
              const maxOrd = max_orders_prop != null ? Number(max_orders_prop) : null;
              const volPercent = maxVol > 0 ? Math.min(100, (usedVol / maxVol) * 100) : 0;
              const ordPercent = maxOrd != null && maxOrd > 0 ? Math.min(100, (cardStats.total_orders / maxOrd) * 100) : 0;
              const displayPercent = mode === "orders" ? ordPercent : mode === "mixed" ? Math.min(volPercent, ordPercent) : volPercent;
              return (
                <>
                  <div className="flex flex-col gap-1 mb-1">
                    {mode === "volume" && (
                      <span className="text-xs font-medium text-slate-500">
                        {usedVol.toFixed(1)} / {maxVol > 0 ? maxVol.toFixed(1) : "0"} dm³
                      </span>
                    )}
                    {mode === "orders" && (
                      <span className="text-xs font-medium text-slate-500">
                        {cardStats.total_orders} / {maxOrd != null ? maxOrd : "—"} zam.
                      </span>
                    )}
                    {mode === "mixed" && (
                      <>
                        <span className="text-xs font-medium text-slate-500">
                          Zamówienia: {cardStats.total_orders} / {maxOrd != null ? maxOrd : "—"}
                        </span>
                        <span className="text-xs font-medium text-slate-500">
                          Volume: {usedVol.toFixed(1)} / {maxVol > 0 ? maxVol.toFixed(1) : "0"} dm³
                        </span>
                      </>
                    )}
                  </div>
                  <ProgressBar percent={displayPercent} isSimulated={isSimulated} />
                </>
              );
            })()}
          </div>

          {(cardStats.used_weight > 0 || cardStats.total_orders > 0) && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
              {cardStats.used_weight > 0 && (
                <span className="flex items-center gap-1.5" title={t.weight}>
                  <ScaleIcon className="w-4 h-4 text-slate-400" />
                  {t.current_weight ?? "Aktualna waga"}: {cardStats.used_weight.toFixed(2)} kg
                </span>
              )}
              {cardStats.total_orders > 0 && !isBulk && (
                <span
                  className="flex items-center gap-1.5"
                  title={orderNumbersList.length > 3 ? orderNumbersList.map((n) => `#${n}`).join(", ") : undefined}
                >
                  <Package className="w-4 h-4 text-slate-400" />
                  {t.orders_label ?? "Zamówienia"}: {orderLabel}
                </span>
              )}
            </div>
          )}

          {isBulk && assigned_orders && assigned_orders.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                {t.assigned_orders ?? "Przypisane zamówienia"}
              </div>
              <ul className="flex flex-wrap gap-2">
                {assigned_orders.map((ref, i) => {
                  const label = orderNumbersList[i] ? `#${orderNumbersList[i]}` : `#${ref.order_id}`;
                  return (
                    <li key={ref.order_id}>
                      <button
                        type="button"
                        onClick={() => setOrderPreview({ orderId: ref.order_id })}
                        className="px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-200 text-violet-700 text-xs font-semibold hover:bg-violet-100 transition-colors"
                      >
                        [{label}]
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {isSectional && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowContent((v) => !v)}
                className="text-xs font-bold text-slate-500 hover:text-violet-600 uppercase tracking-wider"
              >
                {showContent ? t.cart_hide_content : t.cart_show_content}
              </button>
              {showContent && (
                <div className="mt-3">
                  {contentLoading ? (
                    <div className="h-24 flex items-center justify-center text-slate-400 text-xs">Ładowanie...</div>
                  ) : (
                    <div className="flex flex-col gap-3 w-full">
                      {baskets.length > 0 && (() => {
                        const stats = contentStats ?? cardStats;
                        return (
                          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600 border-b border-slate-200 pb-2">
                            <span>Zamówienia: {stats.total_orders}</span>
                            <span>Produkty: {stats.total_products} szt.</span>
                            <span>Zajęte koszyki: {stats.baskets_used} / {baskets.length}</span>
                          </div>
                        );
                      })()}
                      {(() => {
                        const sortedRows = [...new Set(baskets.map((b) => b.row))].sort((a, b) => b - a);
                        return sortedRows.map((rowNum) => {
                          const rowBaskets = baskets
                            .filter((b) => b.row === rowNum)
                            .sort((a, b) => a.column - b.column);
                          const cols = rowBaskets.length;
                          return (
                            <div
                              key={rowNum}
                              className="grid gap-2 w-full"
                              style={{ gridTemplateColumns: cols > 0 ? `repeat(${cols}, minmax(0, 1fr))` : "1fr" }}
                            >
                              {rowBaskets.map((b) => renderBasketCell(b))}
                            </div>
                          );
                        });
                      })()}
                      {/* Lista zamówień — ten sam modal co przy kliknięciu badge w koszyku */}
                      {(() => {
                        const byOrder = new Map<
                          number,
                          { order_id: number; order_number: string | null; basket: BasketDetail }
                        >();
                        for (const b of baskets) {
                          if (b.order_id == null || byOrder.has(b.order_id)) continue;
                          byOrder.set(b.order_id, {
                            order_id: b.order_id,
                            order_number: b.order_number ?? null,
                            basket: b,
                          });
                        }
                        const uniqueOrders = Array.from(byOrder.values());
                        if (uniqueOrders.length === 0) return null;
                        return (
                          <div className="mt-4 pt-4 border-t border-slate-200">
                            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                              Lista wszystkich zamówień na wózku
                            </div>
                            <ul className="flex flex-wrap gap-2">
                              {uniqueOrders.map((o) => (
                                <li key={o.order_id}>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setOrderPreview({
                                        orderId: o.order_id,
                                        basketCode: basketSlotCode(o.basket),
                                      })
                                    }
                                    className="px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-200 text-violet-700 text-xs font-semibold hover:bg-violet-100 transition-colors"
                                  >
                                    [{o.order_number ? `#${o.order_number}` : `#${o.order_id}`}]
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        {simulating && (
          <div className="absolute inset-0 rounded-lg bg-white/80 flex items-center justify-center z-10">
            <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      <ImagePreviewModal
        open={previewOpen}
        imageUrl={imageSrc ?? null}
        title={name}
        onClose={() => setPreviewOpen(false)}
      />

      <SimulationResultModal
        open={simulationResult != null}
        assignedCount={simulationResult?.assigned_orders_count ?? 0}
        unassignedCount={simulationResult?.unassigned_orders_count ?? 0}
        utilizationPercent={simulationResult?.cart_utilization_percent ?? 0}
        onClose={closeSimulationModal}
      />

      <OrderProductPreviewModal
        open={orderPreview != null}
        orderId={orderPreview?.orderId ?? null}
        basketCode={orderPreview?.basketCode ?? null}
        onClose={() => setOrderPreview(null)}
      />

      {confirmWholeCartClearOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setConfirmWholeCartClearOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="font-bold text-slate-900 mb-2">{t.clear_cart_confirm_title}</h4>
            <p className="text-sm text-slate-600 mb-4">{t.clear_cart_confirm_body}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmWholeCartClearOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleClearCartConfirm}
                disabled={clearingCart}
                className="px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {clearingCart ? "…" : t.confirm_clear_cart_action}
              </button>
            </div>
          </div>
        </div>
      )}

      {basketToConfirmClear && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setBasketToConfirmClear(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-slate-800 mb-4">
              Remove order {basketToConfirmClear.order_number ? `#${basketToConfirmClear.order_number}` : `#${basketToConfirmClear.order_id}`} from basket {basketToConfirmClear.name && String(basketToConfirmClear.name).trim() ? basketToConfirmClear.name : `S-${basketToConfirmClear.row}-${basketToConfirmClear.column}`}?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBasketToConfirmClear(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearBasketConfirm}
                className="px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700"
              >
                Remove order
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

