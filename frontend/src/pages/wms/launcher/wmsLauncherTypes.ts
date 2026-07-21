import type { WmsTabId } from "../wmsTabConfig";
import {
  resolveWmsModuleAccent,
  WMS_MODULE_ACCENT_DEFAULT,
  type WmsModuleAccent,
} from "../wmsTabConfig";

export type WmsModuleBadgeTone = "neutral" | "active" | "warning" | "critical";

export type WmsModuleBadge = {
  label: string;
  tone: WmsModuleBadgeTone;
};

/** @deprecated use WmsModuleTileMetrics */
export type WmsLauncherBadgeMap = Partial<Record<WmsTabId, WmsModuleBadge>>;

export type WmsModuleStatTone = "neutral" | "info" | "success" | "warning" | "critical";

export type WmsModuleStatChip = {
  label: string;
  tone?: WmsModuleStatTone;
};

export type WmsModuleTileMetrics = {
  stats: WmsModuleStatChip[];
  /** Numeric task count for badge (home KPI / collector). */
  count?: number;
};

export type WmsLauncherMetricsMap = Partial<Record<WmsTabId, WmsModuleTileMetrics>>;

export type { WmsModuleAccent };

/** Accents live in ``wmsTabConfig`` (module registry SSOT). */
export { resolveWmsModuleAccent, WMS_MODULE_ACCENT_DEFAULT };

/** @deprecated — use resolveWmsModuleAccent / module.accent from registry. */
export const WMS_MODULE_ACCENTS: Record<WmsTabId, WmsModuleAccent> = {
  returns: resolveWmsModuleAccent("returns"),
  receiving: resolveWmsModuleAccent("receiving"),
  putaway: resolveWmsModuleAccent("putaway"),
  mm: resolveWmsModuleAccent("mm"),
  consolidations: resolveWmsModuleAccent("consolidations"),
  consolidation_racks: resolveWmsModuleAccent("consolidation_racks"),
  picking: resolveWmsModuleAccent("picking"),
  production: resolveWmsModuleAccent("production"),
  inventory_count: resolveWmsModuleAccent("inventory_count"),
  packing: resolveWmsModuleAccent("packing"),
  issues: resolveWmsModuleAccent("issues"),
  product_preview: resolveWmsModuleAccent("product_preview"),
  operations: resolveWmsModuleAccent("operations"),
  direct_sales: resolveWmsModuleAccent("direct_sales"),
};

export const STAT_CHIP_CLASS: Record<WmsModuleStatTone, string> = {
  neutral: "border-slate-100 bg-slate-50/80 text-slate-400",
  info: "border-blue-50 bg-blue-50/50 text-blue-500",
  success: "border-emerald-50 bg-emerald-50/50 text-emerald-600",
  warning: "border-amber-50 bg-amber-50/50 text-amber-600",
  critical: "border-red-50 bg-red-50/50 text-red-500",
};
