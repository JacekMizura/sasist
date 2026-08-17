import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getPickingActiveSession } from "../../api/wmsPickingEntryApi";
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
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import type { WmsPickingCartNavState } from "./wmsPickingFlowTypes";
import {
  AFTER_BATCH_NO_ORDERS_MESSAGE,
  orderTypeAfterBatchState,
} from "./wmsPickingFlowResolve";
import { computeWmsPickingProductLineSessionStats, wmsPickingDisplayPickedQuantity } from "./wmsPickingUiGates";
import { WMS_ROUTES } from "./wmsRoutes";
import { Loader2 } from "lucide-react";
import { wmsTypoClass } from "../../wms/typography/wmsOperatorTypography";

function parseApiDetail(e: unknown): { code?: string; message: string; status?: number } {
  const ax = e as { response?: { status?: number; data?: { detail?: unknown } } };
  const status = ax.response?.status;
  const detail = ax.response?.data?.detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const d = detail as { code?: string; message?: string };
    return {
      code: typeof d.code === "string" ? d.code : undefined,
      message: String(d.message || d.code || "Konflikt"),
      status,
    };
  }
  return { message: String(detail ?? ""), status };
}

/**
 * Popup skanu wózka po wyborze rodzaju zamówień.
 * Wolny wózek → start sesji → lista produktów (bez fałszywego „masz aktywną sesję”).
 */
