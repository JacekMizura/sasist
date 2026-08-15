import type { TabItem } from "../../components/TopTabsNavigation";

/** WMS terminal — operator execution: collecting + produce only (putaway = /wms/putaway). */
export const WMS_PRODUCTION_TABS: TabItem[] = [
  { path: "/wms/production/collecting", label: "Pobieranie komponentów" },
  { path: "/wms/production/execute", label: "Produkcja" },
];
