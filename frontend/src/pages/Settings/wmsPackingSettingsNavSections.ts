import { FileText, LayoutTemplate, Settings2, Sparkles, Workflow, type LucideIcon } from "lucide-react";

import type { WmsSettingsSectionConfig } from "./wmsSettingsSectionConfig";
import { WMS_SETTINGS_CANONICAL_SECTION } from "./wmsSettingsTokens";

const ICONS: Record<string, { icon: LucideIcon; iconClassName: string }> = {
  "wms-pack-general": { icon: Settings2, iconClassName: "bg-slate-100 text-slate-600" },
  "wms-pack-view": { icon: LayoutTemplate, iconClassName: "bg-sky-50 text-sky-600" },
  "wms-pack-process": { icon: Workflow, iconClassName: "bg-violet-50 text-violet-600" },
  "wms-pack-automation": { icon: Sparkles, iconClassName: "bg-amber-50 text-amber-600" },
  "wms-pack-shipments-docs": { icon: FileText, iconClassName: "bg-orange-50 text-orange-700" },
};

/** Dokładnie 5 głównych grup ustawień pakowania. */
export const WMS_PACKING_SETTINGS_NAV_SECTIONS: WmsSettingsSectionConfig[] = [
  { id: "wms-pack-general", label: WMS_SETTINGS_CANONICAL_SECTION.general, ...ICONS["wms-pack-general"] },
  { id: "wms-pack-view", label: WMS_SETTINGS_CANONICAL_SECTION.view, ...ICONS["wms-pack-view"] },
  { id: "wms-pack-process", label: "Proces pakowania", ...ICONS["wms-pack-process"] },
  { id: "wms-pack-automation", label: WMS_SETTINGS_CANONICAL_SECTION.automation, ...ICONS["wms-pack-automation"] },
  { id: "wms-pack-shipments-docs", label: "Przesyłki i dokumenty", ...ICONS["wms-pack-shipments-docs"] },
];

/** @deprecated Use {@link WmsSettingsSectionConfig} */
export type WmsSettingsNavSection = WmsSettingsSectionConfig;
