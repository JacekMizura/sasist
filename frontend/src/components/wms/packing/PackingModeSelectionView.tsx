import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Barcode } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getWmsBasketPackingOrder } from "../../../api/wmsPackingApi";
import { getWmsPickingResolveCart, postWmsPackingStartCart } from "../../../api/wmsPickingProductsApi";
import { scanErrorMessage } from "./packingHelpers";
import { useWmsScanner } from "../../../context/WmsScannerContext";
import type { OrderUiMainGroup } from "../../../types/orderUiStatus";
import { panelSidebarSubCountBadgeStyle } from "../../../utils/panelSidebarHierarchy";
import { normalizeScanEan } from "../../../utils/wmsScanNormalize";
import { playScanBeep } from "../../../utils/playScanBeep";
import { DAMAGE_TENANT_ID } from "../../../pages/damage/damageShared";
import {
  cartTypeMatchesPackingMode,
  loadWmsPackingSession,
  patchWmsPackingSession,
  saveWmsPackingSession,
  type WmsPackingMode,
} from "../../../pages/wms/wmsPackingSession";
import { WMS_ROUTES } from "../../../pages/wms/wmsRoutes";
import { wmsPackingApiErrorCode, wmsPackingApiErrorMessage } from "../../../api/wmsPackingApi";

export type PackingModeSelectionViewProps = {
  statusName: string;
  statusColor: string;
  mainGroup: OrderUiMainGroup;
  modes: { no_cart: number; bulk: number; baskets: number };
  warehouseId: number;
};

type ScanTarget = "bulk" | "baskets";

