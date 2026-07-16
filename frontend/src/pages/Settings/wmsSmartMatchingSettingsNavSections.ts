import type { WmsSettingsSectionConfig } from "./wmsSettingsSectionConfig";
import { WMS_SETTINGS_CANONICAL_SECTION } from "./wmsSettingsTokens";

export const WMS_SMART_MATCHING_NAV_SECTIONS: WmsSettingsSectionConfig[] = [
  { id: "wms-smart-dashboard", label: WMS_SETTINGS_CANONICAL_SECTION.view },
  { id: "wms-smart-config", label: WMS_SETTINGS_CANONICAL_SECTION.general },
  { id: "wms-smart-history", label: WMS_SETTINGS_CANONICAL_SECTION.integrations },
  { id: "wms-smart-analytics", label: WMS_SETTINGS_CANONICAL_SECTION.advanced },
];
