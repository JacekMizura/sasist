import type { TabItem } from "../../components/TopTabsNavigation";

/** Production execution workflow tabs (recipes live on product pages). */
export const PRODUCTION_TABS: TabItem[] = [
  { path: "/wms/production", label: "Pulpit", end: true },
  { path: "/wms/production/collecting", label: "Zbieranie" },
  { path: "/wms/production/execute", label: "Wykonanie" },
  { path: "/wms/production/putaway", label: "Odłożenie" },
];
