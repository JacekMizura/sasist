import type { ReportDefinition } from "./types";

/**
 * Static catalog of predefined reports. No runtime schema building — add new entries here only.
 */
export const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    id: "warehouse-snapshot",
    name: "Podsumowanie magazynu",
    description:
      "Agregaty pojemności, obłożenia, wartości i wykorzystania przestrzeni z silnika metryk (bez podziału na regały).",
    metrics: ["occupancy", "capacity", "inventoryValue", "spaceUtilization"],
    defaultGrouping: "none",
    supportedFilters: {
      storageType: false,
      product: false,
      zone: false,
    },
  },
  {
    id: "storage-type-capacity",
    name: "Pojemność wg typu lokacji",
    description:
      "Wykorzystuje z agregatu `capacity.byStorageType` z metryk; odpowiednie przy grupowaniu `none`.",
    metrics: ["capacity", "occupancy"],
    defaultGrouping: "none",
    supportedFilters: {
      storageType: true,
      product: false,
      zone: false,
    },
  },
  {
    id: "racks-utilization",
    name: "Wykorzystanie regałów",
    description:
      "Wymaga `locationGranules` z kluczem locationUUID; agreguje po regale (rack).",
    metrics: ["occupancy", "capacity", "inventoryValue", "spaceUtilization"],
    defaultGrouping: "rack",
    supportedFilters: {
      storageType: true,
      product: true,
      zone: false,
    },
  },
  {
    id: "rows-utilization",
    name: "Wykorzystanie rzędów",
    description: "Agregacja po `rowKey` w granulach (UUID → regał → rząd).",
    metrics: ["occupancy", "capacity", "inventoryValue"],
    defaultGrouping: "row",
    supportedFilters: {
      storageType: true,
      product: true,
      zone: false,
    },
  },
  {
    id: "template-footprint",
    name: "Szablony regałów",
    description: "Sumy po `templateId` w granulach (preset / szablon katalogowy).",
    metrics: ["capacity", "inventoryValue"],
    defaultGrouping: "template",
    supportedFilters: {
      storageType: false,
      product: false,
      zone: false,
    },
  },
  {
    id: "picking-path-summary",
    name: "Ścieżka kompletacji",
    description: "Metryki trasy z layoutu (waypointy); bez danych per-lokalizacja.",
    metrics: ["pickingMetrics"],
    defaultGrouping: "none",
    supportedFilters: {
      storageType: false,
      product: false,
      zone: false,
    },
  },
];

export function getReportDefinition(id: string): ReportDefinition | undefined {
  return REPORT_DEFINITIONS.find((r) => r.id === id);
}
