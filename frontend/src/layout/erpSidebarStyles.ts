/**
 * ERP left sidebar tokens — Linear / Notion / Stripe style (white + blue active).
 * Shared with {@link NavFlyoutPanel} for left offset.
 */

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

export const ERP_SIDEBAR_ITEM_BASE =
  "group relative flex w-full items-center gap-3.5 rounded-xl px-4 py-3.5 text-left text-[15px] font-medium text-slate-700 transition-colors duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]";

export const ERP_SIDEBAR_ITEM_HOVER = "hover:bg-[#EFF6FF] hover:text-slate-900";

export const ERP_SIDEBAR_ITEM_ACTIVE = "bg-blue-50 font-semibold text-blue-600";

export const ERP_SIDEBAR_ITEM_INACTIVE = "";

export const ERP_SIDEBAR_ICON_CLASS = "h-6 w-6 shrink-0";
export const ERP_SIDEBAR_ICON_COLLAPSED_CLASS = "h-6 w-6 shrink-0";

/** Absolute left indicator bar on active item. */
export const ERP_SIDEBAR_ACTIVE_BAR =
  "absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r bg-blue-600";

export const ERP_SIDEBAR_COLLAPSE_STORAGE_KEY = "erp-sidebar-collapsed";

export type NavCategoryAccent = {
  barClass: string;
  activeBgClass: string;
  activeTextClass: string;
  activeIconClass: string;
  hoverBgClass: string;
};

const BLUE_ACCENT: NavCategoryAccent = {
  barClass: "bg-blue-600",
  activeBgClass: "bg-blue-50",
  activeTextClass: "text-blue-600",
  activeIconClass: "text-blue-600",
  hoverBgClass: "hover:bg-[#EFF6FF]",
};

export function getNavCategoryAccent(_categoryId?: string): NavCategoryAccent {
  return BLUE_ACCENT;
}

export const WMS_NAV_ACCENT = BLUE_ACCENT;
