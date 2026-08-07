import { BarChart3, History, LayoutTemplate, Settings2 } from "lucide-react";

import type { WmsSettingsSectionConfig } from "./wmsSettingsSectionConfig";

export const WMS_SMART_MATCHING_NAV_SECTIONS: WmsSettingsSectionConfig[] = [
  { id: "wms-smart-dashboard", label: "Widok", icon: LayoutTemplate, iconClassName: "bg-sky-50 text-sky-600" },
  { id: "wms-smart-config", label: "Ogólne", icon: Settings2, iconClassName: "bg-slate-100 text-slate-600" },
  { id: "wms-smart-history", label: "Integracje", icon: History, iconClassName: "bg-indigo-50 text-indigo-600" },
  { id: "wms-smart-analytics", label: "Zaawansowane", icon: BarChart3, iconClassName: "bg-emerald-50 text-emerald-600" },
];
