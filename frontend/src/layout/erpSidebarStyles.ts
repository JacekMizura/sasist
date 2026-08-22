/**
 * ERP left sidebar layout tokens — global AppShell navigation SSOT.
 * Default desktop = icon rail (compact labels); expand for full labels via user menu.
 * Active / hover / indicator colors come from Design System (`brandUi`).
 */

import {
  brandSidebarNavActiveBarClassName,
  brandSidebarNavChevronClassName,
  brandSidebarNavIconClassName,
  brandSidebarNavItemClassName,
} from "../design-system/brandUi";

/** Icon rail (default) — widened ~30% vs v2 for readable labels at 1920×1080. */
export const ERP_SIDEBAR_COLLAPSED_WIDTH_PX = 104;
export const ERP_SIDEBAR_COLLAPSED_WIDTH_CLASS = "w-[104px]";

/** Expanded (full labels) — proportional bump when user opens the rail. */
export const ERP_SIDEBAR_WIDTH_PX = 252;
export const ERP_SIDEBAR_WIDTH_CLASS = "w-[252px]";

export const ERP_SIDEBAR_MOBILE_WIDTH_PX = 300;
export const ERP_SIDEBAR_MOBILE_WIDTH_CLASS = "w-[300px]";
export const ERP_FLYOUT_WIDTH_PX = 300;

export const ERP_SIDEBAR_SURFACE = "bg-white border-r border-slate-200";

export const ERP_SIDEBAR_NAV_SCROLL =
  "[scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-transparent hover:[&::-webkit-scrollbar-thumb]:bg-slate-300";

export const ERP_SIDEBAR_SECTION_LABEL =
  "px-3 pb-2 pt-4 text-[11px] font-bold uppercase tracking-wider text-slate-400 first:pt-2";

/** Canonical module icon geometry — rail + expanded (24px). */
export const ERP_SIDEBAR_ICON_CLASS = "h-6 w-6 shrink-0";
export const ERP_SIDEBAR_ICON_COLLAPSED_CLASS = ERP_SIDEBAR_ICON_CLASS;

/** Absolute left indicator bar on active item (Design System). */
export const ERP_SIDEBAR_ACTIVE_BAR = brandSidebarNavActiveBarClassName;

/**
 * Icon-rail item (collapsed): icon above label, centered.
 */
export function erpSidebarIconRailItemClassName(isActive: boolean): string {
  return [
    "group relative flex w-full flex-col items-center justify-center gap-1 rounded-lg px-1.5 py-2.5 text-center transition-colors duration-150 ease-out",
    "min-h-[4.25rem]",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400",
    isActive
      ? "bg-orange-50/80 font-semibold text-orange-600"
      : "font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900",
  ].join(" ");
}

export const ERP_SIDEBAR_ICON_RAIL_LABEL_CLASS =
  "max-w-full px-0.5 text-[11px] font-medium leading-[1.2] tracking-tight line-clamp-2 break-words";

/** WMS entry — navigation chrome only (not WMS module UI). */
export const ERP_SIDEBAR_WMS_ICON_CLASS = ERP_SIDEBAR_ICON_CLASS;

export function erpSidebarWmsCollapsedClassName(): string {
  return [
    "flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-2.5",
    "min-h-[4.25rem] text-slate-700 transition-colors duration-150 ease-out",
    "hover:bg-slate-50 hover:text-slate-900",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400",
  ].join(" ");
}

export const ERP_SIDEBAR_WMS_EXPANDED_CLASS =
  "flex min-h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 text-[15px] font-semibold text-slate-800 transition-colors duration-150 ease-out hover:bg-slate-50 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400";

/** Bump key so old “expanded” preference does not stick after rail redesign. */
export const ERP_SIDEBAR_COLLAPSE_STORAGE_KEY = "erp-sidebar-rail-v3";

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
