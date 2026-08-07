/**
 * ERP left sidebar layout tokens.
 * Default desktop = narrow icon rail (~Sellasist proportions); expand for full labels.
 * Active / hover / indicator colors come from Design System.
 */

import {
  brandSidebarNavActiveBarClassName,
  brandSidebarNavChevronClassName,
  brandSidebarNavIconClassName,
  brandSidebarNavItemClassName,
} from "../design-system/brandUi";

/** Expanded (full labels) — still denser than the old 260px. */
export const ERP_SIDEBAR_WIDTH_PX = 220;
export const ERP_SIDEBAR_WIDTH_CLASS = "w-[220px]";

/**
 * Default icon rail — Sellasist-like narrow strip with icon + tiny label.
 * ~88px leaves room for 2-line truncated labels without eating the content column.
 */
export const ERP_SIDEBAR_COLLAPSED_WIDTH_PX = 88;
export const ERP_SIDEBAR_COLLAPSED_WIDTH_CLASS = "w-[88px]";

export const ERP_SIDEBAR_MOBILE_WIDTH_PX = 280;
export const ERP_SIDEBAR_MOBILE_WIDTH_CLASS = "w-[280px]";
export const ERP_FLYOUT_WIDTH_PX = 300;

export const ERP_SIDEBAR_SURFACE = "bg-slate-50 border-r border-slate-200";

export const ERP_SIDEBAR_NAV_SCROLL =
  "[scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-transparent hover:[&::-webkit-scrollbar-thumb]:bg-slate-300";

export const ERP_SIDEBAR_SECTION_LABEL =
  "px-3 pb-1.5 pt-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 first:pt-2";

export const ERP_SIDEBAR_ICON_CLASS = "h-5 w-5 shrink-0";
export const ERP_SIDEBAR_ICON_COLLAPSED_CLASS = "h-5 w-5 shrink-0";

/** Absolute left indicator bar on active item (Design System). */
export const ERP_SIDEBAR_ACTIVE_BAR = brandSidebarNavActiveBarClassName;

/**
 * Icon-rail item (collapsed): icon above label, centered — Sellasist-like.
 */
export function erpSidebarIconRailItemClassName(isActive: boolean): string {
  return [
    "group relative flex w-full flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-2 text-center transition-colors duration-150 ease-out",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400",
    isActive
      ? "bg-white font-semibold text-orange-600 shadow-sm ring-1 ring-slate-200/80"
      : "font-medium text-slate-600 hover:bg-white/80 hover:text-slate-900",
  ].join(" ");
}

export const ERP_SIDEBAR_ICON_RAIL_LABEL_CLASS =
  "max-w-full px-0.5 text-[9px] font-medium leading-[1.15] tracking-tight line-clamp-2 break-words";

export const ERP_SIDEBAR_COLLAPSE_STORAGE_KEY = "erp-sidebar-collapsed";

export type NavCategoryAccent = {
  barClass: string;
  activeBgClass: string;
  activeTextClass: string;
  activeIconClass: string;
  hoverBgClass: string;
};

const BRAND_ACCENT: NavCategoryAccent = {
  barClass: "bg-orange-500",
  activeBgClass: "bg-orange-50/70",
  activeTextClass: "text-orange-600",
  activeIconClass: "text-orange-600",
  hoverBgClass: "hover:bg-slate-100",
};

export function getNavCategoryAccent(_categoryId?: string): NavCategoryAccent {
  return BRAND_ACCENT;
}

export const WMS_NAV_ACCENT = BRAND_ACCENT;

export function erpSidebarNavItemClassName(isActive: boolean): string {
  return brandSidebarNavItemClassName(isActive);
}

export function erpSidebarNavIconClassName(isActive: boolean): string {
  return brandSidebarNavIconClassName(isActive);
}

export function erpSidebarNavChevronClassName(isActive: boolean): string {
  return brandSidebarNavChevronClassName(isActive);
}

export function erpSidebarFlyoutRowClassName(isActive: boolean): string {
  return brandSidebarNavItemClassName(isActive, { density: "flyout" });
}
