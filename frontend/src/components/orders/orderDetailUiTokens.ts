/**
 * Order detail (Karta zamówienia) presentation tokens — visual SSOT for mockup-aligned UI.
 * No business logic. Prefer these over one-off class strings on the detail page.
 */

/** Icon toolbar button in order header (nav, print, mail, …). */
export const odHeaderIconBtnClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-30";

/** Compact icon chip next to phone / email / edit fields. */
export const odInlineIconBtnClass =
  "inline-flex shrink-0 items-center justify-center rounded border border-slate-300 p-1 text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-900";

/** Large section title in info columns (Kupujący, Dostawa, …). */
export const odInfoSectionTitleClass = "text-lg font-bold text-slate-900";

/** Micro uppercase card title (Podsumowanie, Safe Order, WMS, …). */
export const odCardMicroTitleClass =
  "text-[11px] font-bold uppercase tracking-wider text-slate-500";

/** Standard content card shell. */
export const odCardShellClass =
  "rounded-xl border border-slate-200 bg-white p-4";

/** Slightly elevated summary finance card. */
export const odCardShellElevatedClass =
  "rounded-xl border border-slate-200 bg-white p-4 shadow-sm";

/** Right-rail section divider title inside unified side panel. */
export const odSidePanelSectionTitleClass =
  "text-[11px] font-bold uppercase tracking-wider text-slate-500";

/** Paid / success pill. */
export const odPaidBadgeClass =
  "inline-flex items-center rounded border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800";

/** WMS phase chip (dark slate). */
export const odWmsPhaseChipClass =
  "inline-block rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-white";

/** Secondary outline chip (gabaryt, meta). */
export const odMetaChipClass =
  "inline-flex items-center rounded border border-slate-300 bg-slate-50 px-2 py-1 text-sm text-slate-600";

/** Main content max width aligned with mockup. */
export const odMainMaxWidthClass = "mx-auto w-full max-w-[1440px]";
