import type { TabItem } from "../../components/TopTabsNavigation";

export const CARTS_TABS: TabItem[] = [
  { path: "/carts/bulk", label: "Wózki" },
  { path: "/carts/baskets", label: "Wózki z koszykami" },
  { path: "/carts/racks", label: "Regały" },
  { path: "/carts/zones", label: "Strefy" },
  /** ``end: false`` — aktywna także na ``/carts/carriers/:id``. */
  { path: "/carts/carriers", label: "Nośniki", end: false },
];
