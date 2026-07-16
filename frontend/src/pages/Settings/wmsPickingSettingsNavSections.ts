import type { WmsSettingsSectionConfig } from "./wmsSettingsSectionConfig";
import { WMS_SETTINGS_CANONICAL_SECTION } from "./wmsSettingsTokens";

/** DOM ids — match picking panel section ids. */
export const WMS_PICKING_SETTINGS_NAV_SECTIONS: WmsSettingsSectionConfig[] = [
  { id: "wms-pick-permissions", label: WMS_SETTINGS_CANONICAL_SECTION.general },
  { id: "wms-pick-workflow", label: WMS_SETTINGS_CANONICAL_SECTION.workflow },
  { id: "wms-pick-appearance", label: WMS_SETTINGS_CANONICAL_SECTION.view },
  { id: "wms-pick-automation", label: WMS_SETTINGS_CANONICAL_SECTION.automation },
  { id: "wms-pick-documents", label: WMS_SETTINGS_CANONICAL_SECTION.integrations },
  { id: "wms-pick-labels", label: WMS_SETTINGS_CANONICAL_SECTION.printing },
  { id: "wms-pick-advanced", label: WMS_SETTINGS_CANONICAL_SECTION.advanced },
];

/** @deprecated Use {@link WmsSettingsSectionConfig} */
export type WmsSettingsNavSection = WmsSettingsSectionConfig;
