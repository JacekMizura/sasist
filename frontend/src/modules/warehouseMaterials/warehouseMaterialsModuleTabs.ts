import type { TabItem } from "../../components/TopTabsNavigation";
import { UI_STRINGS } from "../../constants/uiStrings";

export const WAREHOUSE_MATERIALS_MODULE_TABS: TabItem[] = [
  { path: "/warehouse-materials/cartons", label: UI_STRINGS.navigation.warehouseMaterialsCartons, end: true },
  { path: "/warehouse-materials/packaging", label: UI_STRINGS.navigation.warehouseMaterialsPackaging, end: true },
];
