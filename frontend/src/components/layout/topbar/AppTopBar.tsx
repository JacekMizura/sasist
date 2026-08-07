import { usePanelOrderKpis } from "../usePanelOrderKpis";
import GlobalSearch from "./GlobalSearch";
import HeaderLogo from "./HeaderLogo";
import NotificationBell from "./NotificationBell";
import UserMenu from "./UserMenu";
import WarehouseSwitcher from "./WarehouseSwitcher";

/**
 * Shared app header — full SASIST logo, search, notifications, warehouse, user.
 * Sidebar starts below this bar; collapse is controlled from the user menu.
 */
export default function AppTopBar() {
  const { showWarehouseSelector, alertCount } = usePanelOrderKpis({ enabled: true });

  return (
    <div className="flex h-[70px] w-full min-w-0 shrink-0 items-center gap-4 border-b border-[#E2E8F0] bg-white px-5">
      <div className="shrink-0">
        <HeaderLogo />
      </div>

      <div className="mx-auto flex w-full max-w-[600px] min-w-0 flex-1 justify-center max-[1199px]:max-w-[420px]">
        <GlobalSearch className="w-full" />
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <NotificationBell count={alertCount} />
        {showWarehouseSelector ? <WarehouseSwitcher /> : null}
        <UserMenu />
      </div>
    </div>
  );
}
