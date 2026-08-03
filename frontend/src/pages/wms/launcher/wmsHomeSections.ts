/**
 * WMS home screen — section grouping for desktop / collector.
 * Module definitions stay in wmsTabConfig; this only organizes presentation.
 */

import type { WmsTabId } from "../wmsTabConfig";

export type WmsHomeSectionId = "daily" | "control" | "other";

export type WmsHomeSectionDef = {
  id: WmsHomeSectionId;
  title: string;
  description: string;
  moduleIds: WmsTabId[];
};

/** Desktop sections (mock order). */
export const WMS_HOME_DESKTOP_SECTIONS: WmsHomeSectionDef[] = [
  {
    id: "daily",
    title: "Operacje dzienne",
    description: "Codzienne procesy: przyjęcie, zbieranie, rozlokowanie i pakowanie.",
    moduleIds: ["receiving", "picking", "putaway", "packing"],
  },
  {
    id: "control",
    title: "Kontrola i przegląd",
    description: "Braki, inwentaryzacja oraz szybki podgląd produktu.",
    moduleIds: ["issues", "inventory_count", "product_preview"],
  },
  {
    id: "other",
    title: "Pozostałe moduły",
    description: "Zwroty, sprzedaż stacjonarna, produkcja i przesunięcia.",
    moduleIds: ["returns", "direct_sales", "production", "consolidations", "mm"],
  },
];

/** Collector list — modules with active work first. */
export const WMS_HOME_COLLECTOR_TODO_IDS: WmsTabId[] = [
  "picking",
  "receiving",
  "putaway",
  "issues",
  "mm",
];

export const WMS_HOME_COLLECTOR_OTHER_IDS: WmsTabId[] = [
  "packing",
  "production",
  "returns",
  "inventory_count",
  "product_preview",
];

/** KPI strip on desktop (order matches mock). */
export type WmsHomeKpiKey = "picking" | "receiving" | "putaway" | "issues" | "packing";

export const WMS_HOME_KPI_DEFS: Array<{
  key: WmsHomeKpiKey;
  label: string;
  moduleId: WmsTabId;
  tone: "blue" | "green" | "orange" | "red" | "purple";
}> = [
  { key: "picking", label: "Do zebrania", moduleId: "picking", tone: "blue" },
  { key: "packing", label: "Do spakowania", moduleId: "packing", tone: "purple" },
  { key: "issues", label: "Braki", moduleId: "issues", tone: "red" },
  { key: "putaway", label: "Do rozlokowania", moduleId: "putaway", tone: "orange" },
  { key: "receiving", label: "Przyjęcia", moduleId: "receiving", tone: "green" },
];

export const WMS_HOME_BORDER = "#e9edf5";
export const WMS_HOME_BG = "#ffffff";
export const WMS_HOME_PRIMARY = "#5a4fcf";

/** Optional shorter titles on the home screen (module registry keeps full labels). */
export const WMS_HOME_DISPLAY_LABEL: Partial<Record<WmsTabId, string>> = {
  production: "Produkcja",
  consolidations: "Kompletacja międzymagazynowa",
  mm: "Przesunięcia magazynowe",
};
