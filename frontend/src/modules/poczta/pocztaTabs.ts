import type { TabItem } from "../../../components/TopTabsNavigation";

/** Główne zakładki modułu Poczta (outbox tab — Phase 3). */
export const POCZTA_TABS: TabItem[] = [
  { path: "/poczta/korespondencja", label: "Korespondencja" },
  { path: "/poczta/konta", label: "Konta pocztowe" },
  { path: "/poczta/szablony", label: "Szablony", end: false },
];
