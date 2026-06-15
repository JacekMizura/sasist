import { Menu } from "lucide-react";
import { NavLink } from "react-router-dom";

import GlobalWarehouseSelect from "../components/layout/GlobalWarehouseSelect";
import WmsTopBarModuleNav from "../components/wms/WmsTopBarModuleNav";
import UserAccountMenu from "../components/layout/UserAccountMenu";
import { useAuth } from "../context/AuthContext";
import { useWmsPinnedModes } from "../hooks/useWmsPinnedModes";
import { WMS_ROUTES } from "../pages/wms/wmsRoutes";

export default function WmsTopBar() {
  const { user } = useAuth();
  const { pinnedTabsInOrder, reorderPinned } = useWmsPinnedModes(user?.id ?? null);

  return (
    <header className="sticky top-0 z-40 shrink-0 select-none border-b border-slate-200 bg-white shadow-sm">
      <div className="flex h-16 items-stretch">
        <div className="flex shrink-0 items-center border-r border-slate-200 px-4">
          <NavLink
            to={WMS_ROUTES.menu}
            className={({ isActive }) =>
              [
                "inline-flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                isActive ? "text-slate-900" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
              ].join(" ")
            }
            title="Menu główne"
            aria-label="Menu główne"
          >
            <Menu size={24} strokeWidth={2} aria-hidden />
          </NavLink>
        </div>

        <nav className="flex min-w-0 flex-1 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <WmsTopBarModuleNav tabs={pinnedTabsInOrder} className="h-full min-w-0" onReorder={reorderPinned} />
        </nav>

        <div className="flex shrink-0 items-center gap-3 border-l border-slate-200 px-4">
          <GlobalWarehouseSelect variant="topbar" showErrorInline />
          <UserAccountMenu compact hideChevron profileVariant="minimal" />
        </div>
      </div>
    </header>
  );
}
