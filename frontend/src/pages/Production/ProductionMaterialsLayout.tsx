import { Outlet } from "react-router-dom";

import { TabsNav } from "@/components/layout/TabsNav";
import { PRODUCTION_MATERIALS_TABS } from "../../modules/production/erpProductionTabs";

/**
 * Hub Materiały — łączy braki, rezerwacje i analizę materiałową
 * bez zmiany backendu (same strony, wspólna nawigacja).
 */
export default function ProductionMaterialsLayout() {
  return (
    <div className="space-y-4">
      <TabsNav
        items={PRODUCTION_MATERIALS_TABS}
        exact
        aria-label="Materiały produkcyjne — podwidoki"
        className="gap-5"
      />
      <Outlet />
    </div>
  );
}
