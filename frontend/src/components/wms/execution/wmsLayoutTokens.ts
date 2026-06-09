/** Centralized z-index map for WMS execution UI. */
export const WMS_Z = {
  workflowBar: 90,
  topNav: 100,
  dropdown: 500,
  modal: 1000,
  scanFlash: 200,
} as const;

/** Shared responsive container for operational pages. */
export const WMS_OPERATIONAL_CONTAINER = "mx-auto w-full max-w-5xl px-4 sm:px-6";

/** Wide left-aligned terminal shell — launcher / Braki / Produkcja. */
export const WMS_TERMINAL_SHELL = "w-full px-6 py-4 xl:px-8";

/** Inner max width for readability without centering content column. */
export const WMS_TERMINAL_INNER = "w-full max-w-[1600px]";

export const WMS_TERMINAL_STACK = "flex w-full flex-col items-start gap-5";

/** Operational task card grid — Braki, Produkcja, Inwentaryzacja. */
export const WMS_TASK_GRID =
  "grid w-full grid-cols-1 gap-4 md:gap-5 xl:grid-cols-2 2xl:grid-cols-3";

/** Base task card — subtle border, left accent via child strip. */
export const WMS_TASK_CARD =
  "group relative flex min-h-[220px] w-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:border-slate-300 hover:shadow-md active:scale-[0.995]";

export const WMS_TERMINAL_LABEL =
  "text-[11px] font-bold uppercase tracking-widest text-slate-400";

export const WMS_TERMINAL_SECTION_TITLE = "text-lg font-bold text-slate-900 md:text-xl";

/** Top module strip — dark navy (not pure black). */
export const WMS_TOP_NAV_SHELL =
  "shrink-0 border-b border-slate-700 bg-gradient-to-r from-slate-800 via-slate-800 to-slate-900 text-white";

/** Global operational context bar — light industrial, same language as page headers. */
export const WMS_WORKFLOW_BAR_SHELL =
  "shrink-0 border-b border-slate-200 bg-white text-slate-900";
