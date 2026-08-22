/** Shared Tailwind tokens — dense admin list filters. Facade over Sasist UI Kit. */

import {
  primaryButtonClass,
  secondaryButtonClass,
  ghostButtonClass,
  iconButtonClass,
  inputClassName,
  shadows,
} from "../../design-system";

/** 36px — aligned with module list filter spec (h-9) */
export const filterControlHeightClass = "h-9";

export const filterInputClass = inputClassName("default", "neutral");

export const filterSelectClass = filterInputClass;

/** Small label above control (compact, high density). */
export const filterLabelClass = "mb-0.5 block text-[11px] font-medium leading-tight text-slate-500";

export const filterPanelTitleClass = "text-sm font-semibold text-slate-800";

/** Primary toolbar action — Design System Primary (orange). */
export const filterToolbarBtnPrimary = primaryButtonClass;

/**
 * Apply / „Filtruj” — **same as Primary** (SSOT).
 * Historically amber Sellasist accent; collapsed to brand orange in UI SSOT Phase A.
 */
export const filterToolbarBtnApply = primaryButtonClass;

export const filterToolbarBtnSecondary = secondaryButtonClass;

export const filterToolbarBtnToggle =
  "inline-flex h-[2.375rem] items-center gap-1.5 rounded-md border border-slate-200/90 bg-slate-50 px-3 text-[13px] font-semibold text-slate-800 shadow-none transition hover:border-slate-300 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-300/50 focus-visible:ring-offset-1";

export const filterToolbarBtnGhost = ghostButtonClass;

/** Square icon-only control. */
export const filterToolbarBtnIconSquare = iconButtonClass;

export const filterPanelBodyClass = "space-y-2.5 px-3 py-3 sm:px-4 sm:py-3";

export const filterActionsFooterClass =
  "flex flex-wrap items-center justify-end gap-2 border-t border-slate-200/80 pt-2.5";

export const filterActionsFooterMobileOnlyClass = `${filterActionsFooterClass} sm:hidden`;

/**
 * @deprecated Prefer `<FilterPanel elevation="none" />`.
 * Kept as thin facade for any remaining className consumers.
 */
export const filterEmbeddedPanelClass = shadows.none;

export const filterCheckboxClass =
  "h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-slate-800 focus:ring-1 focus:ring-slate-400/50";

export const filterGridColsClass =
  "grid grid-cols-1 gap-x-2.5 gap-y-2.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4";
