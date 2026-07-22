import type { TabItem } from "../../components/TopTabsNavigation";

/** Zakładki modułu Użytkownicy (lista, role, grupy + operacyjne). */
export const ADMINISTRATORS_TABS: TabItem[] = [
  { path: "/settings/administrators", label: "Użytkownicy", end: true },
  { path: "/settings/administrators/roles", label: "Role i dostęp do statusów", end: true },
  { path: "/settings/administrators/groups", label: "Grupy użytkowników", end: true },
  { path: "/settings/administrators/audit", label: "Historia aktywności", end: true },
  { path: "/settings/administrators/costs", label: "Koszty pracowników", end: true },
  { path: "/settings/administrators/workforce", label: "Czas pracy", end: true },
];
