import type { TabsNavItem } from "@/components/layout/TabsNav";

export const BDO_TABS: TabsNavItem[] = [
  { path: "/warehouse/bdo/dashboard", label: "Dashboard", end: true },
  { path: "/warehouse/bdo/materials", label: "Materiały opakowaniowe", end: true },
  { path: "/warehouse/bdo/movements", label: "Historia ruchów", end: true },
  { path: "/warehouse/bdo/stock-count", label: "Spis z natury", end: true },
  { path: "/warehouse/bdo/monthly-report", label: "Raport miesięczny", end: true },
  { path: "/warehouse/bdo/corrections", label: "Korekty", end: true },
  { path: "/warehouse/bdo/settings", label: "Ustawienia", end: true },
];
