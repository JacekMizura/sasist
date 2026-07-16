import { Eraser, Pencil, Printer, Trash2, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";

import api from "../../../api/axios";
import { useTranslation } from "../../../locales";
import { CartFleetDetailPanel } from "../../../modules/carts/cartFleet/CartFleetDetailPanel";
import {
  FleetResourceActionBar,
  FleetResourceActionButton,
} from "../../../modules/fleetResource/FleetResourceActionBar";
import { FleetResourceProgressBar } from "../../../modules/fleetResource/FleetResourceProgressBar";
import {
  fleetResourceMetaItemClass,
  fleetResourceMetaSepClass,
  fleetResourceRowClass,
  fleetResourceShowContentBtnClass,
} from "../../../modules/fleetResource/fleetResourceTokens";
import ImagePreviewModal from "./ImagePreviewModal";
import SimulationResultModal from "./SimulationResultModal";
import { calculateCartStats } from "../cartStats";

type SimulationResult = {
  assigned_orders_count: number;
  unassigned_orders_count: number;
  cart_utilization_percent: number;
  status: string;
};

type AssignedOrderRef = { order_id: number; total_volume_dm3: number };

export type CartCardProps = {
  id: number;
  name: string;
  code?: string | null;
  status: string;
  used_volume?: number;
  total_volume_dm3?: number;
  assigned_orders?: AssignedOrderRef[];
  image_url?: string | null;
  updated_at?: string | number | null;
  total_baskets?: number;
  length?: number;
  width?: number;
  height?: number;
  tenant_id?: number;
  warehouse_id?: number;
  order_numbers?: string[];
  total_weight_kg?: number;
  total_orders?: number;
  total_products?: number;
  baskets_used?: number;
  capacity_mode?: string;
  max_orders?: number | null;
  max_volume_dm3?: number;
  wms_picking_order_count?: number;
  wms_picking_product_count?: number;
  wms_picking_quantity?: number;
  /** Controlled expand — only one cart open in the list. */
  expanded?: boolean;
  onToggleExpand?: () => void;
  onSimulateSuccess?: () => void;
  onClearSuccess?: () => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onPrintLabel?: (cart: { id: number; name: string }) => void;
};

/** Compact fleet resource row (~68px) — wózki BULK i MULTI; content expands under the row. */
export default function CartCard(props: CartCardProps) {
  const {
    id,
    name,
    code: cartCodeProp,
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
    expanded = false,
    onToggleExpand,
    onSimulateSuccess,
    onClearSuccess,
    onEdit,
    onDelete,
    onPrintLabel,
  } = props;

  const isSectional = total_baskets != null && total_baskets > 0;
  const t = useTranslation();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [clearingCart, setClearingCart] = useState(false);
  const [confirmWholeCartClearOpen, setConfirmWholeCartClearOpen] = useState(false);

  const cartCodeDisplay = (cartCodeProp ?? "").trim();
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
    [
      assigned_orders,
      used_volume,
      total_volume_dm3,
      total_weight_kg,
      total_orders_prop,
      total_products_prop,
      baskets_used_prop,
    ],
  );
  const cardStats = useMemo(() => calculateCartStats(listCart), [listCart]);
  const usedVol = cardStats.used_volume_dm3;
  const isSimulated =
    (used_volume == null || used_volume === 0) &&
    Array.isArray(assigned_orders) &&
    assigned_orders.length > 0 &&
    assigned_orders.reduce((s, o) => s + Number(o.total_volume_dm3 ?? 0), 0) > 0;
  const hasImage = Boolean(image_url);
  const imageSrc = useMemo(
    () => (hasImage && image_url ? `${image_url}?v=${updated_at ?? Date.now()}` : null),
    [image_url, updated_at, hasImage],
  );
  const canSimulate = isSectional && tenant_id != null && warehouse_id != null;

  const wmsPickOrders = Number(wms_picking_order_count) || 0;
  const wmsPickProducts = Number(wms_picking_product_count) || 0;
  const wmsPickQty = Number(wms_picking_quantity) || 0;
  const wmsPickingActive = wmsPickOrders > 0 || wmsPickProducts > 0 || wmsPickQty > 0;
  const orderNumbersList = Array.isArray(order_numbers) ? order_numbers : [];
  const assignedOrderCount = assigned_orders?.length ?? 0;
  const canClearCart =
    usedVol > 0 ||
    orderNumbersList.length > 0 ||
    cardStats.total_orders > 0 ||
    assignedOrderCount > 0 ||
    wmsPickingActive;

  const mode = (capacity_mode_prop ?? "volume").toLowerCase();
  const maxVol = Number(max_volume_dm3_prop ?? total_volume_dm3 ?? 0);
  const maxOrd = max_orders_prop != null ? Number(max_orders_prop) : null;
  const volPercent = maxVol > 0 ? Math.min(100, (usedVol / maxVol) * 100) : 0;
  const ordPercent = maxOrd != null && maxOrd > 0 ? Math.min(100, (cardStats.total_orders / maxOrd) * 100) : 0;
  const displayPercent = mode === "orders" ? ordPercent : mode === "mixed" ? Math.min(volPercent, ordPercent) : volPercent;

  const occupiedSections = isSectional ? (baskets_used_prop ?? cardStats.baskets_used) : cardStats.total_orders;
  const sectionsLabel = isSectional ? `${total_baskets} sekc.` : "1 sekc.";
  const occupiedLabel = isSectional ? `${occupiedSections} zajęte` : `${cardStats.total_orders} zam.`;

  const toggleExpand = () => onToggleExpand?.();

  const handleSimulate = async () => {
    if (!canSimulate) return;
    setSimulating(true);
    try {
      const res = await api.post<SimulationResult>("/simulation/assign/", null, {
        params: { tenant_id, warehouse_id, cart_id: id },
      });
      setSimulationResult(res.data);
      onSimulateSuccess?.();
    } catch (err) {
      console.error("Simulation assign error:", err);
    } finally {
      setSimulating(false);
    }
  };

  const handleClearCartConfirm = async () => {
    setClearingCart(true);
    try {
      await api.post(`/carts/${id}/clear/`);
      setConfirmWholeCartClearOpen(false);
      onClearSuccess?.();
    } catch (e) {
      console.error("clear_cart failed:", e);
    } finally {
      setClearingCart(false);
    }
  };

  return (
    <div className="w-full max-w-none">
      <div
        className={`${fleetResourceRowClass} cursor-pointer ${simulating ? "pointer-events-none opacity-70" : ""} ${
          expanded ? "bg-slate-50/80" : ""
        }`}
        onClick={toggleExpand}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleExpand();
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
      >
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white text-slate-300 hover:border-slate-400"
          onClick={(e) => {
            e.stopPropagation();
            setPreviewOpen(true);
          }}
          aria-label="Podgląd zdjęcia"
        >
          {hasImage && imageSrc ? (
            <img src={imageSrc} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[10px] font-medium text-slate-400">{t.imageAbbr}</span>
          )}
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <span className="min-w-0 truncate text-sm font-semibold text-slate-900" title={name}>
            {name}
          </span>
          {cartCodeDisplay ? (
            <>
              <span className={fleetResourceMetaSepClass}>|</span>
              <span className={`${fleetResourceMetaItemClass} font-mono font-medium text-slate-700`} title={cartCodeDisplay}>
                {cartCodeDisplay}
              </span>
            </>
          ) : null}
          <span className={fleetResourceMetaSepClass}>|</span>
          <span className={fleetResourceMetaItemClass}>{Number(total_volume_dm3 ?? 0).toFixed(0)} dm³</span>
          <span className={fleetResourceMetaSepClass}>|</span>
          <span className={fleetResourceMetaItemClass}>{sectionsLabel}</span>
          <span className={fleetResourceMetaSepClass}>|</span>
          <span className={fleetResourceMetaItemClass}>{occupiedLabel}</span>
          {!isSectional && length != null ? (
            <>
              <span className={`${fleetResourceMetaSepClass} lg:inline hidden`}>|</span>
              <span className={`${fleetResourceMetaItemClass} lg:inline hidden tabular-nums`}>
                {length}×{width ?? 0}×{height ?? 0} cm
              </span>
            </>
          ) : null}
        </div>

        <div
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className="flex shrink-0 items-center gap-1"
        >
          <FleetResourceProgressBar percent={displayPercent} isSimulated={isSimulated} />

          <FleetResourceActionBar aria-label="Akcje wózka">
            <FleetResourceActionButton onClick={() => onEdit(id)} title={t.edit} aria-label={t.edit}>
              <Pencil strokeWidth={2} aria-hidden />
            </FleetResourceActionButton>
            {onPrintLabel ? (
              <FleetResourceActionButton
                onClick={() => onPrintLabel({ id, name })}
                title="Drukuj etykietę"
                aria-label="Drukuj etykietę"
              >
                <Printer strokeWidth={2} aria-hidden />
              </FleetResourceActionButton>
            ) : null}
            {canClearCart ? (
              <FleetResourceActionButton
                variant="warn"
                disabled={clearingCart}
                onClick={() => setConfirmWholeCartClearOpen(true)}
                title={t.clear_cart}
                aria-label={t.clear_cart}
              >
                <Eraser strokeWidth={2} aria-hidden />
              </FleetResourceActionButton>
            ) : null}
            <FleetResourceActionButton variant="danger" onClick={() => onDelete(id)} title={t.delete} aria-label={t.delete}>
              <Trash2 strokeWidth={2} aria-hidden />
            </FleetResourceActionButton>
            {canSimulate ? (
              <FleetResourceActionButton
                disabled={simulating}
                onClick={() => void handleSimulate()}
                title={t.simulation_assign_button}
                aria-label={t.simulation_assign_button}
              >
                <Wand2 strokeWidth={2} aria-hidden />
              </FleetResourceActionButton>
            ) : null}
          </FleetResourceActionBar>

          <button
            type="button"
            className={fleetResourceShowContentBtnClass}
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand();
            }}
          >
            {expanded ? t.cart_hide_content : t.cart_show_content}
          </button>
        </div>

        {simulating ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
          </div>
        ) : null}
      </div>

      <CartFleetDetailPanel
        open={expanded}
        cartId={id}
        cartName={name}
        isSectional={isSectional}
        onClose={() => {
          if (expanded) onToggleExpand?.();
        }}
        onClearSuccess={onClearSuccess}
      />

      <ImagePreviewModal open={previewOpen} imageUrl={imageSrc ?? null} title={name} onClose={() => setPreviewOpen(false)} />

      <SimulationResultModal
        open={simulationResult != null}
        assignedCount={simulationResult?.assigned_orders_count ?? 0}
        unassignedCount={simulationResult?.unassigned_orders_count ?? 0}
        utilizationPercent={simulationResult?.cart_utilization_percent ?? 0}
        onClose={() => {
          setSimulationResult(null);
          onSimulateSuccess?.();
        }}
      />

      {confirmWholeCartClearOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
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
    </div>
  );
}
