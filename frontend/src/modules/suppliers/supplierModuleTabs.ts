import type { TabItem } from "../../components/TopTabsNavigation";

/** Zakładki tylko w module Dostawcy. */
export const SUPPLIER_MODULE_TABS: TabItem[] = [
  { path: "/suppliers", label: "Lista", end: true },
  { path: "/suppliers/ocena", label: "Ocena", end: true },
  { path: "/suppliers/historia", label: "Historia zamówień", end: true },
];
