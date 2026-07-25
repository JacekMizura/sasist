/**
 * ERP left sidebar layout tokens.
 * Active / hover / indicator colors come from Design System.
 */

import {
  brandSidebarNavActiveBarClassName,
  brandSidebarNavChevronClassName,
  brandSidebarNavIconClassName,
  brandSidebarNavItemClassName,
} from "../design-system/brandUi";

export const ERP_SIDEBAR_WIDTH_PX = 260;
export const ERP_SIDEBAR_COLLAPSED_WIDTH_PX = 76;
export const ERP_SIDEBAR_MOBILE_WIDTH_PX = 280;
export const ERP_FLYOUT_WIDTH_PX = 300;

export const ERP_SIDEBAR_WIDTH_CLASS = "w-[260px]";
export const ERP_SIDEBAR_COLLAPSED_WIDTH_CLASS = "w-[76px]";
export const ERP_SIDEBAR_MOBILE_WIDTH_CLASS = "w-[280px]";

export const ERP_SIDEBAR_SURFACE = "bg-white border-r border-slate-200";

export const ERP_SIDEBAR_NAV_SCROLL =
  "[scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-transparent hover:[&::-webkit-scrollbar-thumb]:bg-slate-300";

export const ERP_SIDEBAR_SECTION_LABEL =
  "px-4 pb-2 pt-6 text-xs font-bold uppercase tracking-wider text-slate-400 first:pt-3";

export const ERP_SIDEBAR_ICON_CLASS = "h-6 w-6 shrink-0";
export const ERP_SIDEBAR_ICON_COLLAPSED_CLASS = "h-6 w-6 shrink-0";

/** Absolute left indicator bar on active item (Design System). */
export const ERP_SIDEBAR_ACTIVE_BAR = brandSidebarNavActiveBarClassName;

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
