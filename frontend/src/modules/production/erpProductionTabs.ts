import type { TabsNavItem } from "@/components/layout/TabsNav";
import { erpProductionPaths } from "../../pages/Production/productionPaths";

/** ERP Production module — shared {@link TabsNav} (Dostawcy / Inwentaryzacja). */
export const ERP_PRODUCTION_TABS: TabsNavItem[] = [
  { path: erpProductionPaths.home, label: "Pulpit", end: true },
  { path: erpProductionPaths.orders, label: "Zlecenia produkcyjne", end: false },
  { path: erpProductionPaths.planning, label: "Planowanie", end: false },
  { path: erpProductionPaths.recipes, label: "Receptury", end: false },
  { path: erpProductionPaths.materialReservations, label: "Rezerwacje materiałów", end: false },
  { path: erpProductionPaths.shortages, label: "Braki produkcyjne", end: false },
  { path: erpProductionPaths.history, label: "Historia", end: false },
  { path: erpProductionPaths.analytics, label: "Analiza kosztów", end: true },
];
