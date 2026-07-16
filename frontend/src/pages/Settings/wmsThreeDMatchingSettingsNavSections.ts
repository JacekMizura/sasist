import type { WmsSettingsSectionConfig } from "./wmsSettingsSectionConfig";
import { WMS_SETTINGS_CANONICAL_SECTION } from "./wmsSettingsTokens";

export const WMS_THREE_D_MATCHING_NAV_SECTIONS: WmsSettingsSectionConfig[] = [
  { id: "wms-3d-dashboard", label: WMS_SETTINGS_CANONICAL_SECTION.view },
  { id: "wms-3d-settings", label: WMS_SETTINGS_CANONICAL_SECTION.workflow },
  { id: "wms-3d-engine", label: WMS_SETTINGS_CANONICAL_SECTION.general },
  { id: "wms-3d-history", label: WMS_SETTINGS_CANONICAL_SECTION.integrations },
  { id: "wms-3d-errors-dimensions", label: WMS_SETTINGS_CANONICAL_SECTION.automation },
  { id: "wms-3d-analytics", label: WMS_SETTINGS_CANONICAL_SECTION.advanced },
];
