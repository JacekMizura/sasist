import {
  listSellasistTableBodyCellGrid,
  listSellasistTableHeaderCellGrid,
} from "../listPage/listSellasistTokens";
import { operationalActionsColumnWidthClass } from "../operational/operationalActionButtonTokens";

/** Dense panel lists (Orders / Returns / Complaints): table header cell — match OrderListDenseTable. */
export const panelListDenseThBase = `${listSellasistTableHeaderCellGrid} !border-slate-200 !bg-slate-50 !py-1.5 !text-xs !font-semibold !uppercase !tracking-wide !text-slate-500`;

/** Body cell: Orders row density + typography baseline. */
export const panelListDenseTdBase = `${listSellasistTableBodyCellGrid} !border-slate-200 px-3 py-1.5 text-sm leading-tight align-middle`;

export const panelListDenseThSort = `${panelListDenseThBase} cursor-pointer select-none hover:bg-slate-100`;

/**
 * @deprecated Dla list magazynowych (zamówienia itd.) użyj {@link listSellasistRowActionBtn} z `listSellasistTokens` —
 * ten token zostaje dla starszych miejsc, które jeszcze nie zostały zmigrowane.
 */
export const panelListDenseRowActionBtn =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 hover:bg-gray-100";

export const panelListDenseCheckboxHeaderClass = `${panelListDenseThBase} sticky left-0 top-0 z-[30] w-12 min-w-[3rem] bg-slate-50 text-center`;

export const panelListDenseCheckboxCellClass = `${panelListDenseTdBase} sticky left-0 z-[25] bg-white !align-middle group-hover:bg-slate-50`;

/**
 * Lista zamówień — kolumna 1: tylko checkbox + pasek priorytetu (jak pierwsza kolumna `ProductList`: `w-12`, sticky `left-0`).
 */
export const panelListDenseOrderCheckboxHeaderClass = `${panelListDenseThBase} sticky left-0 top-0 z-[30] w-12 min-w-[3rem] bg-slate-50 !px-1 !py-2 text-center shadow-[4px_0_12px_-4px_rgba(15,23,42,0.12)]`;

export const panelListDenseOrderCheckboxCellClass = `${panelListDenseTdBase} sticky left-0 z-[25] w-12 min-w-[3rem] !px-1 py-1.5 !align-middle bg-white group-hover:bg-slate-50 shadow-[4px_0_10px_-4px_rgba(15,23,42,0.08)]`;

/**
 * Lista zamówień — kolumna akcji (sticky `left-12`). Szerokość zsynchronizowana z `OperationalActionColumn`.
 */
export const panelListDenseOrderActionsHeaderClass = `${panelListDenseThBase} sticky left-12 top-0 z-[29] ${operationalActionsColumnWidthClass} bg-slate-50 !px-1 !py-1.5 text-center align-top shadow-[4px_0_12px_-4px_rgba(15,23,42,0.1)]`;

export const panelListDenseOrderActionsCellClass = `${panelListDenseTdBase} sticky left-12 z-[24] ${operationalActionsColumnWidthClass} bg-white !px-1 !py-1 !align-top group-hover:bg-slate-50 shadow-[4px_0_10px_-4px_rgba(15,23,42,0.08)]`;

export const panelListDenseActionsHeaderClass = `${panelListDenseThBase} sticky left-12 top-0 z-[29] ${operationalActionsColumnWidthClass} bg-slate-50 text-center align-top`;

export const panelListDenseActionsCellClass = `${panelListDenseTdBase} sticky left-12 z-[24] ${operationalActionsColumnWidthClass} bg-white !px-1 !py-1 !align-top group-hover:bg-slate-50`;

/**
 * Actions as the first column when there is no checkbox column (flush sticky left).
 * Same footprint as `panelListDenseActionsHeaderClass` but `left-0` instead of `left-12`.
 */
export const panelListDenseActionsOnlyHeaderClass = `${panelListDenseThBase} sticky left-0 top-0 z-[29] ${operationalActionsColumnWidthClass} bg-slate-50 text-center align-top`;

export const panelListDenseActionsOnlyCellClass = `${panelListDenseTdBase} sticky left-0 z-[24] ${operationalActionsColumnWidthClass} bg-white !px-1 !py-1 !align-top group-hover:bg-slate-50`;

/** @deprecated Same footprint as `panelListDenseActionsOnlyHeaderClass` — prefer Only tokens + `OperationalActionColumn`. */
export const panelListDenseActionsWideHeaderClass = panelListDenseActionsOnlyHeaderClass;

/** @deprecated Same footprint as {@link panelListDenseActionsOnlyCellClass}. */
export const panelListDenseActionsWideCellClass = panelListDenseActionsOnlyCellClass;

export const panelListDenseTableScrollWrapClass = "min-w-0 overflow-x-auto overscroll-x-contain";

export const panelListDenseTableClass = "w-max min-w-full border-collapse border-t border-slate-200 text-left";

export const panelListDenseTheadClass = "sticky top-0 z-[20] bg-slate-50";

export const panelListDenseRowClass =
  "group cursor-pointer border-b border-slate-200 transition-colors hover:bg-slate-50 [&>td]:align-middle";

export const panelListDenseRowSelectedClass = "bg-sky-50/50";

export const panelListDenseCheckboxInputClass = "h-4 w-4 rounded border-slate-300 text-slate-800";
