import type { WmsSettingsSectionConfig } from "./wmsSettingsSectionConfig";

/** Placeholder tabs need unique ids when switching between future tabs in one session. */
export function getWmsSettingsPlaceholderSections(tabId: string): WmsSettingsSectionConfig[] {
  return [{ id: `wms-tab-${tabId}-overview`, label: "1. Przegląd" }];
}
