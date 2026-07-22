/** Shared ERP/WMS UI tokens for Wózki / Regały / Strefy / Nośniki — dense operational chrome. */

export {
  filterInputClass as cartsInputClass,
  filterSelectClass as cartsSelectClass,
  filterLabelClass as cartsLabelClass,
  filterToolbarBtnPrimary as cartsBtnPrimary,
  filterToolbarBtnSecondary as cartsBtnSecondary,
  filterToolbarBtnApply as cartsBtnApply,
  filterToolbarBtnGhost as cartsBtnGhost,
} from "../../components/filters/filterUiTokens";

export {
  appFieldLabelClass as cartsFieldLabelClass,
  appInputClass as cartsAppInputClass,
  appSectionTitleClass as cartsSectionTitleClass,
} from "../../components/app-shell/appShellTokens";

/** Screenshot-parity primary CTA (orange) for Magazyn module. */
export const cartsOrangeCtaClass =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export const cartsOutlineCtaClass =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

/** Dark primary CTA (e.g. Zapisz regał on Regały editor). */
export const cartsDarkCtaClass =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export const cartsPageShellClass = "space-y-4 text-[15px] leading-relaxed";

export const cartsSectionClass =
  "rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5";

export const cartsGroupShellClass =
  "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm";

export const cartsGroupHeaderClass =
  "flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/90 bg-white px-4 py-3";

export const cartsDangerBtnClass =
  "inline-flex h-9 items-center justify-center rounded-lg border border-red-200 bg-white px-3 text-[13px] font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50";

export const cartsWarningBtnClass =
  "inline-flex h-9 items-center justify-center rounded-lg border border-amber-200/90 bg-white px-3 text-[13px] font-medium text-amber-900 transition hover:bg-amber-50 disabled:opacity-50";

export const cartsTableWrapClass = "min-w-0 overflow-x-auto rounded-xl border border-slate-200";

export const cartsTableClass = "min-w-full text-left text-sm";

export const cartsTableHeadClass =
  "border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500";

export const cartsTableHeadCellClass = "px-4 py-3 font-semibold";

export const cartsTableRowClass = "border-b border-slate-100 bg-white transition hover:bg-slate-50/70";

export const cartsTableCellClass = "px-4 py-3 align-middle text-slate-800";

export const cartsEmptyClass =
  "rounded-xl border border-dashed border-slate-200 bg-white py-12 text-center text-sm text-slate-500";

export const cartsEditorGridClass =
  "rounded-xl border border-slate-200 bg-slate-50/40 p-3 overflow-x-auto overflow-y-auto max-h-[65vh]";

export const cartsEditorLevelRowClass =
  "flex items-end gap-2 rounded-lg border border-slate-200 bg-white p-2";

export const cartsEditorBasketBaseClass =
  "cursor-pointer rounded-lg border flex flex-col items-center justify-center gap-1 p-2.5 transition shrink-0 text-center min-h-[84px] text-[14px] font-semibold";

export const cartsEditorBasketDefaultClass =
  "border-slate-300 bg-slate-100 text-slate-800 hover:border-slate-400 hover:bg-slate-50";

export const cartsEditorBasketSelectedClass =
  "border-amber-500 bg-amber-50 text-amber-950 ring-1 ring-amber-400/40 z-10";

export const cartsEditorBasketInvalidClass =
  "border-red-400 bg-red-50 text-red-900 animate-pulse";
