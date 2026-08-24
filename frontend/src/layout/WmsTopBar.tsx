import { Menu } from "lucide-react";
import { NavLink } from "react-router-dom";

import GlobalWarehouseSelect from "../components/layout/GlobalWarehouseSelect";
import WmsTopBarModuleNav from "../components/wms/WmsTopBarModuleNav";
import { WMS_Z } from "../components/wms/execution/wmsLayoutTokens";
import UserAccountMenu from "../components/layout/UserAccountMenu";
import { useAuth } from "../context/AuthContext";
import { useWmsPinnedModes } from "../hooks/useWmsPinnedModes";
import { WMS_ROUTES } from "../pages/wms/wmsRoutes";
import { WMS_HOME_BORDER } from "../pages/wms/launcher/wmsHomeSections";

const TOPBAR_H = 60;

export default function WmsTopBar() {
  const { user } = useAuth();
  const { pinnedTabsInOrder, reorderPinned } = useWmsPinnedModes(user?.id ?? null);

  return (
    <header
      className="sticky top-0 shrink-0 select-none border-b bg-white"
      style={{ borderColor: WMS_HOME_BORDER, zIndex: WMS_Z.topNav }}
    >
      <div className="flex items-stretch" style={{ height: TOPBAR_H }}>
        <div
          className="flex shrink-0 items-center border-r px-4"
          style={{ borderColor: WMS_HOME_BORDER }}
        >
          <NavLink
            to={WMS_ROUTES.menu}
            className={({ isActive }) =>
              [
                "inline-flex h-11 w-11 items-center justify-center rounded-[10px] border transition-colors",
                isActive
                  ? "border-[#5a4fcf]/35 bg-[#f5f8ff] text-[#5a4fcf]"
                  : "border-transparent text-[#5a4fcf] hover:border-[#5a4fcf]/25",
              ].join(" ")
            }
            title="Menu główne"
            aria-label="Menu główne"
          >
            <Menu size={24} strokeWidth={2.25} aria-hidden />
          </NavLink>
        </div>

        {/* overflow-x-auto keeps tab strip scrollable; More menu portals to body (see WmsTopBarModuleNav). */}
        <nav className="flex min-w-0 flex-1 overflow-x-auto px-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <WmsTopBarModuleNav tabs={pinnedTabsInOrder} className="h-full min-w-0" onReorder={reorderPinned} />
        </nav>

        <div
          className="flex shrink-0 items-center gap-4 border-l px-4"
          style={{ borderColor: WMS_HOME_BORDER }}
        >
          <GlobalWarehouseSelect variant="topbar" showErrorInline />
          <UserAccountMenu compact hideChevron profileVariant="minimal" />
        </div>
      </div>
    </header>
  );
}
