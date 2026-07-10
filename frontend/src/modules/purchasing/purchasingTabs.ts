import type { TabItem } from "../../components/TopTabsNavigation";

/** Główne zakładki modułu Zakupy i planowanie (4 pozycje). */
export const PURCHASING_TABS: TabItem[] = [
  { path: "/purchasing/dashboard", label: "Pulpit" },
  { path: "/purchasing/plan", label: "Plan zakupów" },
  { path: "/purchasing/orders", label: "Zamówienia zakupowe" },
  { path: "/purchasing/suppliers", label: "Dostawcy" },
];
