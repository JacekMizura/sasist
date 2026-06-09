import type { WmsTabId } from "../wmsTabConfig";

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
};

export type WmsLauncherMetricsMap = Partial<Record<WmsTabId, WmsModuleTileMetrics>>;

export type WmsModuleAccent = {
  iconBg: string;
  iconRing: string;
  iconText: string;
  hoverBorder: string;
  hoverShadow: string;
};

export const WMS_MODULE_ACCENTS: Record<WmsTabId, WmsModuleAccent> = {
  returns: {
    iconBg: "bg-violet-50",
    iconRing: "ring-violet-100",
    iconText: "text-violet-600",
    hoverBorder: "hover:border-violet-200",
    hoverShadow: "hover:shadow-violet-100/80",
  },
  receiving: {
    iconBg: "bg-emerald-50",
    iconRing: "ring-emerald-100",
    iconText: "text-emerald-600",
    hoverBorder: "hover:border-emerald-200",
    hoverShadow: "hover:shadow-emerald-100/80",
  },
  putaway: {
    iconBg: "bg-cyan-50",
    iconRing: "ring-cyan-100",
    iconText: "text-cyan-600",
    hoverBorder: "hover:border-cyan-200",
    hoverShadow: "hover:shadow-cyan-100/80",
  },
  mm: {
    iconBg: "bg-slate-100",
    iconRing: "ring-slate-200/80",
    iconText: "text-slate-600",
    hoverBorder: "hover:border-slate-300",
    hoverShadow: "hover:shadow-slate-200/80",
  },
  picking: {
    iconBg: "bg-indigo-50",
    iconRing: "ring-indigo-100",
    iconText: "text-indigo-600",
    hoverBorder: "hover:border-indigo-200",
    hoverShadow: "hover:shadow-indigo-100/80",
  },
  production: {
    iconBg: "bg-orange-50",
    iconRing: "ring-orange-100",
    iconText: "text-orange-600",
    hoverBorder: "hover:border-orange-200",
    hoverShadow: "hover:shadow-orange-100/80",
  },
  inventory_count: {
    iconBg: "bg-blue-50",
    iconRing: "ring-blue-100",
    iconText: "text-blue-600",
    hoverBorder: "hover:border-blue-200",
    hoverShadow: "hover:shadow-blue-100/80",
  },
  packing: {
    iconBg: "bg-fuchsia-50",
    iconRing: "ring-fuchsia-100",
    iconText: "text-fuchsia-600",
    hoverBorder: "hover:border-fuchsia-200",
    hoverShadow: "hover:shadow-fuchsia-100/80",
  },
  issues: {
    iconBg: "bg-amber-50",
    iconRing: "ring-amber-100",
    iconText: "text-amber-600",
    hoverBorder: "hover:border-amber-200",
    hoverShadow: "hover:shadow-amber-100/80",
  },
  product_preview: {
    iconBg: "bg-teal-50",
    iconRing: "ring-teal-100",
    iconText: "text-teal-600",
    hoverBorder: "hover:border-teal-200",
    hoverShadow: "hover:shadow-teal-100/80",
  },
  operations: {
    iconBg: "bg-sky-50",
    iconRing: "ring-sky-100",
    iconText: "text-sky-600",
    hoverBorder: "hover:border-sky-200",
    hoverShadow: "hover:shadow-sky-100/80",
  },
  direct_sales: {
    iconBg: "bg-rose-50",
    iconRing: "ring-rose-100",
    iconText: "text-rose-600",
    hoverBorder: "hover:border-rose-200",
    hoverShadow: "hover:shadow-rose-100/80",
  },
};

export const STAT_CHIP_CLASS: Record<WmsModuleStatTone, string> = {
  neutral: "border-slate-100 bg-slate-50/80 text-slate-400",
  info: "border-blue-50 bg-blue-50/50 text-blue-500",
  success: "border-emerald-50 bg-emerald-50/50 text-emerald-600",
  warning: "border-amber-50 bg-amber-50/50 text-amber-600",
  critical: "border-red-50 bg-red-50/50 text-red-500",
};
