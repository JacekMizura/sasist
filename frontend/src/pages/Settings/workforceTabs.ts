import type { TabItem } from "../../components/TopTabsNavigation";

/** Podzakładki modułu Czas pracy (pod /settings/administrators/workforce). */
export const WORKFORCE_TABS: TabItem[] = [
  { path: "/settings/administrators/workforce", label: "Podsumowanie", end: true },
  { path: "/settings/administrators/workforce/activity", label: "Ostatnia aktywność", end: true },
];
