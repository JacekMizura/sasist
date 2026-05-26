import type { WmsSettingsSectionConfig } from "./wmsSettingsSectionConfig";

/** Unikalne id — zsynchronizuj z `WmsThreeDMatchingSettingsPanel` (SectionCard `id`). */
export const WMS_THREE_D_MATCHING_NAV_SECTIONS: WmsSettingsSectionConfig[] = [
  { id: "wms-3d-dashboard", label: "1. Dashboard" },
  { id: "wms-3d-settings", label: "2. Konfiguracja przepływu" },
  { id: "wms-3d-engine", label: "3. Ustawienia 3D Matching" },
  { id: "wms-3d-history", label: "4. Historia dopasowań" },
  { id: "wms-3d-errors-dimensions", label: "5. Błędy i brakujące wymiary" },
  { id: "wms-3d-analytics", label: "6. Analityka" },
];
