import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Barcode } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getWmsPickingResolveCart } from "../../../api/wmsPickingProductsApi";
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

  const finishCartScan = useCallback(
    (mode: WmsPackingMode, r: Awaited<ReturnType<typeof getWmsPickingResolveCart>>) => {
      const code = (r.code && r.code.trim()) || r.barcode?.trim() || "";
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
    [navigate, appendScanToHistory],
  );

  const modalTitle =
    scanTarget === "baskets" ? "Zeskanuj wózek z koszykami" : scanTarget === "bulk" ? "Zeskanuj wózek" : "";

  const handleModalScan = useCallback(
    async (raw: string) => {
      if (scanTarget == null || scanBusyRef.current) return;
      const scan = normalizeScanEan(raw);
      if (!scan) return;
      scanBusyRef.current = true;
      try {
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
        const mode: WmsPackingMode = scanTarget === "baskets" ? "baskets" : "bulk";
        if (!cartTypeMatchesPackingMode(mode, r.cart_type)) {
          showScannerToast(
            mode === "baskets"
              ? "Ten wózek nie jest wózkiem z koszykami (MULTI)."
              : "Ten wózek nie jest wózkiem BULK.",
          );
          return;
        }
        finishCartScan(mode, r);
      } finally {
        scanBusyRef.current = false;
        refocusScannerInput();
      }
    },
    [scanTarget, warehouseId, showScannerToast, refocusScannerInput, finishCartScan],
  );

  useEffect(() => {
    if (scanTarget == null) {
      registerScanHandler(null);
      setScannerInputPlaceholder("Wybierz opcję pakowania");
      refocusScannerInput();
      return;
    }
    setScannerInputPlaceholder(
      scanTarget === "baskets" ? "Zeskanuj kod wózka z koszykami" : "Zeskanuj kod wózka BULK",
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
              Zeskanuj kod wózka
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

      <ul className="mt-10 grid list-none grid-cols-1 gap-4 p-0 sm:mt-12 sm:gap-5" aria-label="Opcje pakowania">
        {modes.no_cart > 0 ? (
          <li>
            <button
              type="button"
              className="flex w-full min-h-[5.5rem] items-center justify-center rounded-xl border border-slate-200/95 bg-white px-6 py-5 text-center text-xl font-bold text-slate-900 shadow-sm transition-[box-shadow,background-color] hover:bg-slate-50 hover:shadow-md sm:min-h-[6rem] sm:text-2xl"
              onClick={goToOrdersNoCart}
            >
              Przejdź do listy zamówień
            </button>
          </li>
        ) : null}
        {showBulkScan ? (
          <li>
            <button
              type="button"
              className="flex w-full min-h-[5.5rem] items-center justify-center rounded-xl border border-slate-200/95 bg-white px-6 py-5 text-center text-xl font-bold text-slate-900 shadow-sm transition-[box-shadow,background-color] hover:bg-slate-50 hover:shadow-md sm:min-h-[6rem] sm:text-2xl"
              onClick={() => setScanTarget("bulk")}
            >
              Zeskanuj wózek
            </button>
          </li>
        ) : null}
        {showBasketsScan ? (
          <li>
            <button
              type="button"
              className="flex w-full min-h-[5.5rem] items-center justify-center rounded-xl border border-slate-200/95 bg-white px-6 py-5 text-center text-xl font-bold text-slate-900 shadow-sm transition-[box-shadow,background-color] hover:bg-slate-50 hover:shadow-md sm:min-h-[6rem] sm:text-2xl"
              onClick={() => setScanTarget("baskets")}
            >
              Zeskanuj wózek z koszykami
            </button>
          </li>
        ) : null}
      </ul>

      {typeof document !== "undefined" && modalNode ? createPortal(modalNode, document.body) : null}
    </div>
  );
}
