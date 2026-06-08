import { Outlet } from "react-router-dom";
import { ScanLine } from "lucide-react";

import { TabsNav } from "../../../components/layout/TabsNav";
import { WMS_OPERATIONAL_CONTAINER } from "../../../components/wms/execution/wmsLayoutTokens";
import { WMS_INVENTORY_COUNT_TABS } from "../../../modules/inventoryCount/wmsInventoryCountTabs";
import { WMS_INV } from "../../../modules/inventoryCount/wmsIndustrialTheme";

/** WMS inventory execution — industrial bright UI, scanner-first. */
export default function WmsInventoryCountLayout() {
  return (
    <div className={`flex min-h-full flex-col ${WMS_INV.bg} ${WMS_INV.text}`}>
      <div className={`${WMS_OPERATIONAL_CONTAINER} shrink-0 border-b-2 ${WMS_INV.border} ${WMS_INV.surface} pt-3 shadow-sm`}>
        <TabsNav
          items={[...WMS_INVENTORY_COUNT_TABS]}
          exact={false}
          variant="segmented"
          aria-label="Inwentaryzacja WMS"
        />
        <p className={`flex items-center gap-2 py-2.5 text-xs font-semibold ${WMS_INV.textMuted}`}>
          <ScanLine className="h-3.5 w-3.5 shrink-0 text-[#1e4d8c]" aria-hidden />
          Terminal operacyjny — planowanie i zatwierdzanie w ERP → Inwentaryzacja
        </p>
      </div>
      <div className={`${WMS_OPERATIONAL_CONTAINER} flex-1 py-4`}>
        <Outlet />
      </div>
    </div>
  );
}
