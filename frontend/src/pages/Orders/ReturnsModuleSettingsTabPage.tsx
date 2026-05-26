import { useOutletContext } from "react-router-dom";

import ReturnsModuleSettingsPanel, { type ReturnsModuleSettingsTabId } from "../Settings/ReturnsModuleSettingsPanel";

import type { ReturnsModuleOutletContext } from "./ReturnsModuleLayout";
import ReturnsModuleTabsStrip from "./ReturnsModuleTabsStrip";

export default function ReturnsModuleSettingsTabPage({ tab }: { tab: ReturnsModuleSettingsTabId }) {
  const { warehouseId } = useOutletContext<ReturnsModuleOutletContext>();
  return (
    <>
      <ReturnsModuleTabsStrip />
      <ReturnsModuleSettingsPanel warehouseId={warehouseId} activeTab={tab} />
    </>
  );
}
