import type { WmsSettingsSectionConfig } from "../../../pages/Settings/wmsSettingsSectionConfig";
import { WMS_SETTINGS_CANONICAL_SECTION } from "../../../pages/Settings/wmsSettingsTokens";

export const DIRECT_SALES_SETTINGS_NAV_SECTIONS: WmsSettingsSectionConfig[] = [
  { id: "ds-general", label: WMS_SETTINGS_CANONICAL_SECTION.general },
  { id: "ds-payments", label: "Płatności" },
  { id: "ds-stock", label: "Stany magazynowe" },
  { id: "ds-pricing", label: WMS_SETTINGS_CANONICAL_SECTION.view },
  { id: "ds-discounts", label: "Rabaty" },
  { id: "ds-customers", label: "Klienci" },
  { id: "ds-terminal", label: WMS_SETTINGS_CANONICAL_SECTION.advanced },
];
