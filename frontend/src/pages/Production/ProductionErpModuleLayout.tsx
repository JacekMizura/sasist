import { Outlet } from "react-router-dom";

import WmsModuleLayout from "../../components/layout/WmsModuleLayout";
import { ERP_PRODUCTION_TABS } from "../../modules/production/erpProductionTabs";

/**
 * ERP Production management shell — dashboard, recipes, batch planning.
 * Rendered under {@link MainPanelLayout} at `/production/*`.
 */
export default function ProductionErpModuleLayout() {
  return <WmsModuleLayout tabs={ERP_PRODUCTION_TABS} exact={false} flushHorizontal />;
}
