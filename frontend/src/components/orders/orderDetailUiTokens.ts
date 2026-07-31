/**
 * Order detail (Karta zamówienia) — visual hierarchy tokens.
 * Composition: context (quiet) → products (dominant) → helpers (secondary).
 */

/** Icon toolbar button in order header (nav, print, mail, …). */
export const odHeaderIconBtnClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-30";

/** Compact icon chip next to phone / email / edit fields. */
export const odInlineIconBtnClass =
  "inline-flex shrink-0 items-center justify-center rounded border border-slate-300 p-1 text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-900";

/** Info-column titles (Kupujący, Dostawa…) — quiet vs products hero. */
export const odInfoSectionTitleClass = "text-base font-semibold text-slate-800";

/** Dominant products section title. */
export const odProductsHeroTitleClass = "text-3xl font-bold tracking-tight text-slate-900";

/** Micro uppercase card title for secondary / helper blocks. */
export const odCardMicroTitleClass =
  "text-[11px] font-bold uppercase tracking-wider text-slate-500";

/** Helper card shell (packaging, notes, waybills). */
export const odCardShellClass =
  "rounded-lg border border-slate-200 bg-white p-3.5";

/** Elevated finance card in side rail. */
export const odCardShellElevatedClass =
  "rounded-lg border border-slate-200 bg-white p-4 shadow-sm";

/** Right-rail / helper section divider title. */
export const odSidePanelSectionTitleClass =
  "text-[10px] font-bold uppercase tracking-wider text-slate-500";

/** Quiet secondary rail title (Safe Order, extra fields). */
export const odSidePanelQuietTitleClass =
  "text-[10px] font-bold uppercase tracking-wider text-slate-400";

/** Paid / success pill. */
export const odPaidBadgeClass =
  "inline-flex items-center rounded border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800";

/** WMS phase chip (dark slate). */
export const odWmsPhaseChipClass =
  "inline-block rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-white";

/** Secondary outline chip (gabaryt, meta). */
export const odMetaChipClass =
  "inline-flex items-center rounded border border-slate-300 bg-slate-50 px-2 py-1 text-sm text-slate-600";

/**
 * Main workspace width next to the status sidebar.
 * Left-aligned so content sits close to the panel; soft ultrawide cap.
 */
export const odMainMaxWidthClass = "w-full max-w-[2400px]";

/** Horizontal inset — tight on the sidebar side. */
export const odMainHorizontalPadClass = "pl-2 pr-4 sm:pl-3 sm:pr-5";