export default function WmsPickingCartScanPage() {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const { setPickingCart, clearPickingCart } = useWmsPickingCart();
  const { showWmsError, showWmsMessage } = useWmsMessage();
  const {
    registerScanHandler,
    setActiveDocument,
    appendScanToHistory,
    refocusScannerInput,
    setScannerInputPlaceholder,
    showScanFeedbackFromCode,
    showScannerToast,
  } = useWmsScanner();

  const cartNav = routerLocation.state as WmsPickingCartNavState | null;
  const session = cartNav?.pickingSession;
  const afterBatchAssign = Boolean(cartNav?.afterBatchAssign);

  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!session) {
      navigate(WMS_ROUTES.picking, { replace: true });
      return;
    }
    if (session.cartId != null && session.cartId > 0) {
      navigate(WMS_ROUTES.pickingProducts, {
        replace: true,
        state: { pickingSession: { ...session, preCartBack: "status" } },
      });
    }
  }, [session, navigate]);

  useEffect(() => {
    setActiveDocument({ kind: "picking", label: "Zbieranie — wózek" });
    return () => setActiveDocument(null);
  }, [setActiveDocument]);

  useEffect(() => {
    if (session?.cartId != null && session.cartId > 0) return;
    setScannerInputPlaceholder(
      session?.cartType === "BASKETS" ? "Zeskanuj wózek z koszykami" : "Zeskanuj wózek",
    );
    refocusScannerInput();
  }, [setScannerInputPlaceholder, refocusScannerInput, session?.cartId, session?.cartType]);

  const goBackFromCart = useCallback(() => {
    if (!session) {
      navigate(WMS_ROUTES.picking);
      return;
    }
    if (session.preCartBack === "order-type") {
      const { cartCode, cartId, ...rest } = session;
      void cartCode;
      void cartId;
      navigate(WMS_ROUTES.pickingOrderType, { state: { pickingSession: rest } });
    } else {
      navigate(WMS_ROUTES.picking);
    }
  }, [session, navigate]);

  const goNext = useCallback(
    async (cartCode: string) => {
      if (!session || warehouseId == null) return;
      if (session.cartId != null && session.cartId > 0) return;
      const code = cartCode.trim();
      if (!code || resolving) return;
      setResolving(true);
      try {
        // Backend-first: nie ufaj lokalnemu snapshotowi przy starcie nowej tury.
        try {
          const active = await getPickingActiveSession(DAMAGE_TENANT_ID, warehouseId);
          if (!active?.has_active_session) {
            clearPickingCart();
          }
        } catch {
          /* ignore — resolve-cart zdecyduje */
        }

        const r = await getWmsPickingResolveCart(DAMAGE_TENANT_ID, warehouseId, code, {
          expectedCartType: session.cartType ?? null,
          sourceStatusId: session.orderUiStatusId,
        });
        let startResult;
        try {
          startResult = await postWmsPickingStart(
            DAMAGE_TENANT_ID,
            warehouseId,
            r.cart_id,
            session.orderUiStatusId,
            session.orderTypeChoice ?? "all",
          );
        } catch (startErr) {
          if (afterBatchAssign) {
            const parsedStart = parseApiDetail(startErr);
            navigate(WMS_ROUTES.pickingOrderType, {
              replace: true,
              state: orderTypeAfterBatchState(
                session,
                parsedStart.message || "Nie udało się przydzielić kolejnego zbioru.",
              ),
            });
            return;
          }
          throw startErr;
        }
        if (afterBatchAssign && (startResult.session_id == null || startResult.session_id < 1)) {
          navigate(WMS_ROUTES.pickingOrderType, {
            replace: true,
            state: orderTypeAfterBatchState(session, AFTER_BATCH_NO_ORDERS_MESSAGE),
          });
          return;
        }
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
          cartType: (r.cart_type || "").trim().toLowerCase() || undefined,
        });
        navigate(WMS_ROUTES.pickingProducts, {
          state: {
            pickingSession: {
              ...session,
              cartCode: cartCodeResolved,
              cartName: cartName ?? null,
              cartId: r.cart_id,
              physicalCartType: (r.cart_type || "").trim().toLowerCase() || null,
              hubOrderCount,
              hubPickStats,
              assignEmptyMessage: startResult.operator_message ?? null,
              pickingSessionId: startResult.session_id ?? session.pickingSessionId ?? null,
            },
          },
        });
      } catch (e) {
        const parsed = parseApiDetail(e);
        if (parsed.status === 409 && parsed.code === "ACTIVE_PICKING_SESSION") {
          // Tylko gdy BE potwierdza realną otwartą sesję — wróć do produktów.
          try {
            const active = await getPickingActiveSession(DAMAGE_TENANT_ID, warehouseId);
            if (active?.has_active_session && active.cart_id != null && active.cart_id > 0) {
              setPickingCart({
                tenantId: DAMAGE_TENANT_ID,
                warehouseId,
                cartId: active.cart_id,
                cartCode: (active.cart_code || "").trim() || `CART-${active.cart_id}`,
                cartName: active.cart_name?.trim() || undefined,
                cartType:
                  active.cart_type === "BASKETS"
                    ? "multi"
                    : active.cart_type === "BULK"
                      ? "bulk"
                      : undefined,
              });
              navigate(WMS_ROUTES.pickingProducts, {
                replace: true,
                state: {
                  pickingSession: {
                    ...session,
                    cartId: active.cart_id,
                    cartCode: (active.cart_code || "").trim() || `CART-${active.cart_id}`,
                    cartName: active.cart_name?.trim() || null,
                    pickingSessionId: active.session_id ?? session.pickingSessionId ?? null,
                    orderTypeChoice:
                      active.order_type === "single" ||
                      active.order_type === "multi" ||
                      active.order_type === "all"
                        ? active.order_type
                        : session.orderTypeChoice ?? "all",
                  },
                },
              });
              return;
            }
          } catch {
            /* fall through */
          }
        }
        if (parsed.message) {
          showScannerToast(parsed.message);
        } else {
          showWmsError(e);
        }
        showScanFeedbackFromCode("INVALID_CART_SCAN");
        refocusScannerInput();
      } finally {
        setResolving(false);
      }
    },
    [
      session,
      warehouseId,
      resolving,
      navigate,
      appendScanToHistory,
      setPickingCart,
      clearPickingCart,
      showWmsError,
      showWmsMessage,
      showScannerToast,
      refocusScannerInput,
      showScanFeedbackFromCode,
      afterBatchAssign,
    ],
  );

  useEffect(() => {
    if (session?.cartId != null && session.cartId > 0) {
      registerScanHandler(null);
      return;
    }
    const handler = (ean: string) => {
      const scan = normalizeScanEan(ean);
      if (!scan || resolving) return;
      void goNext(scan);
    };
    registerScanHandler(handler);
    return () => registerScanHandler(null);
  }, [registerScanHandler, goNext, resolving, session?.cartId]);

  if (!session || (session.cartId != null && session.cartId > 0)) {
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

  const showBaskets = session.cartType === "BASKETS";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-[2px]"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wms-pick-scan-cart-title"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-8"
      >
        {resolving ? (
          <div className="mb-5 flex justify-center text-slate-400">
            <Loader2 className="h-10 w-10 animate-spin" strokeWidth={2.5} />
          </div>
        ) : null}
        <h2
          id="wms-pick-scan-cart-title"
          className={["text-center font-bold leading-snug text-slate-900", wmsTypoClass.base].join(" ")}
        >
          {resolving
            ? "Weryfikacja wózka…"
            : showBaskets
              ? "Zeskanuj wózek z koszykami. Rozpoczynasz nową turę zbierania."
              : "Zeskanuj wózek. Rozpoczynasz nową turę zbierania."}
        </h2>
        {!resolving ? (
          <p className="mt-3 text-center text-sm leading-relaxed text-slate-500">
            {showBaskets
              ? "Zeskanuj wózek z koszykami, aby przejść do listy produktów."
              : "Zeskanuj wózek aby przejść do listy produktów."}
          </p>
        ) : null}
        <button
          type="button"
          disabled={resolving}
          className="mt-8 inline-flex h-11 w-full items-center justify-center rounded-xl bg-rose-500 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-rose-400 disabled:opacity-50"
          onClick={goBackFromCart}
        >
          Anuluj
        </button>
      </div>
    </div>
  );
}
