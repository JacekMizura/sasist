import { Outlet } from "react-router-dom";
import { ScanLine } from "lucide-react";

import { TabsNav } from "../../components/layout/TabsNav";
import {
  WMS_TERMINAL_INNER,
  WMS_TERMINAL_SHELL,
  WMS_TERMINAL_STACK,
} from "../../components/wms/execution/wmsLayoutTokens";
import { WMS_PRODUCTION_TABS } from "../../modules/production/wmsProductionTabs";

/**
 * WMS production execution — workflow tabs only, inside shared terminal shell (WmsTopBar).
 * No duplicate mode header; mode label lives in global top navigation.
 */
export default function WmsProductionExecutionLayout() {
  return (
    <div className="flex min-h-full flex-col bg-white">
      <div className={`${WMS_TERMINAL_SHELL} shrink-0 border-b border-slate-100`}>
        <div className={`${WMS_TERMINAL_INNER} ${WMS_TERMINAL_STACK} gap-3 py-3`}>
          <TabsNav
            items={WMS_PRODUCTION_TABS}
            exact={false}
            variant="segmented"
            aria-label="Workflow wykonania produkcji"
          />
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <ScanLine className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
            Planowanie partii i receptury — w module ERP → Produkcja
          </p>
        </div>
      </div>
      <div className={`${WMS_TERMINAL_SHELL} flex-1`}>
        <div className={`${WMS_TERMINAL_INNER} ${WMS_TERMINAL_STACK}`}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
