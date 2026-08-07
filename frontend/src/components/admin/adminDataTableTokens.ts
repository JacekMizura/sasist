/**
 * Shared admin list table tokens — single visual language for admin modules
 * (order/product custom fields, and future admin lists).
 */

export const adminListTableClass = "w-full min-w-[960px] table-fixed text-left text-sm";
export const adminListThClass =
  "whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
export const adminListThSortClass = `${adminListThClass} cursor-pointer select-none hover:text-slate-800`;
export const adminListTdClass = "px-4 py-0 align-middle text-sm leading-snug text-slate-800";
export const adminListRowClass =
  "group border-b border-slate-100 transition-colors hover:bg-slate-50/60 last:border-b-0 even:bg-slate-50/20";
export const adminListRowInnerClass = "flex min-h-[3.5rem] items-center";

export const adminListActionsColWidth = "5rem";
export const adminListActionsCellClass = "w-[5rem] px-2 py-0 align-middle text-right";
export const adminListActionsInnerClass =
  "flex min-h-[3.5rem] w-full flex-row items-center justify-end gap-1.5";
export const adminListActionsThClass =
  "w-[5rem] whitespace-nowrap px-2 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500";
export const adminListRowActionBtn =
  "inline-flex h-8 w-8 min-h-8 min-w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-900";
export const adminListRowActionBtnDanger =
  `${adminListRowActionBtn} text-red-600 hover:border-red-200 hover:text-red-700`;

/** Row primary name — same weight as category / family list names. */
export const adminListNameClass =
  "block max-w-full truncate text-left text-sm font-medium text-slate-900 hover:text-slate-700";


export const adminListDragHandleClass =
  "inline-flex h-9 w-9 cursor-grab touch-none items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40";

export const adminListCheckboxClass = "h-4 w-4 rounded border-slate-300 accent-emerald-600";

/** Field icon column (order custom fields). */
export const adminListIconColWidth = "80px";
export const adminListIconCellClass = "px-2 py-0 align-middle text-center";
export const adminListIconInnerClass = "flex min-h-[3.5rem] w-full items-center justify-center";
export const adminFieldIconImageClass =
  "block h-8 w-8 max-h-8 max-w-8 shrink-0 object-contain object-center";
export const adminFieldIconLucideClass = "block h-8 w-8 max-h-8 max-w-8 shrink-0 text-slate-700";
export const adminFieldIconMissingClass = "text-sm text-slate-400";