export function PackingModeSelectionView({
  statusName,
  statusColor,
  mainGroup,
  modes,
  warehouseId,
}: PackingModeSelectionViewProps) {
  const navigate = useNavigate();
  const {
    registerScanHandler,
    setScannerInputPlaceholder,
    refocusScannerInput,
    appendScanToHistory,
    showScannerToast,
  } = useWmsScanner();

  const [scanTarget, setScanTarget] = useState<ScanTarget | null>(null);
  const scanBusyRef = useRef(false);

  const badgeStyle = panelSidebarSubCountBadgeStyle(statusColor, mainGroup);

  const goToOrdersNoCart = useCallback(() => {
    const cur = loadWmsPackingSession();
    if (!cur) return;
    saveWmsPackingSession({
      ...cur,
      mode: "no_cart",
      cartId: undefined,
      cartCode: undefined,
      cartType: undefined,
    });
    navigate(WMS_ROUTES.packingOrders, { replace: true });
  }, [navigate]);

  const goToBasketsEntry = useCallback(() => {
    const cur = loadWmsPackingSession();
    if (!cur) return;
    saveWmsPackingSession({
      ...cur,
      mode: "baskets",
      cartId: undefined,
      cartCode: undefined,
      cartType: undefined,
    });
    setScanTarget("baskets");
  }, []);

  const finishCartScan = useCallback(
    async (mode: WmsPackingMode, r: Awaited<ReturnType<typeof getWmsPickingResolveCart>>) => {
      const code = (r.code && r.code.trim()) || r.barcode?.trim() || "";
      try {
        await postWmsPackingStartCart(DAMAGE_TENANT_ID, warehouseId, r.cart_id);
      } catch {
        /* start_packing may already be PACKING — continue */
      }
      patchWmsPackingSession({
        mode,
        cartId: r.cart_id,
        cartCode: code || undefined,
        cartType: r.cart_type?.trim() || undefined,
      });
      playScanBeep();
      if (code) appendScanToHistory(code);
      setScanTarget(null);
      navigate(WMS_ROUTES.packingOrders, { replace: true });
    },
    [navigate, appendScanToHistory, warehouseId],
  );

  const modalTitle =
    scanTarget === "baskets" ? "Zeskanuj koszyk" : scanTarget === "bulk" ? "Zeskanuj wózek" : "";

  const handleModalScan = useCallback(
    async (raw: string) => {
      if (scanTarget == null || scanBusyRef.current) return;
      const scan = normalizeScanEan(raw);
      if (!scan) return;
      scanBusyRef.current = true;
      try {
        if (scanTarget === "baskets") {
          const s = loadWmsPackingSession();
          if (!s) return;
          try {
            const br = await getWmsBasketPackingOrder(
              DAMAGE_TENANT_ID,
              warehouseId,
              s.statusId,
              scan,
            );
            playScanBeep();
            appendScanToHistory(scan);
            patchWmsPackingSession({ mode: "baskets" });
            setScanTarget(null);
            navigate(WMS_ROUTES.packingOrder(br.order_id), { replace: true });
          } catch (e) {
            const code = wmsPackingApiErrorCode(e);
            showScannerToast(wmsPackingApiErrorMessage(e) || scanErrorMessage(code));
          }
          return;
        }

        let r: Awaited<ReturnType<typeof getWmsPickingResolveCart>> | null = null;
        try {
          r = await getWmsPickingResolveCart(DAMAGE_TENANT_ID, warehouseId, scan);
        } catch (e) {
          if (axios.isAxiosError(e) && e.response != null && e.response.status >= 500) {
            showScannerToast("Błąd serwera przy rozpoznawaniu wózka.");
          } else {
            showScannerToast("Nie rozpoznano wózka — sprawdź kod.");
          }
          return;
        }
        if (r == null) return;
        const mode: WmsPackingMode = "bulk";
        if (!cartTypeMatchesPackingMode(mode, r.cart_type)) {
          showScannerToast("Ten wózek nie jest wózkiem BULK.");
          return;
        }
        await finishCartScan(mode, r);
      } finally {
        scanBusyRef.current = false;
        refocusScannerInput();
      }
    },
    [
      scanTarget,
      warehouseId,
      showScannerToast,
      refocusScannerInput,
      finishCartScan,
      appendScanToHistory,
      navigate,
    ],
  );

  useEffect(() => {
    if (scanTarget == null) {
      registerScanHandler(null);
      setScannerInputPlaceholder("Wybierz opcję pakowania");
      refocusScannerInput();
      return;
    }
    setScannerInputPlaceholder(
      scanTarget === "baskets" ? "Zeskanuj kod koszyka (np. S-1-1)" : "Zeskanuj kod wózka BULK",
    );
    refocusScannerInput();
    registerScanHandler((x) => {
      void handleModalScan(x);
    });
    return () => {
      registerScanHandler(null);
    };
  }, [scanTarget, registerScanHandler, handleModalScan, setScannerInputPlaceholder, refocusScannerInput]);

  useEffect(() => {
    if (scanTarget == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setScanTarget(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scanTarget]);

  const showBulkScan = modes.bulk > 0;
  const showBasketsScan = modes.baskets > 0;

  const modalNode =
    scanTarget != null ? (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-[2px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="packing-scan-modal-title"
        onClick={() => setScanTarget(null)}
      >
        <div
          className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white px-8 py-10 shadow-2xl sm:px-12 sm:py-12"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-950"
            onClick={() => setScanTarget(null)}
          >
            Anuluj
          </button>
          <h2 id="packing-scan-modal-title" className="pr-16 text-center text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            {modalTitle}
          </h2>
          <div className="mt-10 flex flex-col items-center">
            <Barcode className="h-28 w-28 text-slate-900 sm:h-36 sm:w-36" strokeWidth={1.15} aria-hidden />
            <p className="mt-8 text-center text-lg font-semibold text-slate-900 sm:text-xl">
              {scanTarget === "baskets" ? "Zeskanuj kod koszyka" : "Zeskanuj kod wózka"}
            </p>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <div className="flex flex-col items-stretch">
      <div className="flex flex-col items-center text-center">
        <p
          className="inline-flex max-w-full items-center justify-center rounded-2xl px-6 py-3 text-3xl font-black tracking-tight text-neutral-950 shadow-md sm:text-4xl sm:px-8 sm:py-4"
          style={badgeStyle}
        >
          <span className="truncate">{statusName}</span>
        </p>
      </div>

      <ul className="mt-10 grid list-none grid-cols-1 gap-4 p-0 sm:mt-12 sm:gap-5" aria-label="Wejścia pakowania według handoff">
        {showBulkScan ? (
          <li>
            <button
              type="button"
              className="flex w-full min-h-[5.5rem] items-center justify-center rounded-xl border border-slate-200/95 bg-white px-6 py-5 text-center text-xl font-bold text-slate-900 shadow-sm transition-[box-shadow,background-color] hover:bg-slate-50 hover:shadow-md sm:min-h-[6rem] sm:text-2xl"
              onClick={() => setScanTarget("bulk")}
            >
              Zeskanuj wózek
              <span className="ml-3 text-base font-semibold text-slate-500">({modes.bulk})</span>
            </button>
          </li>
        ) : null}
        {showBasketsScan ? (
          <li>
            <button
              type="button"
              className="flex w-full min-h-[5.5rem] items-center justify-center rounded-xl border border-slate-200/95 bg-white px-6 py-5 text-center text-xl font-bold text-slate-900 shadow-sm transition-[box-shadow,background-color] hover:bg-slate-50 hover:shadow-md sm:min-h-[6rem] sm:text-2xl"
              onClick={goToBasketsEntry}
            >
              Zeskanuj koszyk
              <span className="ml-3 text-base font-semibold text-slate-500">({modes.baskets})</span>
            </button>
          </li>
        ) : null}
        {modes.no_cart > 0 ? (
          <li>
            <button
              type="button"
              className="flex w-full min-h-[5.5rem] items-center justify-center rounded-xl border border-slate-200/95 bg-white px-6 py-5 text-center text-xl font-bold text-slate-900 shadow-sm transition-[box-shadow,background-color] hover:bg-slate-50 hover:shadow-md sm:min-h-[6rem] sm:text-2xl"
              onClick={goToOrdersNoCart}
            >
              Bez wózka — {modes.no_cart} zamówień
            </button>
          </li>
        ) : null}
      </ul>

      {typeof document !== "undefined" && modalNode ? createPortal(modalNode, document.body) : null}
    </div>
  );
}
