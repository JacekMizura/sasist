/** Tokeny listy pól — spójne z modułem automatyzacji. */
export const ocfListTableClass = "w-full min-w-[960px] table-fixed text-left text-sm";
export const ocfListThClass =
  "whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
export const ocfListThSortClass = `${ocfListThClass} cursor-pointer select-none hover:text-slate-800`;
export const ocfListTdClass = "px-4 py-0 align-middle text-sm leading-snug text-slate-800";
export const ocfListRowClass =
  "group border-b border-slate-100 transition-colors hover:bg-slate-50/60 last:border-b-0 even:bg-slate-50/20";
export const ocfListRowInnerClass = "flex min-h-[3.5rem] items-center";

/** Kolumna ikony — stała szerokość, wyśrodkowanie. */
export const ocfListIconColWidth = "3.5rem";
export const ocfListIconCellClass = "px-4 py-0 align-middle";
export const ocfListIconInnerClass = "flex min-h-[3.5rem] items-center justify-center";
export const ocfListIconSlotClass =
  "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200/90 bg-white";
export const ocfListIconPlaceholderClass =
  `${ocfListIconSlotClass} border-dashed border-slate-200 bg-slate-50 text-slate-300`;

/** Kolumna akcji — stała szerokość, przyciski 36×36 px. */
export const ocfListActionsColWidth = "6.5rem";
export const ocfListActionsCellClass = "px-4 py-0 align-middle";
export const ocfListActionsInnerClass =
  "flex min-h-[3.5rem] flex-row items-center justify-end gap-2";
export const ocfListRowActionBtn =
  "inline-flex h-9 w-9 min-h-9 min-w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-900";
export const ocfListRowActionBtnDanger =
  `${ocfListRowActionBtn} text-red-600 hover:border-red-200 hover:text-red-700`;
