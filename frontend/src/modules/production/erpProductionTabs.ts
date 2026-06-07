import type { TabItem } from "../../components/TopTabsNavigation";

/** ERP Production module — management & planning (not WMS execution). */
/** Orders-first workflow — recipes are supporting master data. */
export const ERP_PRODUCTION_TABS: TabItem[] = [
  { path: "/production", label: "Pulpit", end: true },
  { path: "/production/orders", label: "Zlecenia produkcyjne" },
  { path: "/production/planning", label: "Planowanie" },
  { path: "/production/recipes", label: "Receptury" },
  { path: "/production/history", label: "Historia" },
  { path: "/production/analytics", label: "Analiza kosztów" },
];
