import {
  Layers,
  LayoutTemplate,
  Package,
  Printer,
  Settings2,
  Sparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import type { WmsSettingsSectionConfig } from "./wmsSettingsSectionConfig";
import { WMS_SETTINGS_CANONICAL_SECTION } from "./wmsSettingsTokens";

const ICONS: Record<string, { icon: LucideIcon; iconClassName: string }> = {
  "wms-pack-permissions": { icon: Settings2, iconClassName: "bg-slate-100 text-slate-600" },
  "wms-pack-workflow": { icon: Workflow, iconClassName: "bg-violet-50 text-violet-600" },
  "wms-pack-appearance": { icon: LayoutTemplate, iconClassName: "bg-sky-50 text-sky-600" },
  "wms-pack-automation": { icon: Sparkles, iconClassName: "bg-amber-50 text-amber-600" },
  "wms-pack-documents": { icon: Layers, iconClassName: "bg-indigo-50 text-indigo-600" },
  "wms-pack-labels": { icon: Printer, iconClassName: "bg-blue-50 text-blue-600" },
  "wms-pack-advanced": { icon: Package, iconClassName: "bg-emerald-50 text-emerald-600" },
};

/** DOM ids — keep in sync with packing panel section ids. Nav order follows canonical vocabulary. */
export const WMS_PACKING_SETTINGS_NAV_SECTIONS: WmsSettingsSectionConfig[] = [
  { id: "wms-pack-permissions", label: WMS_SETTINGS_CANONICAL_SECTION.general, ...ICONS["wms-pack-permissions"] },
  { id: "wms-pack-workflow", label: "Statusy procesu", ...ICONS["wms-pack-workflow"] },
  { id: "wms-pack-appearance", label: WMS_SETTINGS_CANONICAL_SECTION.view, ...ICONS["wms-pack-appearance"] },
  { id: "wms-pack-automation", label: WMS_SETTINGS_CANONICAL_SECTION.automation, ...ICONS["wms-pack-automation"] },
  { id: "wms-pack-documents", label: WMS_SETTINGS_CANONICAL_SECTION.integrations, ...ICONS["wms-pack-documents"] },
  { id: "wms-pack-labels", label: WMS_SETTINGS_CANONICAL_SECTION.printing, ...ICONS["wms-pack-labels"] },
  { id: "wms-pack-advanced", label: WMS_SETTINGS_CANONICAL_SECTION.advanced, ...ICONS["wms-pack-advanced"] },
];

/** @deprecated Use {@link WmsSettingsSectionConfig} */
export type WmsSettingsNavSection = WmsSettingsSectionConfig;
