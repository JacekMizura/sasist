/** Shared fleet resource list row — wózki, nośniki, regały (64–72px density). */

export const FLEET_RESOURCE_ROW_HEIGHT_CLASS = "h-[68px] min-h-[68px] max-h-[68px]";

const svg14 =
  "[&_svg]:size-[14px] [&_svg]:max-h-[14px] [&_svg]:max-w-[14px] [&_svg]:shrink-0";

export const fleetResourceActionBtnClass = `inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-none transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400/35 disabled:pointer-events-none disabled:opacity-40 ${svg14}`;

export const fleetResourceActionBtnDangerClass = `inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-200 bg-white text-red-600 shadow-none transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-red-400/30 disabled:pointer-events-none disabled:opacity-40 ${svg14}`;

export const fleetResourceActionBtnWarnClass = `inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-amber-200 bg-white text-amber-800 shadow-none transition hover:border-amber-300 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400/30 disabled:pointer-events-none disabled:opacity-40 ${svg14}`;

export const fleetResourceActionBarClass = "flex shrink-0 flex-row items-center gap-0.5";

export const fleetResourceRowClass = `group relative flex w-full items-center gap-2 ${FLEET_RESOURCE_ROW_HEIGHT_CLASS} px-3 transition-colors hover:bg-slate-50/80`;

export const fleetResourceMetaSepClass = "hidden shrink-0 text-slate-300 sm:inline";

export const fleetResourceMetaItemClass = "hidden shrink-0 text-xs text-slate-600 sm:inline whitespace-nowrap";

export const fleetResourceShowContentBtnClass =
  "shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700";
