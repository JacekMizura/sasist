import type { WmsSettingsSectionConfig } from "./wmsSettingsSectionConfig";

/** @deprecated Empty modules use {@link WmsSettingsComingSoon} — no placeholder sections. */
export function getWmsSettingsPlaceholderSections(_tabId: string): WmsSettingsSectionConfig[] {
  return [];
}
