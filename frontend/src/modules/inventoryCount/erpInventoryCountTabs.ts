import { erpInventoryCountPaths } from "./inventoryCountPaths";

/** ERP module tabs — each tab uses `path` + `end` so only one is active. */
export const ERP_INVENTORY_COUNT_TABS = [
  { path: erpInventoryCountPaths.dashboard, label: "Pulpit", end: true },
  { path: erpInventoryCountPaths.documents, label: "Dokumenty", end: false },
  { path: erpInventoryCountPaths.wizard, label: "Nowa inwentaryzacja", end: false },
  { path: erpInventoryCountPaths.reports, label: "Raporty", end: true },
] as const;
