import { useMemo } from "react";
import type { TabItem } from "../components/TopTabsNavigation";
import { isSuperRole } from "../auth/isSuperRole";
import { useAuth } from "../context/AuthContext";
import { getLabel } from "../labels";

const BASE_SYSTEM_TABS: TabItem[] = [
  { path: "/system/health", label: "Zdrowie systemu" },
  { path: "/system/db-size", label: "Rozmiar bazy" },
  { path: "/system/metrics", label: "Metryki API" },
  { path: "/system/errors", label: "Logi błędów" },
  { path: "/system/changelog", label: "Changelog" },
];

/** @deprecated Prefer useSystemTabs() so labels resolve via dictionary. */
export const SYSTEM_TABS: TabItem[] = BASE_SYSTEM_TABS;

export function useSystemTabs(): TabItem[] {
  const { user } = useAuth();
  const superUser = isSuperRole(user?.role);

  return useMemo(() => {
    const tabs: TabItem[] = [
      { path: "/system/health", label: getLabel("system.tab.health", "Zdrowie systemu") },
      { path: "/system/db-size", label: getLabel("system.tab.dbSize", "Rozmiar bazy") },
      { path: "/system/metrics", label: getLabel("system.tab.metrics", "Metryki API") },
      { path: "/system/errors", label: getLabel("system.tab.errors", "Logi błędów") },
      { path: "/system/changelog", label: getLabel("system.tab.changelog", "Changelog") },
    ];
    if (superUser) {
      tabs.push({
        path: "/system/labels",
        label: getLabel("system.tab.labels", "Słownik aplikacji"),
      });
    }
    return tabs;
  }, [superUser]);
}
