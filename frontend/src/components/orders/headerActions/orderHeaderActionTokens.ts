/** Visual tokens for order-detail header action toolbar (Sellasist-style UX). */

export const odHeaderActionBtnClass =
  "relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-200 disabled:pointer-events-none disabled:opacity-40";

export const odHeaderActionBtnActiveClass =
  "border-slate-300 bg-slate-50 text-slate-900 ring-1 ring-slate-200/80";

export const odHeaderActionIconClass = "h-[18px] w-[18px] shrink-0";

export const odHeaderActionBadgeClass =
  "pointer-events-none absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-slate-800 px-1 text-[9px] font-bold leading-none text-white shadow-sm";

/** Context menu / dropdown — ~320–420 px, radius 12, soft shadow. */
export const odHeaderActionPopoverClass =
  "absolute right-0 z-[90] mt-1.5 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.28)] ring-1 ring-slate-200/60";

export const odHeaderActionPopoverWideClass =
  "absolute right-0 z-[90] mt-1.5 w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.28)] ring-1 ring-slate-200/60";

export const odHeaderActionSectionTitleClass =
  "px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500";

export const odHeaderActionMenuItemClass =
  "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-slate-800 transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40";

export const odHeaderActionMenuItemIconClass = "h-4 w-4 shrink-0 text-slate-500";

export const odHeaderActionMenuDividerClass = "my-0 border-t border-slate-100";

export const odHeaderActionDocActionBtnClass =
  "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-35";

export const odHeaderActionPrimaryCtaClass =
  "inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 transition-colors hover:border-slate-400 hover:bg-slate-50";

export const odHeaderActionFooterLinkClass =
  "block w-full px-3 py-2.5 text-left text-sm font-semibold text-blue-700 transition-colors hover:bg-slate-50 hover:text-blue-800";
