/** Tokeny listy pól — spójne z modułem automatyzacji. */
export const ocfListTableClass = "w-full min-w-[960px] table-fixed text-left text-sm";
export const ocfListThClass =
  "whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
export const ocfListThSortClass = `${ocfListThClass} cursor-pointer select-none hover:text-slate-800`;
export const ocfListTdClass = "px-4 py-0 align-middle text-sm leading-snug text-slate-800";
export const ocfListRowClass =
  "group border-b border-slate-100 transition-colors hover:bg-slate-50/60 last:border-b-0 even:bg-slate-50/20";
export const ocfListRowInnerClass = "flex min-h-[3.5rem] items-center";

/** Kolumna ikony — stała szerokość 80px, wyśrodkowanie w komórce nadrzędnej. */
export const ocfListIconColWidth = "80px";
export const ocfListIconCellClass = "px-2 py-0 align-middle text-center";
export const ocfListIconInnerClass =
  "flex min-h-[3.5rem] w-full items-center justify-center";

/** Renderer ikony — bez ramek i tła; stały rozmiar 32×32 px. */
export const ocfFieldIconImageClass =
  "block h-8 w-8 max-h-8 max-w-8 shrink-0 object-contain object-center";
export const ocfFieldIconLucideClass = "block h-8 w-8 max-h-8 max-w-8 shrink-0 text-slate-700";
export const ocfFieldIconMissingClass = "text-sm text-slate-400";

/** Kolumna akcji — stała szerokość, przyciski 36×36 px. */
export const ocfListActionsColWidth = "6.5rem";
export const ocfListActionsCellClass = "px-4 py-0 align-middle";
export const ocfListActionsInnerClass =
  "flex min-h-[3.5rem] flex-row items-center justify-end gap-2";
export const ocfListRowActionBtn =
  "inline-flex h-9 w-9 min-h-9 min-w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-900";
export const ocfListRowActionBtnDanger =
  `${ocfListRowActionBtn} text-red-600 hover:border-red-200 hover:text-red-700`;
