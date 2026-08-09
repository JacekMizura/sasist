import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useWmsScanner } from "../../../context/WmsScannerContext";
import type { OrderUiMainGroup } from "../../../types/orderUiStatus";
import { panelSidebarSubCountBadgeStyle } from "../../../utils/panelSidebarHierarchy";
import { DAMAGE_TENANT_ID } from "../../../pages/damage/damageShared";
import {
  loadWmsPackingSession,
  saveWmsPackingSession,
  type WmsPackingOrderTypeFilter,
} from "../../../pages/wms/wmsPackingSession";
import { WMS_ROUTES } from "../../../pages/wms/wmsRoutes";
import { applyPackingHandoffScanResult } from "./applyPackingHandoffScan";
import { PackingHandoffScanModal } from "./PackingHandoffScanModal";
import { resolvePackingHandoffScan } from "./resolvePackingHandoffScan";

export type PackingModeSelectionViewProps = {
  statusName: string;
  statusColor: string;
  mainGroup: OrderUiMainGroup;
  modes: {
    no_cart: number;
    bulk: number;
    baskets: number;
    single_item?: number;
    multi_item?: number;
  };
  warehouseId: number;
  /** Pokazuj kafelki jedno-/wieloelementowe (ustawienie procesu pakowania). */
  showSingleMultiTiles?: boolean;
  /** Otwórz skaner handoff od razu (np. CTA z kafelka Pakowanie). */
  autoOpenHandoffScan?: boolean;
};

export function PackingModeSelectionView({
  statusName,
  statusColor,
  mainGroup,
  modes,
  warehouseId,
  showSingleMultiTiles = false,
  autoOpenHandoffScan = false,
}: PackingModeSelectionViewProps) {
  const navigate = useNavigate();
  const {
    registerScanHandler,
    setScannerInputPlaceholder,
    refocusScannerInput,
    appendScanToHistory,
    showScannerToast,
  } = useWmsScanner();

  const [handoffScanOpen, setHandoffScanOpen] = useState(autoOpenHandoffScan);
  const scanBusyRef = useRef(false);

  const badgeStyle = panelSidebarSubCountBadgeStyle(statusColor, mainGroup);
  const showHandoffScan = modes.bulk > 0 || modes.baskets > 0;
  const handoffCount = modes.bulk + modes.baskets;

  const goToOrdersNoCart = useCallback(
    (orderType: WmsPackingOrderTypeFilter = "all") => {
      const cur = loadWmsPackingSession();
      if (!cur) return;
      saveWmsPackingSession({
        ...cur,
        mode: "no_cart",
        orderTypeFilter: orderType,
        cartId: undefined,
        cartCode: undefined,
        cartType: undefined,
      });
      navigate(WMS_ROUTES.packingOrders, { replace: true });
    },
    [navigate],
  );

  const handleHandoffScan = useCallback(
    async (raw: string) => {
      if (!handoffScanOpen || scanBusyRef.current) return;
      const s = loadWmsPackingSession();
      if (!s) return;
      scanBusyRef.current = true;
      try {
        const result = await resolvePackingHandoffScan({
          tenantId: DAMAGE_TENANT_ID,
          warehouseId,
          statusId: s.statusId,
          raw,
        });
        if (result.kind === "empty" || result.kind === "error") {
          showScannerToast(result.message);
          return;
        }
        setHandoffScanOpen(false);
        applyPackingHandoffScanResult({
          result,
          navigate,
          appendScanToHistory,
        });
      } finally {
        scanBusyRef.current = false;
        refocusScannerInput();
      }
    },
    [handoffScanOpen, warehouseId, showScannerToast, navigate, appendScanToHistory, refocusScannerInput],
  );

  useEffect(() => {
    if (!handoffScanOpen) {
      registerScanHandler(null);
      setScannerInputPlaceholder("Wybierz opcję pakowania");
      refocusScannerInput();
      return;
    }
    setScannerInputPlaceholder("Zeskanuj wózek lub koszyk");
    refocusScannerInput();
    registerScanHandler((x) => {
      void handleHandoffScan(x);
    });
    return () => {
      registerScanHandler(null);
    };
  }, [
    handoffScanOpen,
    registerScanHandler,
    handleHandoffScan,
    setScannerInputPlaceholder,
    refocusScannerInput,
  ]);

  useEffect(() => {
    if (!handoffScanOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setHandoffScanOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handoffScanOpen]);

  const singleCount = modes.single_item ?? 0;
  const multiCount = modes.multi_item ?? 0;

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
        {showHandoffScan ? (
          <li>
            <button
              type="button"
              className="flex w-full min-h-[5.5rem] flex-col items-center justify-center gap-1 rounded-xl border-2 border-slate-900 bg-slate-900 px-6 py-5 text-center text-xl font-bold text-white shadow-sm transition-[box-shadow,background-color] hover:bg-slate-800 hover:shadow-md sm:min-h-[6rem] sm:text-2xl"
              onClick={() => setHandoffScanOpen(true)}
            >
              <span>Skanuj wózek / koszyk</span>
              <span className="text-sm font-semibold text-slate-300">
                Wózek · wózek z koszykami · koszyk
                {handoffCount > 0 ? ` · ${handoffCount} w kolejce` : ""}
              </span>
            </button>
          </li>
        ) : null}
        {modes.no_cart > 0 ? (
          <li>
            <button
              type="button"
              className="flex w-full min-h-[5.5rem] items-center justify-center rounded-xl border border-slate-200/95 bg-white px-6 py-5 text-center text-xl font-bold text-slate-900 shadow-sm transition-[box-shadow,background-color] hover:bg-slate-50 hover:shadow-md sm:min-h-[6rem] sm:text-2xl"
              onClick={() => goToOrdersNoCart("all")}
            >
              Bez wózka — {modes.no_cart} zamówień
            </button>
          </li>
        ) : null}
        {showSingleMultiTiles ? (
          <li>
            <button
              type="button"
              disabled={singleCount <= 0}
              className="flex w-full min-h-[5.5rem] items-center justify-center rounded-xl border border-slate-200/95 bg-white px-6 py-5 text-center text-xl font-bold text-slate-900 shadow-sm transition-[box-shadow,background-color] hover:bg-slate-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-[6rem] sm:text-2xl"
              onClick={() => goToOrdersNoCart("single")}
            >
              Zamówienia jednoelementowe
              <span className="ml-3 text-base font-semibold text-slate-500">({singleCount})</span>
            </button>
          </li>
        ) : null}
        {showSingleMultiTiles ? (
          <li>
            <button
              type="button"
              disabled={multiCount <= 0}
              className="flex w-full min-h-[5.5rem] items-center justify-center rounded-xl border border-slate-200/95 bg-white px-6 py-5 text-center text-xl font-bold text-slate-900 shadow-sm transition-[box-shadow,background-color] hover:bg-slate-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-[6rem] sm:text-2xl"
              onClick={() => goToOrdersNoCart("multi")}
            >
              Zamówienia wieloelementowe
              <span className="ml-3 text-base font-semibold text-slate-500">({multiCount})</span>
            </button>
          </li>
        ) : null}
      </ul>

      <PackingHandoffScanModal open={handoffScanOpen} onClose={() => setHandoffScanOpen(false)} />
    </div>
  );
}
