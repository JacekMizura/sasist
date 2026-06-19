/**
 * Dense list / CRUD styling inspired by Sellasist-style admin UIs (products benchmark).
 * Use for product list first; other modules can import the same tokens later.
 */

/** Comfortable control height for ERP-style lists */
export const listSellasistControlH = "h-10";

export const listSellasistInputClass = `${listSellasistControlH} w-full rounded-md border border-slate-200/95 bg-white px-3 text-sm font-normal leading-tight text-slate-900 shadow-none placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300/35`;

export const listSellasistLabelClass =
  "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";

/** 4–6 fields per row on wide screens */
export const listSellasistFilterGridClass =
  "grid grid-cols-1 gap-x-2 gap-y-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6";

/** Products benchmark: at most 4 filter controls per row (no overstretched single row). */
export const listSellasistFilterGridClass4 =
  "grid grid-cols-1 gap-x-2 gap-y-2 sm:grid-cols-2 lg:grid-cols-4";

export const listSellasistTableHeaderCellClass =
  "whitespace-nowrap border-b border-slate-200/90 bg-slate-50/95 px-2 py-1.5 text-left align-middle text-[10px] font-semibold uppercase tracking-wide text-slate-500";

export const listSellasistTableBodyCellClass =
  "border-b border-slate-100 px-2 py-1.5 align-top text-[12px] leading-snug text-slate-800";

export const listSellasistTableBodyCellClassDense =
  "border-b border-slate-200/80 px-2 py-1 align-top text-[12px] leading-tight text-slate-800";

export const listSellasistTableHeaderCellClassDense =
  "whitespace-nowrap border-b border-slate-200/90 bg-slate-50/95 px-2 py-1 align-middle text-[10px] font-semibold uppercase tracking-wide text-slate-500";

/** Products list: readable ERP-style headers (not microscopic). */
export const listSellasistTableHeaderCellGrid =
  "border-b border-slate-200/20 px-3 py-2.5 align-middle text-sm leading-normal text-slate-800";

/** Body cells: comfortable padding + default readable size (overridable per cell). */
export const listSellasistTableBodyCellGrid =
  "border-b border-slate-200/40 px-3 py-2.5 align-middle text-sm leading-normal text-slate-800";

export const listSellasistIconBtn =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[5px] border border-slate-200/90 bg-white text-slate-600 shadow-none transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400/40";

/** Row actions — unified with `OperationalActionButton` / `operationalActionButtonTokens`. */
export {
  operationalActionButtonClass as listSellasistRowActionBtn,
  operationalActionButtonDangerClass as listSellasistRowActionBtnDanger,
} from "../operational/operationalActionButtonTokens";

export const listSellasistIconBtnDanger =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[5px] border border-red-200/90 bg-white text-red-600 shadow-none transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400/35";

export const listSellasistBreadcrumbClass = "text-[11px] font-medium text-slate-400 hover:text-slate-600";

export const listSellasistPageTitleClass = "text-xl font-semibold tracking-tight text-slate-800 sm:text-2xl";

/** Products list page title — modern ERP scale. */
export const listSellasistProductListTitleClass =
  "text-lg font-semibold leading-snug tracking-tight text-slate-900 sm:text-xl";

export const listSellasistUtilityIconBtn =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[5px] border border-slate-200/90 bg-white text-slate-600 shadow-none transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400/35";

/** Top toolbar — readable control height. */
export const listSellasistToolbarToggleBtn =
  "inline-flex h-10 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-none transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/30";

export const listSellasistToolbarSquareBtn =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-none transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/30";

/** „Dodaj” next to list title. */
export const listSellasistTitleAddBtn =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-none transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/30";

/** Orders / Returns panel status sidebar @ lg — mockup v3 (~312px). */
export const panelListStatusSidebarWidthLg = "lg:w-[18rem]";
