import type { WmsSettingsSectionConfig } from "./wmsSettingsSectionConfig";

/** @deprecated Use {@link WmsSettingsSectionConfig} */
export type WmsSettingsNavSection = WmsSettingsSectionConfig;

/** DOM ids on picking settings — match SectionCardPicking `id` props (parallel structure to Pakowanie). */
export const WMS_PICKING_SETTINGS_NAV_SECTIONS: WmsSettingsSectionConfig[] = [
  { id: "wms-pick-appearance", label: "1. Wygląd i prezentacja" },
  { id: "wms-pick-workflow", label: "2. Workflow / statusy" },
  { id: "wms-pick-automation", label: "3. Automatyzacja" },
  { id: "wms-pick-documents", label: "4. Dokumenty sprzedaży" },
  { id: "wms-pick-labels", label: "5. Etykiety / Kurierzy" },
  { id: "wms-pick-permissions", label: "6. Uprawnienia / Walidacja" },
  { id: "wms-pick-assistant", label: "7. Asystent zbierania" },
  { id: "wms-pick-advanced", label: "8. Zaawansowane" },
];
