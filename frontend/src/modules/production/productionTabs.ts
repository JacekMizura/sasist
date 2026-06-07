import type { TabItem } from "../../components/TopTabsNavigation";

export const PRODUCTION_TABS: TabItem[] = [
  { path: "/production", label: "Pulpit", end: true },
  { path: "/production/recipes", label: "Receptury" },
  { path: "/production/batches", label: "Batch produkcyjny" },
  { path: "/production/collecting", label: "Zbieranie surowców" },
  { path: "/production/execute", label: "Produkcja" },
  { path: "/production/putaway", label: "Odłożenie" },
];
