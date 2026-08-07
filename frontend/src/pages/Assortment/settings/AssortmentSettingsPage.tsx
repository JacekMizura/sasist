import { useSearchParams } from "react-router-dom";

import { useWarehouse } from "../../../context/WarehouseContext";
import AssortmentInventorySettingsPanel from "./AssortmentInventorySettingsPanel";
import {
  AssortmentSettingsChrome,
  isAssortmentSettingsTabId,
  type AssortmentSettingsTabId,
} from "./AssortmentSettingsChrome";

export default function AssortmentSettingsPage() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const [searchParams] = useSearchParams();

  const rawTab = searchParams.get("tab");
  const activeTab: AssortmentSettingsTabId = isAssortmentSettingsTabId(rawTab) ? rawTab : "inventory";

  return (
    <AssortmentSettingsChrome>
      <div
        id={`assortment-settings-panel-${activeTab}`}
        className="w-full min-h-[200px] min-w-0 overflow-visible"
        role="tabpanel"
        aria-labelledby={`assortment-settings-tab-${activeTab}`}
      >
        {activeTab === "inventory" ? (
          <AssortmentInventorySettingsPanel warehouseId={warehouseId} />
        ) : null}
      </div>
    </AssortmentSettingsChrome>
  );
}
