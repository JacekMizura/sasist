/**
 * Global Layout System 2.0 — page shell tokens.
 * One white container holds header + tabs + toolbar + content.
 */

/** Outer gutter around the page card (app canvas). */
export const pageShellGutterClass = "w-full min-w-0 p-4 md:p-6";

/** Single white page surface — one border, one radius. */
export const pageShellSurfaceClass = "rounded-xl border border-slate-200 bg-white";

/** Canonical inner padding for the page shell (24px). */
export const pageShellPaddingClass = "p-6";

/** Divider under tabs / before main body. */
export const pageShellDividerClass = "border-b border-slate-200";

/**
 * Table / list block inside the page shell — no nested card chrome.
 * Prefer this over `rounded-xl border … bg-white` wrappers.
 */
export const pageShellListBlockClass = "min-w-0 overflow-hidden";

/** Empty / dashed placeholder inside the page shell (not a second card). */
export const pageShellEmptyStateClass =
  "rounded-lg border border-dashed border-slate-200 px-6 py-16 text-center";
