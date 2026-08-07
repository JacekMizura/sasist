import type { TabItem } from "../../components/TopTabsNavigation";

export const CARTS_TABS: TabItem[] = [
  { path: "/carts/bulk", label: "Wózki" },
  /** ``end: false`` — aktywna także na ``/carts/racks/new``, ``/carts/racks/:id/*``. */
  { path: "/carts/racks", label: "Strefa sortująca", end: false },
  { path: "/carts/optimizer", label: "Planer floty" },
  /** ``end: false`` — aktywna także na ``/carts/carriers/:id``. */
  { path: "/carts/carriers", label: "Nośniki", end: false },
];

export type CartDeviceTypeFilter = "ALL" | "BULK" | "MULTI";

export const CART_DEVICE_TYPE_LABEL: Record<"BULK" | "MULTI", string> = {
  BULK: "Wózek",
  MULTI: "Wózek z koszykami",
};
