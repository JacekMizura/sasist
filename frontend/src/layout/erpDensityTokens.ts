/**
 * Global ERP/WMS density tokens — tune sidebar and dashboard spacing from one place.
 */

export const erpDensityTokens = {
  /** px — target height of a sidebar nav row */
  sidebarItemHeight: 36,
  /** px — gap between icon and label */
  sidebarItemGap: 8,
  /** px — horizontal padding inside dashboard cards */
  dashboardCardPadding: 12,
  /** px — vertical gap between dashboard sections */
  dashboardSectionGap: 16,
  /** px — minimum KPI card height */
  kpiCardHeight: 68,
} as const;

export const erpDensityClasses = {
  sidebarBrand: "flex h-14 shrink-0 items-center px-2.5",
  sidebarNav: "min-h-0 flex-1 overflow-y-auto px-2 py-1",
  sidebarSectionList: "flex flex-col gap-0.5",
  sidebarItemBase:
    "group relative flex h-9 min-h-9 w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left transition-colors duration-150",
  sidebarItemFocus:
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500",
  sidebarLabel: "min-w-0 flex-1 truncate text-[13px] leading-tight",
  sidebarActiveBar: "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full",
  sidebarIcon: "shrink-0 transition-colors",
  /** Prefer ERP sidebar `h-6 w-6` tokens; kept for legacy callers. */
  sidebarIconSize: 24,

  surfaceCard: "rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
  surfaceCardHover:
    "transition-shadow duration-200 hover:border-slate-300 hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)]",
  dashboardPagePadding: "px-4 py-4 sm:px-6 sm:py-5",
  dashboardSection: "mb-5",
  dashboardCardPadding: "p-3",
  dashboardCardPaddingMd: "p-3 sm:p-4",
  dashboardGridGap: "gap-3",
  dashboardSectionGapTop: "mt-5",
  dashboardSectionGapTopLg: "mt-6",

  kpiCardMinHeight: "min-h-[68px]",
  kpiCardPadding: "px-3 py-2",
  kpiGridGap: "gap-3",
} as const;
