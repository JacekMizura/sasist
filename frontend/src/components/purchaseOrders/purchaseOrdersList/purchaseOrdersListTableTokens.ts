/** Tokeny tabeli zamówień towaru — proporcjonalny układ (bez checkboxa). */

/** Stała szerokość kolumny „Poz.” — tylko zawartość liczbowa. */
export const PO_LIST_POS_COL_PX = 52;

/** Stała szerokość kolumny Akcje — 4 przyciski w jednym rzędzie bez zawijania. */
export const PO_LIST_ACTIONS_COL_PX = 176;

export const poListTableClass = "w-full table-fixed text-left text-sm";
export const poListThClass =
  "sticky top-0 z-10 whitespace-nowrap bg-white px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-[inset_0_-1px_0_0_rgb(226,232,240)]";
export const poListTdClass = "min-w-0 px-4 py-0 align-middle text-sm leading-snug text-slate-800";
export const poListRowClass =
  "group border-b border-slate-100 transition-colors hover:bg-slate-50/60 last:border-b-0 even:bg-slate-50/20";
export const poListRowInnerClass = "flex min-h-[3.5rem] items-center";

export const poListNameCellClass = "min-w-0 px-4 py-0 align-middle text-sm leading-snug text-slate-800";
export const poListNameThClass =
  "sticky top-0 z-10 min-w-0 bg-white px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-[inset_0_-1px_0_0_rgb(226,232,240)]";

export const poListActionsCellClass =
  "sticky right-0 z-[2] box-border w-[176px] min-w-[176px] max-w-[176px] shrink-0 bg-inherit px-1 py-0 align-middle";
export const poListActionsThClass =
  "sticky right-0 top-0 z-[3] box-border w-[176px] min-w-[176px] max-w-[176px] shrink-0 bg-white px-1 py-3 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-[inset_0_-1px_0_0_rgb(226,232,240)]";
export const poListActionsInnerClass =
  "flex min-h-[3.5rem] flex-row flex-nowrap items-center justify-center gap-1 overflow-visible";
export const poListPosThClass =
  "sticky top-0 z-10 w-[52px] min-w-[52px] max-w-[52px] shrink-0 whitespace-nowrap bg-white px-2 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500 shadow-[inset_0_-1px_0_0_rgb(226,232,240)]";
export const poListPosCellClass =
  "w-[52px] min-w-[52px] max-w-[52px] shrink-0 px-2 py-0 align-middle text-sm leading-snug text-slate-800";
export const poListRowActionBtn =
  "inline-flex h-9 w-9 min-h-9 min-w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-900";
export const poListRowActionBtnDanger =
  `${poListRowActionBtn} text-red-600 hover:border-red-200 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40`;
