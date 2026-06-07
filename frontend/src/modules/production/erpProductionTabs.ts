import type { TabItem } from "../../components/TopTabsNavigation";

/** ERP Production module — management & planning (not WMS execution). */
export const ERP_PRODUCTION_TABS: TabItem[] = [
  { path: "/production", label: "Pulpit", end: true },
  { path: "/production/recipes", label: "Receptury" },
  { path: "/production/orders", label: "Zlecenia" },
  { path: "/production/planning", label: "Planowanie" },
  { path: "/production/history", label: "Historia" },
  { path: "/production/analytics", label: "Analiza kosztów" },
];
