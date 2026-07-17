import { Menu } from "lucide-react";
import { NavLink } from "react-router-dom";

import GlobalWarehouseSelect from "../components/layout/GlobalWarehouseSelect";
import WmsTopBarModuleNav from "../components/wms/WmsTopBarModuleNav";
import UserAccountMenu from "../components/layout/UserAccountMenu";
import { useAuth } from "../context/AuthContext";
import { useWmsPinnedModes } from "../hooks/useWmsPinnedModes";
import { WMS_ROUTES } from "../pages/wms/wmsRoutes";
import { WMS_HOME_BORDER } from "../pages/wms/launcher/wmsHomeSections";

const TOPBAR_H = 56;

export default function WmsTopBar() {
  const { user } = useAuth();
  const { pinnedTabsInOrder, reorderPinned } = useWmsPinnedModes(user?.id ?? null);

  return (
    <header
      className="sticky top-0 z-40 shrink-0 select-none border-b bg-white"
      style={{ borderColor: WMS_HOME_BORDER }}
    >
      <div className="flex items-stretch" style={{ height: TOPBAR_H }}>
        <div
          className="flex shrink-0 items-center border-r px-3"
          style={{ borderColor: WMS_HOME_BORDER }}
        >
          <NavLink
            to={WMS_ROUTES.menu}
            className={({ isActive }) =>
              [
                "inline-flex h-10 w-10 items-center justify-center rounded-[10px] transition-colors",
                isActive ? "bg-[#f5f8ff] text-[#5a4fcf]" : "text-[#5a4fcf] hover:opacity-80",
              ].join(" ")
            }
            title="Menu główne"
            aria-label="Menu główne"
          >
            <Menu size={22} strokeWidth={2} aria-hidden />
          </NavLink>
        </div>

        <nav className="flex min-w-0 flex-1 overflow-x-auto px-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <WmsTopBarModuleNav tabs={pinnedTabsInOrder} className="h-full min-w-0" onReorder={reorderPinned} />
        </nav>

        <div
          className="flex shrink-0 items-center gap-3 border-l px-3"
          style={{ borderColor: WMS_HOME_BORDER }}
        >
          <GlobalWarehouseSelect variant="topbar" showErrorInline />
          <UserAccountMenu compact hideChevron profileVariant="minimal" />
        </div>
      </div>
    </header>
  );
}
