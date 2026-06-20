import type { TabsNavItem } from "@/components/layout/TabsNav";
import { erpInventoryCountPaths } from "./inventoryCountPaths";

/** ERP module tabs — shared {@link TabsNav} (Dostawcy / Materiały magazynowe). */
export const ERP_INVENTORY_COUNT_TABS: TabsNavItem[] = [
  { path: erpInventoryCountPaths.dashboard, label: "Pulpit", end: true },
  { path: erpInventoryCountPaths.documents, label: "Dokumenty", end: false },
  { path: erpInventoryCountPaths.wizard, label: "Nowa inwentaryzacja", end: false },
  { path: erpInventoryCountPaths.reports, label: "Raporty", end: true },
];
