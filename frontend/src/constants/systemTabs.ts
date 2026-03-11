import type { TabItem } from "../components/TopTabsNavigation";

export const SYSTEM_TABS: TabItem[] = [
  { path: "/system/health", label: "Zdrowie systemu" },
  { path: "/system/db-size", label: "Rozmiar bazy" },
  { path: "/system/metrics", label: "Metryki API" },
  { path: "/system/errors", label: "Logi błędów" },
  { path: "/system/changelog", label: "Changelog" },
];
