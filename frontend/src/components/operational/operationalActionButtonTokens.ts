/**
 * Operational row actions — aligned with **Orders list** density:
 * **40×40** targets, **16px** icons, tight gaps, fixed column width.
 */

const svg16 =
  "[&_svg]:size-[16px] [&_svg]:max-h-[16px] [&_svg]:max-w-[16px] [&_svg]:shrink-0";

export const operationalActionButtonClass = `inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-none transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400/35 disabled:pointer-events-none disabled:opacity-40 ${svg16}`;

export const operationalActionButtonDangerClass = `inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 shadow-none transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400/30 disabled:pointer-events-none disabled:opacity-40 ${svg16}`;

/** Highlighted control (e.g. „nowe zamówienie”). */
export const operationalActionButtonAccentClass = `inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-sky-800 shadow-none transition hover:border-sky-300 hover:bg-sky-100 hover:text-sky-950 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-400/30 disabled:pointer-events-none disabled:opacity-40 ${svg16}`;

/** Two 40px buttons + `gap-x-2` + `!px-1` cell padding → **6rem** total. */
export const operationalActionsColumnWidthClass = "w-24 min-w-24 max-w-24";

/** Grid placeholder — matches hit target size (balances incomplete rows). */
export const operationalActionEmptySlotClass = "h-10 w-10 shrink-0 p-0";

/** Horizontal center, **top** anchor inside the `<td>`. */
export const operationalActionColumnInnerClass = "flex w-full min-w-0 flex-col items-center justify-start";

/** ≤3 actions: dense vertical stack (Orders-style rhythm). */
export const operationalActionColumnStackClass = "flex flex-col gap-1 items-center justify-start";

/** >3 actions: two columns, row-major; horizontal gap `gap-2`, tighter vertical `gap-y-1`. */
export const operationalActionColumnGridClass =
  "grid w-full grid-cols-2 gap-x-2 gap-y-1 justify-items-center auto-rows-auto";

/** @deprecated Use {@link operationalActionColumnGridClass}. */
export const operationalActionGridClass = operationalActionColumnGridClass;
