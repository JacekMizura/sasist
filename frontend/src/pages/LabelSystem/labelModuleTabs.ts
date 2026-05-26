import type { TabItem } from "../../components/TopTabsNavigation";

export function labelModuleTabs(labelBase: string): TabItem[] {
  return [
    { path: labelBase, label: "Szablony", end: true },
    { path: `${labelBase}/ready`, label: "Gotowe szablony", end: true },
    { path: `${labelBase}/queue`, label: "Kolejka druku" },
  ];
}
