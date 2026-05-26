import type { TabItem } from "../../components/TopTabsNavigation";

/** Zakładki tylko w module Produkty (nie duplikują bocznego Asortymentu). */
export const PRODUCT_MODULE_TABS: TabItem[] = [
  { path: "/products/list", label: "Lista" },
  { path: "/products/import", label: "Import" },
  { path: "/products/kategorie", label: "Kategorie" },
  { path: "/products/historia", label: "Historia" },
];
