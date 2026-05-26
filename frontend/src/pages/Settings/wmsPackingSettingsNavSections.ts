import type { WmsSettingsSectionConfig } from "./wmsSettingsSectionConfig";

/** @deprecated Use {@link WmsSettingsSectionConfig} */
export type WmsSettingsNavSection = WmsSettingsSectionConfig;

/** DOM ids on packing settings sections — keep in sync with `WmsPackingSettingsPanel` SectionCard `id` props. */
/** Unique ids — picking tab mounts in parallel; duplicate ids break querySelector / scrollIntoView. */
export const WMS_PACKING_SETTINGS_NAV_SECTIONS: WmsSettingsSectionConfig[] = [
  { id: "wms-pack-appearance", label: "1. Wygląd i prezentacja" },
  { id: "wms-pack-workflow", label: "2. Workflow / statusy" },
  { id: "wms-pack-automation", label: "3. Automatyzacja pakowania" },
  { id: "wms-pack-documents", label: "4. Dokumenty sprzedaży" },
  { id: "wms-pack-labels", label: "5. Etykiety / Kurierzy" },
  { id: "wms-pack-permissions", label: "6. Uprawnienia / Walidacja" },
  { id: "wms-pack-assistant", label: "7. Asystent pakowania" },
  { id: "wms-pack-advanced", label: "8. Zaawansowane" },
];
