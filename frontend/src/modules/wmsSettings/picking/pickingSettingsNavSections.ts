import type { WmsSettingsSectionConfig } from "../../../pages/Settings/wmsSettingsSectionConfig";

/**
 * Left-nav sections for picking settings (Sellasist-aligned labels; DOM ids stable for scrollspy).
 */
export const WMS_PICKING_SETTINGS_NAV_SECTIONS: WmsSettingsSectionConfig[] = [
  { id: "wms-pick-modes", label: "Konfiguracja statusów" },
  { id: "wms-pick-queue", label: "Zarządzanie zbiorami" },
  { id: "wms-pick-scan", label: "Ustawienia wspólne" },
  { id: "wms-pick-carts", label: "Metody zbierania" },
  { id: "wms-pick-shortage", label: "Braki przy zbieraniu" },
  { id: "wms-pick-warehouses", label: "Magazyny" },
  { id: "wms-pick-automation", label: "Automatyzacja" },
  { id: "wms-pick-view", label: "Widok i interfejs" },
  { id: "wms-pick-advanced", label: "Zaawansowane" },
];
