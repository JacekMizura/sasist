import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  getWmsPickingProductLines,
  getWmsPickingResolveCart,
  postWmsPickingStart,
} from "../../api/wmsPickingProductsApi";
import { useWmsMessage } from "../../components/wms/WmsMessageProvider";
import { useWmsPickingCart } from "../../context/WmsPickingCartContext";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { playScanBeep } from "../../utils/playScanBeep";
import { normalizeScanEan } from "../../utils/wmsScanNormalize";
import { panelSidebarSubCountBadgeStyle } from "../../utils/panelSidebarHierarchy";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import type { WmsPickingCartNavState } from "./wmsPickingFlowTypes";
import { WmsPickingSessionTopBar } from "./WmsPickingSessionTopBar";
import { computeWmsPickingProductLineSessionStats, wmsPickingDisplayPickedQuantity } from "./wmsPickingUiGates";
import { WMS_ROUTES } from "./wmsRoutes";
import { Loader2, ShoppingCart, ShoppingBasket, ListTodo } from "lucide-react";

export default function WmsPickingCartScanPage() {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const { setPickingCart } = useWmsPickingCart();
  const { showWmsError, showWmsMessage } = useWmsMessage();
  const {
    registerScanHandler,
    setActiveDocument,
    appendScanToHistory,
    refocusScannerInput,
    setScannerInputPlaceholder,
  } = useWmsScanner();

  const session = (routerLocation.state as WmsPickingCartNavState | null)?.pickingSession;

  const [resolving, setResolving] = useState(false);
  /** SSOT counters for the scanned cart — never show status-level hub stats as cart truth. */
  const [cartScopedStats, setCartScopedStats] = useState<{
    hubOrderCount: number;
    hubPickStats: { zebrane: number; doZebrania: number; wTrakcie: number; braki?: number };
  } | null>(null);

  useEffect(() => {
    if (!session) {
      navigate(WMS_ROUTES.picking, { replace: true });
    }
  }, [session, navigate]);

  useEffect(() => {
    setActiveDocument({ kind: "picking", label: "Zbieranie — wózek" });
    return () => setActiveDocument(null);
  }, [setActiveDocument]);

  useEffect(() => {
    setScannerInputPlaceholder("Zeskanuj wózek");
    refocusScannerInput();
  }, [setScannerInputPlaceholder, refocusScannerInput]);

  const goNext = useCallback(
    async (cartCode: string) => {
      if (!session || warehouseId == null) return;
      const code = cartCode.trim();
      if (!code) return;
      setResolving(true);
      setCartScopedStats(null);
      try {
        const r = await getWmsPickingResolveCart(DAMAGE_TENANT_ID, warehouseId, code);
        const startResult = await postWmsPickingStart(
          DAMAGE_TENANT_ID,
          warehouseId,
          r.cart_id,
          session.orderUiStatusId,
          session.orderTypeChoice ?? "all",
        );
        if (startResult.operator_message) {
          showWmsMessage({
            code: "PICK_NO_ASSIGNABLE_AFTER_VALIDATION",
            severity: "WARNING",
            title: "Zbieranie",
            message: startResult.operator_message,
            details: null,
            suggested_action: null,
          });
        }
        // Refetch SSOT for THIS cart — invalidates stale hubPickStats from status selection.
        const linesResult = await getWmsPickingProductLines(
          DAMAGE_TENANT_ID,
          warehouseId,
          session.orderUiStatusId,
          session.orderTypeChoice ?? "all",
          r.cart_id,
          null,
          null,
          { force: true },
        );
        const hubOrderCount =
          typeof linesResult.cohort_order_count === "number" ? linesResult.cohort_order_count : 0;
        let hubPickStats = { zebrane: 0, doZebrania: 0, wTrakcie: 0, braki: 0 };
        if (linesResult.session_stats) {
          hubPickStats = {
            zebrane: linesResult.session_stats.zebrane ?? 0,
            doZebrania: linesResult.session_stats.do_zebrania ?? 0,
            wTrakcie: linesResult.session_stats.w_trakcie ?? 0,
            braki: linesResult.session_stats.braki_szt ?? linesResult.session_stats.braki ?? 0,
          };
        } else {
          const normalized = (linesResult.products ?? []).map((row) => ({
            ...row,
            picked_quantity: wmsPickingDisplayPickedQuantity(row),
          }));
          const computed = computeWmsPickingProductLineSessionStats(normalized);
          hubPickStats = {
            zebrane: computed.zebrane,
            doZebrania: computed.doZebrania,
            wTrakcie: computed.wTrakcie,
            braki: computed.brakiSzt,
          };
        }
        setCartScopedStats({ hubOrderCount, hubPickStats });
        playScanBeep();
        appendScanToHistory(code);
        const cartCodeResolved = (r.code && r.code.trim()) || r.barcode?.trim() || code;
        const cartName =
          (r.display_name && r.display_name.trim()) || (r.name && r.name.trim()) || undefined;
        setPickingCart({
          tenantId: DAMAGE_TENANT_ID,
          warehouseId,
          cartId: r.cart_id,
          cartCode: cartCodeResolved,
          cartName,
        });
        navigate(WMS_ROUTES.pickingProducts, {
          state: {
            pickingSession: {
              ...session,
              cartCode: cartCodeResolved,
              cartName: cartName ?? null,
              cartId: r.cart_id,
              hubOrderCount,
              hubPickStats,
              assignEmptyMessage: startResult.operator_message ?? null,
            },
          },
        });
      } catch (e) {
        showWmsError(e);
      } finally {
        setResolving(false);
      }
    },
    [session, warehouseId, navigate, appendScanToHistory, setPickingCart, showWmsError, showWmsMessage],
  );

  useEffect(() => {
    const handler = (ean: string) => {
      const scan = normalizeScanEan(ean);
      if (!scan || resolving) return;
      void goNext(scan);
    };
    registerScanHandler(handler);
    return () => registerScanHandler(null);
  }, [registerScanHandler, goNext, resolving]);

  if (!session) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 bg-white px-6 text-center text-sm font-medium text-slate-500">
        Przekierowanie…
      </div>
    );
  }

  if (warehouseId == null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-6">
        <p className="text-slate-500 font-bold tracking-widest uppercase">
          Wybierz magazyn w nagłówku WMS.
        </p>
      </div>
    );
  }

  const badgeStyle = panelSidebarSubCountBadgeStyle(session.orderUiStatusColor, session.mainGroup);
  // Before/during cart resolve: do not paint status-level hubPickStats as cart truth.
  const hubOrderCount = cartScopedStats?.hubOrderCount ?? null;
  const hubPickStats = cartScopedStats?.hubPickStats ?? null;

  const goBackFromCart = () => {
    if (session.preCartBack === "order-type") {
      const { cartCode, cartId, ...rest } = session;
      void cartCode;
      void cartId;
      navigate(WMS_ROUTES.pickingOrderType, { state: { pickingSession: rest } });
    } else {
      navigate(WMS_ROUTES.picking);
    }
  };

  const showBaskets = session.cartType === "BASKETS";
  const showBulk = session.cartType === "BULK" || (!showBaskets && session.requireCart);

  return (
    <div className="flex min-h-screen flex-col bg-white select-none">
      <WmsPickingSessionTopBar
        onBack={goBackFromCart}
        backAriaLabel={
          session.preCartBack === "order-type"
            ? "Wróć do wyboru rodzaju zamówień"
            : "Wróć do wyboru statusu"
        }
        orderCount={hubOrderCount}
        pickStats={hubPickStats}
        statusName={session.orderUiStatusName}
        statusBadgeStyle={badgeStyle}
      />

      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 animate-in fade-in duration-500">
        <div className="w-full max-w-[580px] flex flex-col items-center">
          <div className="relative mb-10 flex items-center justify-center">
            {resolving ? (
              <div className="w-28 h-28 rounded-[2rem] bg-indigo-50 border-2 border-indigo-100 flex items-center justify-center text-[#5a4fcf] shadow-sm">
                <Loader2 className="animate-spin w-12 h-12" strokeWidth={2.5} />
              </div>
            ) : (
              <>
                <div className="absolute w-36 h-36 rounded-full bg-indigo-100/40 animate-ping" />
                <div className="absolute w-44 h-44 rounded-full bg-indigo-50/30 animate-pulse duration-1000" />
                <div className="relative w-28 h-28 rounded-[2rem] bg-indigo-50 border-2 border-indigo-100 flex items-center justify-center text-[#5a4fcf] shadow-sm">
                  {showBaskets ? (
                    <ShoppingBasket size={48} strokeWidth={2} />
                  ) : showBulk ? (
                    <ShoppingCart size={48} strokeWidth={2} />
                  ) : (
                    <ListTodo size={48} strokeWidth={2} />
                  )}
                </div>
              </>
            )}
          </div>

          <h2 className="text-xl sm:text-2xl font-medium text-slate-400 tracking-wider uppercase text-center">
            {resolving ? "Weryfikacja wózka..." : "Zeskanuj wózek"}
          </h2>
        </div>
      </div>
    </div>
  );
}
