import { History, Settings2 } from "lucide-react";

import type { WmsSettingsSectionConfig } from "./wmsSettingsSectionConfig";

/** 3D Matching settings: settings + attempt history. */
export const WMS_THREE_D_MATCHING_NAV_SECTIONS: WmsSettingsSectionConfig[] = [
  { id: "wms-3d-settings", label: "Ustawienia", icon: Settings2, iconClassName: "bg-slate-100 text-slate-600" },
  { id: "wms-3d-history", label: "Historia doboru", icon: History, iconClassName: "bg-slate-100 text-slate-600" },
];
