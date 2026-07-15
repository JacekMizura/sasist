import { erpDensityClasses } from "./erpDensityTokens";

/**
 * Global app layout tokens — single source for shell, page gutters, and panels.
 */

export const appLayoutTokens = {
  appBackground: "bg-slate-50",
  appPanelBackground: "bg-white",
  appBorder: "border-slate-200",
  appPagePadding: erpDensityClasses.dashboardPagePadding,
  appSidebarWidth: "w-[268px]",
  appRightPanelWidth: "w-[400px]",
  appRightPanelMaxWidth: "max-w-[420px]",
} as const;

/** Composed class strings for common layout surfaces */
export const appLayoutClasses = {
  shell: `${appLayoutTokens.appBackground} min-h-0`,
  shellBorder: appLayoutTokens.appBorder,
  page: `flex min-h-0 min-w-0 flex-1 flex-col ${appLayoutTokens.appBackground}`,
  pagePadding: `${appLayoutTokens.appPagePadding} min-h-0 min-w-0 flex-1 flex-col`,
  rightPanel: [
    "flex h-full min-h-0 shrink-0 flex-col overflow-hidden",
    appLayoutTokens.appRightPanelWidth,
    appLayoutTokens.appRightPanelMaxWidth,
    "border-l",
    appLayoutTokens.appBorder,
    appLayoutTokens.appPanelBackground,
  ].join(" "),
  rightPanelScroll: "min-h-0 flex-1 overflow-y-auto overscroll-y-contain",
  sectionCard: `rounded-xl border ${appLayoutTokens.appBorder} ${appLayoutTokens.appPanelBackground}`,
  splitRow: "flex min-h-0 min-w-0 flex-1 items-stretch overflow-hidden",
} as const;
