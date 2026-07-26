/**
 * Layout Master — Szablony lista (Label System SSOT).
 * Document templates must import these — do not redefine gap/padding/grid locally.
 */

/** Outer flex: left rail + main column */
export const TEMPLATES_LIST_ROOT_CLASS = "flex min-h-0 w-full min-w-0 flex-1 gap-0";

/** Inner left rail (types / groups) */
export const TEMPLATES_LIST_SIDEBAR_CLASS =
  "flex w-[260px] shrink-0 flex-col gap-6 border-r border-gray-200 bg-white px-3 py-4 min-[1600px]:w-[280px]";

export const TEMPLATES_LIST_SIDEBAR_SECTION_TITLE_CLASS =
  "mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500";

export const TEMPLATES_LIST_SIDEBAR_LIST_CLASS = "space-y-0.5";

export const TEMPLATES_LIST_SIDEBAR_DIVIDER_CLASS = "my-2 border-t border-gray-100";

export const TEMPLATES_LIST_SIDEBAR_GROUPS_SCROLL_CLASS =
  "min-h-0 flex-1 space-y-0.5 overflow-y-auto [scrollbar-width:thin]";

export const TEMPLATES_LIST_SIDEBAR_FOOTER_CLASS = "mt-3 border-t border-gray-100 pt-3";

/** Main column (toolbar + content) */
export const TEMPLATES_LIST_MAIN_COLUMN_CLASS =
  "flex min-w-0 flex-1 flex-col gap-5 px-4 py-4 md:px-6 min-[1600px]:px-8";

/** Toolbar: title row ↔ filter row */
export const TEMPLATES_LIST_TOOLBAR_CLASS = "space-y-4";

export const TEMPLATES_LIST_TOOLBAR_TITLE_ROW_CLASS =
  "flex flex-nowrap items-center justify-between gap-3";

export const TEMPLATES_LIST_TOOLBAR_TITLE_CLASS =
  "text-xl font-semibold tracking-tight text-slate-900";

export const TEMPLATES_LIST_TOOLBAR_SUBTITLE_CLASS = "mt-0.5 text-sm text-slate-500";

export const TEMPLATES_LIST_TOOLBAR_ACTIONS_CLASS =
  "flex shrink-0 flex-nowrap items-center gap-2";

export const TEMPLATES_LIST_TOOLBAR_FILTERS_ROW_CLASS = "flex flex-wrap items-center gap-3";

export const TEMPLATES_LIST_SEARCH_INPUT_CLASS =
  "min-w-[200px] flex-1 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-300/40 sm:max-w-md";

export const TEMPLATES_LIST_SELECT_CLASS =
  "rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-orange-400";

export const TEMPLATES_LIST_GHOST_BTN_CLASS =
  "rounded-xl border border-transparent px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50";

export const TEMPLATES_LIST_SECONDARY_BTN_CLASS =
  "rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:shadow-md disabled:opacity-50";

export const TEMPLATES_LIST_VIEW_TOGGLE_SHELL_CLASS =
  "inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm";

export const TEMPLATES_LIST_VIEW_TOGGLE_BTN_CLASS =
  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition";

/** Content under toolbar */
export const TEMPLATES_LIST_CONTENT_STACK_CLASS = "flex min-w-0 flex-col gap-4";

export const TEMPLATES_LIST_COUNT_CLASS = "text-sm text-slate-500";

export const TEMPLATES_LIST_EMPTY_CLASS = "py-10 text-slate-500";

export const TEMPLATES_LIST_ROWS_STACK_CLASS = "flex w-full min-w-0 flex-col gap-3";

export const TEMPLATES_LIST_CARD_GRID_CLASS =
  "grid w-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 min-[1600px]:grid-cols-4 min-[1920px]:grid-cols-5";

/** Card chrome in „Karty” view (TemplateGridCard) */
export const TEMPLATES_LIST_GRID_CARD_BASE_CLASS =
  "flex w-full cursor-pointer flex-col overflow-hidden border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md";

export const TEMPLATES_LIST_GRID_CARD_IDLE_CLASS = "border-[#E5E7EB] hover:border-gray-300";

export const TEMPLATES_LIST_GRID_CARD_SELECTED_CLASS = "border-orange-400 ring-2 ring-orange-300/60";

export const TEMPLATES_LIST_GRID_CARD_RADIUS = 16;

export const TEMPLATES_LIST_GRID_CARD_PREVIEW_BAND_CLASS =
  "flex h-32 w-full items-center justify-center overflow-hidden rounded-xl border border-[#E5E7EB] bg-white p-1";

export const TEMPLATES_LIST_GRID_CARD_PREVIEW_WRAP_CLASS =
  "border-b border-[#E5E7EB] bg-white p-3 text-left";

export const TEMPLATES_LIST_GRID_CARD_BODY_CLASS = "flex flex-col gap-2.5 p-3.5";

export const TEMPLATES_LIST_PAGER_CLASS = "flex items-center justify-center gap-2 pt-2";

export const TEMPLATES_LIST_PAGER_BTN_CLASS =
  "rounded-xl border border-gray-200 px-3 py-1.5 text-sm disabled:opacity-50";

/** Module PageLayout card (LabelListQueueShell) */
export const TEMPLATES_MODULE_PAGE_CARD_CLASS = "min-h-[60vh] min-w-0";
