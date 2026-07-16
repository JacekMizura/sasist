import type { WmsSettingsSectionConfig } from "../../../pages/Settings/wmsSettingsSectionConfig";

/**
 * Left-nav sections for redesigned picking settings (UX only — field persistence unchanged).
 * DOM ids must match `data-wms-section` / section `id` props in the panel.
 */
export const WMS_PICKING_SETTINGS_NAV_SECTIONS: WmsSettingsSectionConfig[] = [
  { id: "wms-pick-modes", label: "Tryby zbierania" },
  { id: "wms-pick-workflow", label: "Workflow i statusy" },
  { id: "wms-pick-queue", label: "Kolejkowanie zamówień" },
  { id: "wms-pick-scan", label: "Skanowanie i walidacja" },
  { id: "wms-pick-carts", label: "Wózki i koszyki" },
  { id: "wms-pick-shortage", label: "Braki i wyjątki" },
  { id: "wms-pick-warehouses", label: "Magazyny i strefy" },
  { id: "wms-pick-automation", label: "Automatyzacja" },
  { id: "wms-pick-view", label: "Widok i interfejs" },
  { id: "wms-pick-advanced", label: "Zaawansowane" },
];
