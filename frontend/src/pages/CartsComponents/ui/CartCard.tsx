import ProgressBar from "./ProgressBar";
import StatusPill from "./StatusPill";
import ImagePreviewModal from "./ImagePreviewModal";
import SimulationResultModal from "./SimulationResultModal";
import OrderProductPreviewModal from "./OrderProductPreviewModal";
import { CubeIcon, PencilIcon, TrashIcon, MagicWandIcon, ScaleIcon, PackageIcon, ClearIcon } from "./Icons";
import { useState, useEffect } from "react";
import { useTranslation } from "../../../locales";
import api from "../../../api/axios";

type BasketDetail = {
  id: number;
  name: string | null;
  row: number;
  column: number;
  length?: number;
  width?: number;
  height?: number;
  order_id: number | null;
  order_number: string | null;
  used_volume_dm3: number;
  total_weight_kg?: number;
};

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
  status: string;
  used_volume?: number;
  total_volume_dm3?: number;
  /** Fallback: if used_volume missing, sum from here; progress bar shows purple (simulated) */
  assigned_orders?: AssignedOrderRef[];
  image_url?: string | null;
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
  onSimulateSuccess?: () => void;
  onClearSuccess?: () => void;
  // Actions
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
};

export default function CartCard(props: CartCardProps) {
  const {
    id,
    name,
    status,
    used_volume,
    total_volume_dm3,
    assigned_orders,
    image_url,
    total_baskets,
    length,
    width,
    height,
    tenant_id,
    warehouse_id,
    order_numbers = [],
    total_weight_kg,
    onSimulateSuccess,
    onClearSuccess,
    onEdit,
    onDelete,
  } = props;

  const isSectional = total_baskets != null && total_baskets > 0;
  const isBulk = !isSectional;

  const t = useTranslation();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [showContent, setShowContent] = useState(false);
  const [baskets, setBaskets] = useState<BasketDetail[]>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const [clearingCart, setClearingCart] = useState(false);
  const [clearingBasketId, setClearingBasketId] = useState<number | null>(null);
  const [orderPreviewOrderId, setOrderPreviewOrderId] = useState<number | null>(null);

  useEffect(() => {
    if (!showContent || !isSectional || !id) {
      setBaskets([]);
      return;
    }
    let cancelled = false;
    setContentLoading(true);
    api
      .get<{ baskets: BasketDetail[] }>(`/carts/${id}/`)
      .then((res) => {
        if (!cancelled) setBaskets(res.data.baskets || []);
      })
      .catch(() => {
        if (!cancelled) setBaskets([]);
      })
      .finally(() => {
        if (!cancelled) setContentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showContent, isSectional, id]);

  const totalVol = Number(total_volume_dm3 ?? 0);
  const fallbackFromAssigned = Array.isArray(assigned_orders) && assigned_orders.length > 0
    ? assigned_orders.reduce((sum, o) => sum + Number((o as AssignedOrderRef).total_volume_dm3 ?? 0), 0)
    : 0;
  const usedVol = (used_volume != null && used_volume > 0)
    ? Number(used_volume)
    : fallbackFromAssigned;
  const isSimulated = (used_volume == null || used_volume === 0) && fallbackFromAssigned > 0;
  const occupancyPercent = totalVol > 0 ? Math.min(100, (usedVol / totalVol) * 100) : 0;

  const hasImage = Boolean(image_url);
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

  const orderNumbersList = Array.isArray(order_numbers) ? order_numbers : [];
  const orderLabel =
    orderNumbersList.length === 0
      ? null
      : orderNumbersList.length <= 3
        ? `#${orderNumbersList.join(", #")}`
        : `${orderNumbersList.length} szt.`;

  const handleClearCart = async () => {
    setClearingCart(true);
    try {
      await api.post(`/carts/${id}/clear/`);
      onClearSuccess?.();
      setShowContent(false);
      setBaskets([]);
    } finally {
      setClearingCart(false);
    }
  };

  const handleClearBasket = async (basketId: number) => {
    setClearingBasketId(basketId);
    try {
      await api.post(`/carts/basket/${basketId}/clear/`);
      const res = await api.get<{ baskets: BasketDetail[] }>(`/carts/${id}/`);
      setBaskets(res.data.baskets || []);
      onClearSuccess?.();
    } finally {
      setClearingBasketId(null);
    }
  };

  const renderBasketCell = (b: BasketDetail) => {
    const cap = (Number(b.length || 0) * Number(b.width || 0) * Number(b.height || 0)) / 1000;
    const occupancyPct = cap > 0 ? (b.used_volume_dm3 / cap) * 100 : 0;
    const fillColor =
      occupancyPct > 100
        ? "bg-red-500 animate-pulse"
        : occupancyPct >= 81
          ? "bg-red-500"
          : occupancyPct >= 51
            ? "bg-amber-500"
            : "bg-emerald-500";
    const basketName = b.name && String(b.name).trim() ? b.name : `R${b.row}/K${b.column}`;
    const occupancyLabel = `${occupancyPct.toFixed(2)}%${occupancyPct > 100 ? " (przepełnienie)" : ""}`;
    const orderLabel = b.order_id ? (b.order_number ? `#${b.order_number}` : `#${b.order_id}`) : "—";
    return (
      <div
        key={b.id}
        className={`rounded-lg border p-2 flex flex-col gap-1 relative min-h-[4rem] ${
          b.order_id ? "bg-violet-50 border-violet-300 text-violet-800" : "bg-slate-100 border-slate-200 text-slate-500"
        }`}
        title={b.order_id ? t.cart_basket_occupied : t.cart_basket_empty}
      >
        {b.order_id && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleClearBasket(b.id);
            }}
            disabled={clearingBasketId === b.id}
            className="absolute top-1 right-1 w-5 h-5 rounded bg-white/90 hover:bg-amber-200 flex items-center justify-center text-slate-500 hover:text-amber-700 border border-slate-200"
            aria-label={t.clear_basket}
            title={t.clear_basket}
          >
            <ClearIcon className="w-3 h-3" />
          </button>
        )}
        <div className="font-black text-[10px] uppercase text-slate-700 truncate">{basketName}</div>
        <div className="flex items-center gap-1 text-[10px]">
          <PackageIcon className="w-3 h-3 text-slate-400 shrink-0" />
          {b.order_id ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setOrderPreviewOrderId(b.order_id!); }}
              className="font-semibold truncate hover:underline text-left"
            >
              {orderLabel}
            </button>
          ) : (
            <span className="font-semibold truncate">{orderLabel}</span>
          )}
        </div>
        <div className="flex items-center gap-1 text-[10px]">
          <ScaleIcon className="w-3 h-3 text-slate-400 shrink-0" />
          <span className="truncate">{(b.total_weight_kg ?? 0) > 0 ? `${Number(b.total_weight_kg).toFixed(2)} kg` : "—"}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden min-w-0">
            <div
              className={`h-full ${fillColor} rounded-full transition-all`}
              style={{ width: `${Math.min(100, occupancyPct)}%` }}
            />
          </div>
          <span className="text-[9px] font-bold text-slate-500 shrink-0">{occupancyLabel}</span>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className={`group bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-5 flex gap-5 relative ${simulating ? "pointer-events-none opacity-70" : ""}`}>
        <button
          className="w-16 h-16 rounded-lg bg-slate-50 border border-slate-200 overflow-hidden flex items-center justify-center text-slate-300 hover:border-blue-600 transition-colors"
          onClick={() => setPreviewOpen(true)}
          aria-label="Open image preview"
          type="button"
        >
          {hasImage ? (
            <img src={image_url!} alt={name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-[10px] font-black uppercase">{t.imageAbbr}</span>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="font-black text-slate-800 uppercase truncate">{name}</div>
              <div className="mt-2 flex items-center gap-3">
                <StatusPill status={status} />
                <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <CubeIcon className="w-4 h-4 text-slate-300" />
                  {Number(total_volume_dm3 ?? 0).toFixed(1)} dm³
                </div>
                {isSectional ? (
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {t.sections}: {total_baskets}
                  </div>
                ) : (
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {length ?? 0}×{width ?? 0}×{height ?? 0} cm
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              {(usedVol > 0 || orderNumbersList.length > 0) && (
                <button
                  onClick={handleClearCart}
                  disabled={clearingCart}
                  className="w-9 h-9 rounded-full bg-slate-50 hover:bg-amber-500 text-slate-500 hover:text-white border border-slate-200 hover:border-amber-500 transition-colors flex items-center justify-center"
                  aria-label={t.clear_cart}
                  title={t.clear_cart}
                  type="button"
                >
                  <ClearIcon className="w-4 h-4" />
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
              <button
                onClick={() => onEdit(id)}
                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-blue-600 text-slate-500 hover:text-white border border-slate-200 hover:border-blue-600 transition-colors flex items-center justify-center"
                aria-label={t.edit}
                type="button"
              >
                <PencilIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => onDelete(id)}
                className="w-9 h-9 rounded-full bg-slate-50 hover:bg-red-600 text-slate-500 hover:text-white border border-slate-200 hover:border-red-600 transition-colors flex items-center justify-center"
                aria-label={t.delete}
                type="button"
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="mt-4" key={`${id}-${usedVol}`}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-medium text-slate-500">
                {usedVol.toFixed(1)} / {totalVol > 0 ? totalVol.toFixed(1) : "0"} dm³
              </span>
            </div>
            <ProgressBar percent={occupancyPercent} isSimulated={isSimulated} />
          </div>

          {(Number(total_weight_kg ?? 0) > 0 || orderNumbersList.length > 0) && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
              {Number(total_weight_kg ?? 0) > 0 && (
                <span className="flex items-center gap-1.5" title={t.weight}>
                  <ScaleIcon className="w-4 h-4 text-slate-400" />
                  {t.current_weight ?? "Aktualna waga"}: {Number(total_weight_kg).toFixed(2)} kg
                </span>
              )}
              {orderNumbersList.length > 0 && !isBulk && (
                <span
                  className="flex items-center gap-1.5"
                  title={orderNumbersList.length > 3 ? orderNumbersList.map((n) => `#${n}`).join(", ") : undefined}
                >
                  <PackageIcon className="w-4 h-4 text-slate-400" />
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
                        onClick={() => setOrderPreviewOrderId(ref.order_id)}
                        className="px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-200 text-violet-700 text-xs font-semibold hover:bg-violet-100 transition-colors"
                      >
                        {label}
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
                      {/* Top = first row (8 narrow), Middle = second (4), Bottom = third (2). flex-col = column, no reverse. */}
                      {(() => {
                        const sortedRows = [...new Set(baskets.map((b) => b.row))].sort((a, b) => a - b).slice(0, 3);
                        const colCounts = [8, 4, 2];
                        return sortedRows.map((rowNum, idx) => {
                          const rowBaskets = baskets
                            .filter((b) => b.row === rowNum)
                            .sort((a, b) => a.column - b.column);
                          const cols = colCounts[idx] ?? 8;
                          return (
                            <div
                              key={rowNum}
                              className="grid gap-2 w-full"
                              style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                            >
                              {rowBaskets.map((b) => renderBasketCell(b))}
                            </div>
                          );
                        });
                      })()}
                      {/* Lista wszystkich zamówień na wózku — same as Standard Carts: click opens Product Preview */}
                      {(() => {
                        const uniqueOrders = Array.from(
                          new Map(
                            baskets
                              .filter((b) => b.order_id != null)
                              .map((b) => [b.order_id!, { order_id: b.order_id!, order_number: b.order_number ?? null }])
                          ).values()
                        );
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
                                    onClick={() => setOrderPreviewOrderId(o.order_id)}
                                    className="px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-200 text-violet-700 text-xs font-semibold hover:bg-violet-100 transition-colors"
                                  >
                                    {o.order_number ? `#${o.order_number}` : `#${o.order_id}`}
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
        imageUrl={image_url ?? null}
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
        open={orderPreviewOrderId != null}
        orderId={orderPreviewOrderId}
        onClose={() => setOrderPreviewOrderId(null)}
      />
    </>
  );
}

