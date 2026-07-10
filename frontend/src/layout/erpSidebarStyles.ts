export type NavCategoryAccent = {
  barClass: string;
  activeBgClass: string;
  activeTextClass: string;
  activeIconClass: string;
  hoverBgClass: string;
};

const DEFAULT_ACCENT: NavCategoryAccent = {
  barClass: "bg-slate-400",
  activeBgClass: "bg-slate-100",
  activeTextClass: "text-slate-900",
  activeIconClass: "text-slate-600",
  hoverBgClass: "hover:bg-slate-50",
};

/** Per-module accent for ERP sidebar active / hover states (light bg + left bar). */
export const ERP_NAV_CATEGORY_ACCENT: Record<string, NavCategoryAccent> = {
  orders: {
    barClass: "bg-blue-500",
    activeBgClass: "bg-blue-50",
    activeTextClass: "text-blue-900",
    activeIconClass: "text-blue-600",
    hoverBgClass: "hover:bg-blue-50/80",
  },
  customers: {
    barClass: "bg-indigo-500",
    activeBgClass: "bg-indigo-50",
    activeTextClass: "text-indigo-900",
    activeIconClass: "text-indigo-600",
    hoverBgClass: "hover:bg-indigo-50/80",
  },
  assortment: {
    barClass: "bg-emerald-500",
    activeBgClass: "bg-emerald-50",
    activeTextClass: "text-emerald-900",
    activeIconClass: "text-emerald-600",
    hoverBgClass: "hover:bg-emerald-50/80",
  },
  warehouse: {
    barClass: "bg-sky-500",
    activeBgClass: "bg-sky-50",
    activeTextClass: "text-sky-900",
    activeIconClass: "text-sky-600",
    hoverBgClass: "hover:bg-sky-50/80",
  },
  purchasing: {
    barClass: "bg-violet-500",
    activeBgClass: "bg-violet-50",
    activeTextClass: "text-violet-900",
    activeIconClass: "text-violet-600",
    hoverBgClass: "hover:bg-violet-50/80",
  },
  analytics: {
    barClass: "bg-rose-500",
    activeBgClass: "bg-rose-50",
    activeTextClass: "text-rose-900",
    activeIconClass: "text-rose-600",
    hoverBgClass: "hover:bg-rose-50/80",
  },
  labels: {
    barClass: "bg-fuchsia-500",
    activeBgClass: "bg-fuchsia-50",
    activeTextClass: "text-fuchsia-900",
    activeIconClass: "text-fuchsia-600",
    hoverBgClass: "hover:bg-fuchsia-50/80",
  },
  documents: {
    barClass: "bg-teal-500",
    activeBgClass: "bg-teal-50",
    activeTextClass: "text-teal-900",
    activeIconClass: "text-teal-600",
    hoverBgClass: "hover:bg-teal-50/80",
  },
  settings: {
    barClass: "bg-slate-500",
    activeBgClass: "bg-slate-100",
    activeTextClass: "text-slate-900",
    activeIconClass: "text-slate-600",
    hoverBgClass: "hover:bg-slate-50",
  },
  system: {
    barClass: "bg-slate-600",
    activeBgClass: "bg-slate-100",
    activeTextClass: "text-slate-900",
    activeIconClass: "text-slate-700",
    hoverBgClass: "hover:bg-slate-50",
  },
  wms: {
    barClass: "bg-orange-500",
    activeBgClass: "bg-orange-50",
    activeTextClass: "text-orange-900",
    activeIconClass: "text-orange-600",
    hoverBgClass: "hover:bg-orange-50/80",
  },
};

export function getNavCategoryAccent(categoryId: string): NavCategoryAccent {
  return ERP_NAV_CATEGORY_ACCENT[categoryId] ?? DEFAULT_ACCENT;
}

export const WMS_NAV_ACCENT: NavCategoryAccent = {
  barClass: "bg-orange-500",
  activeBgClass: "bg-orange-50",
  activeTextClass: "text-orange-900",
  activeIconClass: "text-orange-600",
  hoverBgClass: "hover:bg-orange-50/80",
};

/** Sidebar width in px — shared with fly-out positioning ({@link NavFlyoutPanel}). */
export const ERP_SIDEBAR_WIDTH_PX = 224;

export const ERP_SIDEBAR_WIDTH_CLASS = "w-56";

export const ERP_SIDEBAR_NAV_SCROLL =
  "[scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-transparent hover:[&::-webkit-scrollbar-thumb]:bg-slate-300";

import { erpDensityClasses } from "./erpDensityTokens";

export const ERP_SIDEBAR_ACTIVE_BAR = erpDensityClasses.sidebarActiveBar;
