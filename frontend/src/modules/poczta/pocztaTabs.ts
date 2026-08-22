import type { TabItem } from "../../../components/TopTabsNavigation";

/** Główne zakładki modułu Poczta. */
export const POCZTA_TABS: TabItem[] = [
  { path: "/poczta/korespondencja", label: "Korespondencja" },
  { path: "/poczta/nadawcza", label: "Skrzynka nadawcza" },
  { path: "/poczta/konta", label: "Konta pocztowe" },
  { path: "/poczta/szablony", label: "Szablony", end: false },
];
