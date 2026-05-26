import type { TabItem } from "../../components/TopTabsNavigation";

/** Zakładki modułu Administratorzy (lista vs audyt). */
export const ADMINISTRATORS_TABS: TabItem[] = [
  { path: "/settings/administrators", label: "Lista użytkowników", end: true },
  { path: "/settings/administrators/groups", label: "Grupy operacyjne", end: true },
  { path: "/settings/administrators/audit", label: "Historia aktywności", end: true },
  { path: "/settings/administrators/costs", label: "Koszty pracowników", end: true },
  { path: "/settings/administrators/workforce", label: "Czas pracy", end: true },
];
