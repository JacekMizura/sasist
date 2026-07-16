import type { WmsSettingsSectionConfig } from "./wmsSettingsSectionConfig";
import { WMS_SETTINGS_CANONICAL_SECTION } from "./wmsSettingsTokens";

/** DOM ids — keep in sync with packing panel section ids. Nav order follows canonical vocabulary. */
export const WMS_PACKING_SETTINGS_NAV_SECTIONS: WmsSettingsSectionConfig[] = [
  { id: "wms-pack-permissions", label: WMS_SETTINGS_CANONICAL_SECTION.general },
  { id: "wms-pack-workflow", label: WMS_SETTINGS_CANONICAL_SECTION.workflow },
  { id: "wms-pack-appearance", label: WMS_SETTINGS_CANONICAL_SECTION.view },
  { id: "wms-pack-automation", label: WMS_SETTINGS_CANONICAL_SECTION.automation },
  { id: "wms-pack-documents", label: WMS_SETTINGS_CANONICAL_SECTION.integrations },
  { id: "wms-pack-labels", label: WMS_SETTINGS_CANONICAL_SECTION.printing },
  { id: "wms-pack-advanced", label: WMS_SETTINGS_CANONICAL_SECTION.advanced },
];

/** @deprecated Use {@link WmsSettingsSectionConfig} */
export type WmsSettingsNavSection = WmsSettingsSectionConfig;
