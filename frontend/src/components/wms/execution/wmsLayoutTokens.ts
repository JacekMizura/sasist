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

/** Top module strip — dark navy (not pure black). */
export const WMS_TOP_NAV_SHELL =
  "shrink-0 border-b border-slate-700 bg-gradient-to-r from-slate-800 via-slate-800 to-slate-900 text-white";

/** Global operational context bar — WMS purple/navy, lighter than top nav. */
export const WMS_WORKFLOW_BAR_SHELL =
  "shrink-0 border-b border-indigo-500/40 bg-gradient-to-r from-indigo-800 via-indigo-700 to-violet-800 text-white shadow-sm";
