import type { WmsSettingsSectionConfig } from "./wmsSettingsSectionConfig";

/** Unikalne id — zsynchronizuj z `WmsSmartMatchingSettingsPanel` (SectionCard `id`). */
export const WMS_SMART_MATCHING_NAV_SECTIONS: WmsSettingsSectionConfig[] = [
  { id: "wms-smart-dashboard", label: "1. Dashboard" },
  { id: "wms-smart-config", label: "2. Konfiguracja Smart Matching" },
  { id: "wms-smart-history", label: "3. Historia dopasowań" },
  { id: "wms-smart-analytics", label: "4. Analityka" },
];
