import { Boxes, ClipboardList, LayoutDashboard, Megaphone, Package, ScanLine } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import GlobalWarehouseSelect from "./GlobalWarehouseSelect";
import UserAccountMenu from "./UserAccountMenu";
import type { OrderPanelFilter } from "../orders/OrdersPanelStatusSidebar";
import GlobalScanSearch from "../search/GlobalScanSearch";
import { SHOW_WMS_DEV_SCANNER } from "../../context/WmsScannerContext";
import { WMS_ROUTES } from "../../pages/wms/wmsRoutes";
import { usePanelOrderKpis } from "./usePanelOrderKpis";

// Nowy, czystszy styl dla przycisków akcji (ikonek) z efektem hover
const iconBtn =
  "relative inline-flex p-2 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500";

function hideErpOrderKpiStrip(pathname: string): boolean {
  return (
    pathname === "/wms" ||
    pathname.startsWith("/wms/") ||
    pathname === "/settings/wms" ||
    pathname.startsWith("/settings/wms/")
  );
}

/**
 * Cienki, pełnej szerokości pasek KPI + skaner + akcje — tylko szkielet ERP.
 */
export default function PanelGlobalStatusStrip() {
  const { pathname } = useLocation();
  const hideKpis = hideErpOrderKpiStrip(pathname);

  const { showWarehouseSelector, nowe, wRealizacji, pilne, opoznione, countsDisabled, alertCount } =
    usePanelOrderKpis({ enabled: !hideKpis });

  const dim = countsDisabled ? "pointer-events-none opacity-45" : "";

  const openScannerOrSearch = () => {
    if (SHOW_WMS_DEV_SCANNER) {
      window.dispatchEvent(new Event("wms-dev-scanner-open"));
    } else {
      document.getElementById("main-panel-operational-search")?.focus();
    }
  };

  return (
    <div className="sticky top-0 z-[100] flex h-[60px] w-full min-w-0 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 py-0 pl-14 pr-4 shadow-sm backdrop-blur-sm lg:px-4">
      
      {/* LEWA STRONA: Wskaźniki KPI (Pigułki) */}
      <div className="flex items-center min-w-0">
        {hideKpis ? null : (
          <nav
            className="flex min-w-0 shrink-0 items-center gap-2 overflow-x-auto py-1 no-scrollbar"
            aria-label="Status zamówień"
          >
            {/* Nowe */}
            <Link
              to="/orders/list"
              state={{ panelFilter: { kind: "group", group: "NEW" } satisfies OrderPanelFilter }}
              title="Zamówienia — Nowe"
              className={`group flex items-center gap-2 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-full transition-colors whitespace-nowrap ${dim}`}
            >
              <div className="w-2 h-2 rounded-full bg-blue-500 group-hover:scale-110 transition-transform" aria-hidden />
              <span className="text-xs font-semibold text-blue-900">Nowe</span>
              <span className="text-xs font-black text-blue-700">{nowe}</span>
            </Link>

            {/* W realizacji */}
            <Link
              to="/orders/list"
              state={{ panelFilter: { kind: "group", group: "IN_PROGRESS" } satisfies OrderPanelFilter }}
              title="Zamówienia — W realizacji"
              className={`group flex items-center gap-2 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-full transition-colors whitespace-nowrap ${dim}`}
            >
              <div className="w-2 h-2 rounded-full bg-indigo-500 group-hover:scale-110 transition-transform" aria-hidden />
              <span className="text-xs font-semibold text-indigo-900">W realizacji</span>
              <span className="text-xs font-black text-indigo-700">{wRealizacji}</span>
            </Link>

            {/* Pilne */}
            <Link 
              to={WMS_ROUTES.packing} 
              title="Pakowanie — pilne" 
              className={`group flex items-center gap-2 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-100 rounded-full transition-colors whitespace-nowrap ${pilne === 0 ? 'opacity-80 hover:opacity-100' : ''} ${dim}`}
            >
              <div className="w-2 h-2 rounded-full bg-amber-500 group-hover:scale-110 transition-transform" aria-hidden />
              <span className="text-xs font-semibold text-amber-900">Pilne</span>
              <span className="text-xs font-black text-amber-700">{pilne}</span>
            </Link>

            {/* Opóźnione */}
            <Link 
              to="/orders/list" 
              title="Zamówienia — opóźnione" 
              className={`group flex items-center gap-2 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-100 rounded-full transition-colors whitespace-nowrap ${opoznione > 0 ? 'shadow-[0_0_10px_rgba(225,29,72,0.1)]' : ''} ${dim}`}
            >
              <div className={`w-2 h-2 rounded-full bg-rose-500 group-hover:scale-110 transition-transform ${opoznione > 0 ? 'shadow-[0_0_5px_rgba(225,29,72,0.5)]' : ''}`} aria-hidden />
              <span className="text-xs font-semibold text-rose-900">Opóźnione</span>
              <span className="text-xs font-black text-rose-700">{opoznione}</span>
            </Link>
          </nav>
        )}
      </div>

      {/* ŚRODEK: Wyszukiwarka */}
      <div className="flex-1 flex justify-center max-w-xl px-4 min-w-[200px]">
        <GlobalScanSearch variant="panelStrip" inputId="main-panel-operational-search" className="w-full" />
      </div>

      {/* PRAWA STRONA: Ikony, Narzędzia i Profil */}
      <div className="flex shrink-0 items-center justify-end h-full">
        
        {/* Ikony Akcji */}
        <div className="flex items-center gap-0.5 sm:gap-1 border-r border-slate-100 pr-3 sm:pr-4">
          <Link to="/dashboard" className={iconBtn} title="Panel główny" aria-label="Panel główny">
            <LayoutDashboard className="h-5 w-5" strokeWidth={2} />
          </Link>
          
          <Link
            to="/dashboard"
            className={iconBtn}
            title={alertCount ? `${alertCount} alertów` : "Alerty"}
            aria-label="Alerty"
          >
            <Megaphone className="h-5 w-5" strokeWidth={2} />
            {alertCount > 0 && (
              <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white border-2 border-white shadow-sm leading-none">
                {alertCount > 99 ? "99+" : alertCount}
              </span>
            )}
          </Link>
          
          <Link to="/orders/list" className={iconBtn} title="Lista zamówień" aria-label="Lista zamówień">
            <ClipboardList className="h-5 w-5" strokeWidth={2} />
          </Link>
          
          <Link to={WMS_ROUTES.pickingProducts} className={iconBtn} title="Produkty do zbierki" aria-label="Produkty do zbierki">
            <Boxes className="h-5 w-5" strokeWidth={2} />
          </Link>
          
          <Link to={WMS_ROUTES.root} className={iconBtn} title="Terminal WMS" aria-label="Terminal WMS">
            <Package className="h-5 w-5" strokeWidth={2} />
          </Link>
          
          <button type="button" className={iconBtn} title="Skaner / fokus pola kodu" aria-label="Skaner" onClick={openScannerOrSearch}>
            <ScanLine className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        {/* Profil i Wybór Magazynu - POZBYŁEM SIĘ DUBLOWANIA */}
        <div className="flex items-center gap-3 pl-3 sm:pl-4">
          {showWarehouseSelector ? (
            <GlobalWarehouseSelect variant="topbar" className="hidden w-[9rem] shrink-0 text-[11px] md:block lg:w-[10.5rem]" />
          ) : null}
          
          {/* Tu wywołujemy czysty komponent UserAccountMenu, bez powtarzania napisów wokół */}
          <UserAccountMenu compact />
        </div>
      </div>
      
    </div>
  );
}