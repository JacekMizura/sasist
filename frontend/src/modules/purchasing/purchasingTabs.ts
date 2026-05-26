import type { TabItem } from "../../components/TopTabsNavigation";

/** Zakładki modułu Zakupy i planowanie (bez listy dostawców — dostawcy są w Asortymencie). */
export const PURCHASING_TABS: TabItem[] = [
  { path: "/purchasing/dashboard", label: "Pulpit" },
  { path: "/purchasing/replenishment", label: "Generator" },
  { path: "/purchasing/orders", label: "Zamówienia zakupowe" },
  { path: "/purchasing/forecast", label: "Prognoza" },
  { path: "/purchasing/suppliers/analytics", label: "Ocena dostawców", end: true },
  { path: "/purchasing/cooperation-history", label: "Historia współpracy" },
  { path: "/purchasing/alerts", label: "Alerty" },
  { path: "/purchasing/segments", label: "Priorytety asortymentu" },
  { path: "/purchasing/auto-reorder", label: "Auto-uzupełnianie" },
  { path: "/purchasing/price-opportunities", label: "Oszczędności" },
];
