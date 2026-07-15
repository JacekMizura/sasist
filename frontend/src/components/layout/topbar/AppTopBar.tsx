import { Menu } from "lucide-react";

import { useErpSidebarUiOptional } from "../../../layout/ErpSidebarUiContext";
import { usePanelOrderKpis } from "../usePanelOrderKpis";
import GlobalSearch from "./GlobalSearch";
import HeaderLogo from "./HeaderLogo";
import NotificationBell from "./NotificationBell";
import UserMenu from "./UserMenu";
import WarehouseSwitcher from "./WarehouseSwitcher";

/**
 * Minimal ERP top bar — hamburger, logo, search, notifications, warehouse, user.
 * No KPI pills, no secondary action icons, no overlays / glass.
 */
export default function AppTopBar() {
  const sidebarUi = useErpSidebarUiOptional();
  const { showWarehouseSelector, alertCount } = usePanelOrderKpis({ enabled: true });

  return (
    <div className="flex h-[70px] w-full min-w-0 shrink-0 items-center gap-3 border-b border-[#EAECEF] bg-white px-4 xl:gap-5 xl:px-5">
      <div className="flex shrink-0 items-center gap-2">
        {sidebarUi ? (
          <button
            type="button"
            onClick={sidebarUi.toggleCollapsed}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[#64748B] transition-colors duration-150 ease-out hover:bg-[#F8FAFC] hover:text-[#0F172A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
            aria-label={sidebarUi.collapsed ? "Rozwiń menu boczne" : "Zwiń menu boczne"}
            title={sidebarUi.collapsed ? "Rozwiń menu" : "Zwiń menu"}
          >
            <Menu className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
        ) : null}
        <HeaderLogo />
      </div>

      <div className="mx-auto flex w-full max-w-[600px] min-w-0 flex-1 justify-center px-2 xl:max-w-[600px] min-[1200px]:px-4 max-[1199px]:max-w-[420px]">
        <GlobalSearch className="w-full" />
      </div>

      <div className="flex shrink-0 items-center gap-2 xl:gap-3">
        <NotificationBell count={alertCount} />
        {showWarehouseSelector ? <WarehouseSwitcher /> : null}
        <UserMenu />
      </div>
    </div>
  );
}
