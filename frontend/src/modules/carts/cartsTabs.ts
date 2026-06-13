import type { TabItem } from "../../components/TopTabsNavigation";

export const CARTS_TABS: TabItem[] = [
  { path: "/carts/bulk", label: "Wózki" },
  { path: "/carts/baskets", label: "Wózki z koszykami" },
  /** ``end: false`` — aktywna także na ``/carts/racks/new``, ``/carts/racks/:id/*``. */
  { path: "/carts/racks", label: "Regały", end: false },
  { path: "/carts/zones", label: "Strefy" },
  /** ``end: false`` — aktywna także na ``/carts/carriers/:id``. */
  { path: "/carts/carriers", label: "Nośniki", end: false },
];
