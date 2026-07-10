import type { TabItem } from "../../components/TopTabsNavigation";

/** Sub-zakładki sekcji Dostawcy w module Zakupy. */
export const PURCHASING_SUPPLIERS_TABS: TabItem[] = [
  { path: "/purchasing/suppliers/ocena", label: "Ocena", end: true },
  { path: "/purchasing/suppliers/historia", label: "Historia współpracy", end: true },
  { path: "/purchasing/suppliers/oszczednosci", label: "Oszczędności", end: true },
];
