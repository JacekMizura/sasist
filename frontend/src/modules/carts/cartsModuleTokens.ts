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

export const cartsPageShellClass = "space-y-3 text-[15px] leading-relaxed";

export const cartsSectionClass =
  "rounded-lg border border-slate-200/90 bg-white p-3 shadow-none";

export const cartsGroupShellClass =
  "overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-none";

export const cartsGroupHeaderClass =
  "flex items-center justify-between gap-2 border-b border-slate-200/90 bg-white px-3 py-2";

export const cartsDangerBtnClass =
  "inline-flex h-9 items-center justify-center rounded-md border border-red-200/90 bg-white px-3 text-[13px] font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50";

export const cartsWarningBtnClass =
  "inline-flex h-9 items-center justify-center rounded-md border border-amber-200/90 bg-white px-3 text-[13px] font-medium text-amber-900 transition hover:bg-amber-50 disabled:opacity-50";

export const cartsTableWrapClass = "min-w-0 overflow-x-auto rounded-lg border border-slate-200/90";

export const cartsTableClass = "min-w-full text-left text-[15px]";

export const cartsTableHeadClass =
  "border-b border-slate-200 bg-slate-50 text-[12px] font-bold uppercase tracking-wide text-slate-600";

export const cartsTableHeadCellClass = "px-3 py-2.5 font-bold";

export const cartsTableRowClass = "border-b border-slate-100 bg-white transition hover:bg-slate-50/80";

export const cartsTableCellClass = "px-3 py-2.5 align-middle text-slate-800";

export const cartsEmptyClass =
  "rounded-lg border border-dashed border-slate-200 bg-white py-10 text-center text-[13px] text-slate-500";

export const cartsEditorGridClass =
  "rounded-lg border border-slate-200/90 bg-slate-50/40 p-3 overflow-x-auto overflow-y-auto max-h-[65vh]";

export const cartsEditorLevelRowClass =
  "flex items-end gap-2 rounded-md border border-slate-200/90 bg-white p-2";

export const cartsEditorBasketBaseClass =
  "cursor-pointer rounded-md border flex flex-col items-center justify-center gap-1 p-2.5 transition shrink-0 text-center min-h-[84px] text-[14px] font-semibold";

export const cartsEditorBasketDefaultClass =
  "border-slate-300 bg-slate-100 text-slate-800 hover:border-slate-400 hover:bg-slate-50";

export const cartsEditorBasketSelectedClass =
  "border-amber-500 bg-amber-50 text-amber-950 ring-1 ring-amber-400/40 z-10";

export const cartsEditorBasketInvalidClass =
  "border-red-400 bg-red-50 text-red-900 animate-pulse";
