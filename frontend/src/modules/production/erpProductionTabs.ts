import type { TabItem } from "../../components/TopTabsNavigation";

/** ERP Production module — management & planning. */
export const ERP_PRODUCTION_TABS: TabItem[] = [
  { path: "/production", label: "Pulpit", end: true },
  { path: "/production/recipes", label: "Receptury" },
  { path: "/production/batches", label: "Partie produkcyjne" },
];
