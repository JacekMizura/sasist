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
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import type { WmsPickingCartNavState } from "./wmsPickingFlowTypes";
import { computeWmsPickingProductLineSessionStats, wmsPickingDisplayPickedQuantity } from "./wmsPickingUiGates";
import { WMS_ROUTES } from "./wmsRoutes";
import { Loader2 } from "lucide-react";
import { PickingSimpleHeader } from "../../components/wms/picking/PickingSimpleHeader";
import { PickingProcessAlert } from "../../components/wms/picking/PickingProcessAlert";
import { wmsTypoClass } from "../../wms/typography/wmsOperatorTypography";

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
    showScanFeedbackFromCode,
  } = useWmsScanner();

  const session = (routerLocation.state as WmsPickingCartNavState | null)?.pickingSession;

  const [resolving, setResolving] = useState(false);
  const [cartAlert, setCartAlert] = useState<string | null>(null);
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
        // resolve-cart returns plain 404 string; start returns structured WMS_* — both via showWmsError.
        showWmsError(e);
        showScanFeedbackFromCode("INVALID_CART_SCAN");
        setCartAlert("Nieprawidłowy wózek. Zeskanuj właściwy wózek.");
        refocusScannerInput();
      } finally {
        setResolving(false);
      }
    },
    [session, warehouseId, navigate, appendScanToHistory, setPickingCart, showWmsError, showWmsMessage, refocusScannerInput, showScanFeedbackFromCode],
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

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-white select-none">
      <PickingSimpleHeader
        onBack={goBackFromCart}
        backAriaLabel={
          session.preCartBack === "order-type"
            ? "Wróć do wyboru rodzaju zamówień"
            : "Wróć do wyboru statusu"
        }
        title={showBaskets ? "Zeskanuj wózek z koszykami" : "Zeskanuj wózek"}
      />
      <PickingProcessAlert
        open={cartAlert != null}
        message={cartAlert}
        onClose={() => setCartAlert(null)}
      />

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
        <div className="w-full max-w-md text-center">
          {resolving ? (
            <div className="mb-6 flex justify-center text-slate-400">
              <Loader2 className="h-12 w-12 animate-spin" strokeWidth={2.5} />
            </div>
          ) : null}
          <p className={["font-semibold text-slate-900", wmsTypoClass.base].join(" ")}>
            {resolving
              ? "Weryfikacja wózka…"
              : "Zeskanuj wózek. Rozpoczynasz nową turę zbierania."}
          </p>
          {!resolving ? (
            <p className="mt-3 text-sm text-slate-500">
              {showBaskets
                ? "Zeskanuj wózek z koszykami, aby przejść do listy produktów."
                : "Zeskanuj wózek, aby przejść do listy produktów."}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
