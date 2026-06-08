import { erpInventoryCountPaths } from "./inventoryCountPaths";

export const ERP_INVENTORY_COUNT_TABS = [
  { to: erpInventoryCountPaths.dashboard, label: "Pulpit" },
  { to: erpInventoryCountPaths.documents, label: "Dokumenty" },
  { to: erpInventoryCountPaths.wizard, label: "Nowa inwentaryzacja" },
  { to: erpInventoryCountPaths.reports, label: "Raporty" },
] as const;
