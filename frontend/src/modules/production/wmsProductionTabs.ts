import type { TabItem } from "../../components/TopTabsNavigation";

/** WMS terminal — operator execution workflow only. */
export const WMS_PRODUCTION_TABS: TabItem[] = [
  { path: "/wms/production/collecting", label: "Pobierz komponenty" },
  { path: "/wms/production/execute", label: "Produkcja" },
  { path: "/wms/production/putaway", label: "Rozlokowanie" },
];
