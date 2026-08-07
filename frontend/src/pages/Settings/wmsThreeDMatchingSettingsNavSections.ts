import { BarChart3, Box, History, LayoutTemplate, Settings2, Workflow } from "lucide-react";

import type { WmsSettingsSectionConfig } from "./wmsSettingsSectionConfig";

export const WMS_THREE_D_MATCHING_NAV_SECTIONS: WmsSettingsSectionConfig[] = [
  { id: "wms-3d-dashboard", label: "Widok", icon: LayoutTemplate, iconClassName: "bg-sky-50 text-sky-600" },
  { id: "wms-3d-settings", label: "Workflow", icon: Workflow, iconClassName: "bg-violet-50 text-violet-600" },
  { id: "wms-3d-engine", label: "Ogólne", icon: Settings2, iconClassName: "bg-slate-100 text-slate-600" },
  { id: "wms-3d-history", label: "Integracje", icon: History, iconClassName: "bg-indigo-50 text-indigo-600" },
  { id: "wms-3d-errors-dimensions", label: "Automatyzacja", icon: Box, iconClassName: "bg-amber-50 text-amber-600" },
  { id: "wms-3d-analytics", label: "Zaawansowane", icon: BarChart3, iconClassName: "bg-emerald-50 text-emerald-600" },
];
