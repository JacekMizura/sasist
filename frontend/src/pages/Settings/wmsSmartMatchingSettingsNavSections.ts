import { History, Settings2 } from "lucide-react";

import type { WmsSettingsSectionConfig } from "./wmsSettingsSectionConfig";

/** Smart Matching settings: algorithm config + packing-decision history only. */
export const WMS_SMART_MATCHING_NAV_SECTIONS: WmsSettingsSectionConfig[] = [
  { id: "wms-smart-config", label: "Ogólne", icon: Settings2, iconClassName: "bg-slate-100 text-slate-600" },
  {
    id: "wms-smart-history",
    label: "Historia doboru",
    icon: History,
    iconClassName: "bg-indigo-50 text-indigo-600",
  },
];
