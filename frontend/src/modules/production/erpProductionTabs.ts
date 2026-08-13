import type { TabsNavItem } from "@/components/layout/TabsNav";
import { erpProductionPaths } from "../../pages/Production/productionPaths";

/** ERP Production module — shared {@link TabsNav}. */
export const ERP_PRODUCTION_TABS: TabsNavItem[] = [
  { path: erpProductionPaths.home, label: "Pulpit", end: true },
  { path: erpProductionPaths.orders, label: "Zlecenia", end: false },
  { path: erpProductionPaths.planning, label: "Planowanie", end: false },
  { path: erpProductionPaths.recipes, label: "Receptury", end: false },
  { path: erpProductionPaths.materials, label: "Materiały", end: false },
  { path: erpProductionPaths.history, label: "Historia", end: false },
  { path: erpProductionPaths.analytics, label: "Analiza kosztów", end: true },
];

/** Podzakładki obszaru Materiały (braki + rezerwacje + analiza). */
export const PRODUCTION_MATERIALS_TABS: TabsNavItem[] = [
  { path: erpProductionPaths.materialsShortages, label: "Braki", end: true },
  { path: erpProductionPaths.materialsReservations, label: "Rezerwacje", end: true },
  { path: erpProductionPaths.materialsAnalysis, label: "Analiza", end: true },
];
