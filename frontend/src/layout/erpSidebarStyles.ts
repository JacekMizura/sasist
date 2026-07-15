/**
 * ERP left sidebar tokens — Linear / Notion style (white surface, orange active).
 * Shared with {@link NavFlyoutPanel} for left offset.
 */

export const ERP_SIDEBAR_WIDTH_PX = 268;
export const ERP_SIDEBAR_COLLAPSED_WIDTH_PX = 76;
export const ERP_SIDEBAR_MOBILE_WIDTH_PX = 280;

export const ERP_SIDEBAR_WIDTH_CLASS = "w-[268px]";
export const ERP_SIDEBAR_COLLAPSED_WIDTH_CLASS = "w-[76px]";
export const ERP_SIDEBAR_MOBILE_WIDTH_CLASS = "w-[280px]";

export const ERP_SIDEBAR_SURFACE =
  "bg-white border-r border-[#E2E8F0]";

export const ERP_SIDEBAR_NAV_SCROLL =
  "[scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-transparent hover:[&::-webkit-scrollbar-thumb]:bg-slate-300";

export const ERP_SIDEBAR_SECTION_LABEL =
  "px-5 pb-1 pt-5 text-xs font-bold uppercase tracking-wider text-slate-400 first:pt-2";

export const ERP_SIDEBAR_ITEM_BASE =
  "group relative flex w-full items-center gap-4 rounded-xl px-5 py-3 text-left font-medium text-slate-600 transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500";

export const ERP_SIDEBAR_ITEM_HOVER = "hover:bg-orange-50 hover:text-orange-600";

export const ERP_SIDEBAR_ITEM_ACTIVE =
  "border-l-[3px] border-orange-500 bg-orange-50 font-semibold text-orange-600";

export const ERP_SIDEBAR_ITEM_INACTIVE = "border-l-[3px] border-transparent";

export const ERP_SIDEBAR_ICON_CLASS = "h-6 w-6 shrink-0";
export const ERP_SIDEBAR_ICON_COLLAPSED_CLASS = "h-7 w-7 shrink-0";

export const ERP_SIDEBAR_COLLAPSE_STORAGE_KEY = "erp-sidebar-collapsed";

/** @deprecated Accent map removed — sidebar uses a single orange active state. */
export type NavCategoryAccent = {
  barClass: string;
  activeBgClass: string;
  activeTextClass: string;
  activeIconClass: string;
  hoverBgClass: string;
};

const ORANGE_ACCENT: NavCategoryAccent = {
  barClass: "bg-orange-500",
  activeBgClass: "bg-orange-50",
  activeTextClass: "text-orange-600",
  activeIconClass: "text-orange-600",
  hoverBgClass: "hover:bg-orange-50",
};

/** Kept for callers that still import accents — always orange. */
export function getNavCategoryAccent(_categoryId?: string): NavCategoryAccent {
  return ORANGE_ACCENT;
}

export const WMS_NAV_ACCENT = ORANGE_ACCENT;

/** @deprecated Use active border-l on the item itself. */
export const ERP_SIDEBAR_ACTIVE_BAR = "hidden";
