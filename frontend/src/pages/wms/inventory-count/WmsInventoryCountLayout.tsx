import { Outlet } from "react-router-dom";
import { ScanLine } from "lucide-react";

import { TabsNav } from "../../../components/layout/TabsNav";
import { WMS_OPERATIONAL_CONTAINER } from "../../../components/wms/execution/wmsLayoutTokens";
import { WMS_INVENTORY_COUNT_TABS } from "../../../modules/inventoryCount/wmsInventoryCountTabs";

/** WMS inventory execution — scanner-first, no ERP chrome. */
export default function WmsInventoryCountLayout() {
  return (
    <div className="flex min-h-full flex-col bg-slate-950 text-white">
      <div className={`${WMS_OPERATIONAL_CONTAINER} shrink-0 border-b border-slate-800 pt-4`}>
        <TabsNav
          items={[...WMS_INVENTORY_COUNT_TABS]}
          exact={false}
          variant="segmented"
          aria-label="Inwentaryzacja WMS"
        />
        <p className="flex items-center gap-2 py-3 text-xs text-slate-400">
          <ScanLine className="h-3.5 w-3.5 shrink-0 text-teal-400" aria-hidden />
          Planowanie i zatwierdzanie — w module ERP → Inwentaryzacja
        </p>
      </div>
      <div className={`${WMS_OPERATIONAL_CONTAINER} flex-1 py-6`}>
        <Outlet />
      </div>
    </div>
  );
}
