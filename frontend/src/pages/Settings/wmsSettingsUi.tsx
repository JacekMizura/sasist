/**
 * Canonical WMS settings UI primitives (Sellasist-style).
 * Use these across all WMS settings tabs — do not invent per-tab row layouts.
 */
export { WmsSettingsSection as WmsSettingsSectionCard } from "./WmsSettingsSection";
export { SettingInfoButton } from "./SettingInfoButton";
export {
  WmsSettingCapabilityBadge,
  WmsSettingCapabilityFooter,
  type WmsSettingCapability,
} from "./wmsSettingCapability";
export {
  WmsBoolSettingRow,
  WmsControlSettingRow,
  WmsSettingControlSlot,
  wmsSettingCheckboxClass,
  wmsSettingControlInputClass,
  wmsSettingControlSelectClass,
  wmsSettingLabelTextClass,
  wmsSettingRowClass,
  wmsSettingsFormMaxWidthClass,
} from "./wmsSettingRow";
export { wmsSettingsTokens, cnParts } from "./wmsSettingsTokens";

/** Single-column stack of setting rows (not a 2-column field grid). */
export const wmsSettingsRowsStackClass = "space-y-1";
