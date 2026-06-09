import type { TabItem } from "@/components/TopTabsNavigation";
import { erpInventoryCountPaths } from "./inventoryCountPaths";

/** ERP module tabs — standard {@link TopTabsNavigation} items. */
export const ERP_INVENTORY_COUNT_TABS: TabItem[] = [
  { path: erpInventoryCountPaths.dashboard, label: "Pulpit", end: true },
  { path: erpInventoryCountPaths.documents, label: "Dokumenty", end: false },
  { path: erpInventoryCountPaths.wizard, label: "Nowa inwentaryzacja", end: false },
  { path: erpInventoryCountPaths.reports, label: "Raporty", end: true },
];
