import type { TabItem } from "../../components/TopTabsNavigation";

/** Zakładki modułu Dostawcy (lista w Asortymencie; analityka w module Zakupy). */
export const SUPPLIER_MODULE_TABS: TabItem[] = [
  { path: "/suppliers", label: "Lista", end: true },
  { path: "/purchasing/suppliers/ocena", label: "Ocena" },
  { path: "/purchasing/suppliers/historia", label: "Historia zamówień" },
  { path: "/purchasing/suppliers/oszczednosci", label: "Oszczędności" },
];
