/** Shared Tailwind tokens — dense admin list filters (Sellasist-style benchmark). */

/** 36px — aligned with module list filter spec (h-9) */
export const filterControlHeightClass = "h-9";

export const filterInputClass = `${filterControlHeightClass} w-full rounded-md border border-slate-200/90 bg-white px-2.5 text-[13px] leading-tight text-slate-900 shadow-none placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400/35`;

export const filterSelectClass = filterInputClass;

/** Small label above control (compact, high density). */
export const filterLabelClass = "mb-0.5 block text-[11px] font-medium leading-tight text-slate-500";

export const filterPanelTitleClass = "text-sm font-semibold text-slate-800";

/** Primary toolbar action — slate (non-filter contexts). */
export const filterToolbarBtnPrimary =
  "inline-flex h-[2.375rem] items-center justify-center rounded-md bg-slate-800 px-3.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50 focus-visible:ring-offset-1";

/** Apply / „Filtruj” — warm accent (Sellasist-style). */
export const filterToolbarBtnApply =
  "inline-flex h-[2.375rem] items-center justify-center rounded-md bg-amber-600 px-3.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:ring-offset-1";

export const filterToolbarBtnSecondary =
  "inline-flex h-[2.375rem] items-center justify-center rounded-md border border-slate-200/90 bg-white px-3 text-[13px] font-medium text-slate-700 shadow-none transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-300/60 focus-visible:ring-offset-1";

export const filterToolbarBtnToggle =
  "inline-flex h-[2.375rem] items-center gap-1.5 rounded-md border border-slate-200/90 bg-slate-50 px-3 text-[13px] font-semibold text-slate-800 shadow-none transition hover:border-slate-300 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-300/50 focus-visible:ring-offset-1";

export const filterToolbarBtnGhost =
  "inline-flex h-[2.375rem] items-center gap-1.5 rounded-md border border-transparent px-2 text-[13px] font-medium text-slate-600 transition hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-300/40 focus-visible:ring-offset-1";

/** Square icon-only control (list filter chrome / Sellasist-style utilities). */
export const filterToolbarBtnIconSquare =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[5px] border border-slate-200/90 bg-white text-slate-600 shadow-none transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400/35";

export const filterPanelBodyClass = "space-y-2.5 px-3 py-3 sm:px-4 sm:py-3";

/** Shared footer row — „Wyczyść filtry” / „Filtruj” (always visible). */
export const filterActionsFooterClass =
  "flex flex-wrap items-center justify-end gap-2 border-t border-slate-200/80 pt-2.5";

/** Same as {@link filterActionsFooterClass}, hidden from `sm` up when actions live in {@link FilterToolbar}. */
export const filterActionsFooterMobileOnlyClass = `${filterActionsFooterClass} sm:hidden`;

/** Embedded list filters — bare panel inside page chrome (Products / Sellasist lists). */
export const filterEmbeddedPanelClass = "shadow-none";

export const filterCheckboxClass =
  "h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-slate-800 focus:ring-1 focus:ring-slate-400/50";

/**
 * Balanced filter grid: max 4 columns on large screens, fewer on smaller viewports
 * (mobile 1 → tablet 2 → laptop 3 → xl 4). Avoids overcrowded single rows.
 */
export const filterGridColsClass =
  "grid grid-cols-1 gap-x-2.5 gap-y-2.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4";
