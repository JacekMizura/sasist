/** ERP inventory admin panel — dense WMS-aligned tokens. */

export const erpSurfaceCard = "rounded-lg border border-slate-200/90 bg-white";

export const erpPageShell = "flex w-full flex-col gap-4";

export const erpKpiCard = `${erpSurfaceCard} flex flex-col justify-center p-3`;

export const erpKpiLabel = "mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400";

export const erpKpiValue = "text-xl font-bold tabular-nums text-slate-900";

export const erpSectionCard = `${erpSurfaceCard} flex flex-col overflow-hidden`;

export const erpSectionHeader =
  "border-b border-slate-100 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500";

export const erpTableWrap = `${erpSurfaceCard} overflow-hidden`;

export const erpTableScroll = "overflow-x-auto";

export const erpTable = "w-full text-left text-sm text-slate-700";

export const erpThead = "border-b border-slate-200/90 bg-slate-50/50 text-[10px] font-semibold uppercase tracking-wider text-slate-500";

export const erpTh = "px-4 py-2";

export const erpThActions = "w-10 px-2 py-2 text-center";

export const erpTd = "whitespace-nowrap px-4 py-2";

export const erpTdActions = "px-2 py-2 text-center";

export const erpTr = "transition-colors hover:bg-slate-50/60";

export const erpTbody = "divide-y divide-slate-100/90";

export const erpDocLink = "font-medium text-slate-900 underline-offset-2 transition-colors hover:text-indigo-700 hover:underline";

export const erpSelectCard = (selected: boolean) =>
  `cursor-pointer rounded-lg border p-3 transition-all ${
    selected
      ? "border-indigo-500/80 bg-indigo-50/40 ring-1 ring-indigo-500/30"
      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50"
  }`;

export const erpSelectCardTitle = (selected: boolean) =>
  `mb-0.5 text-sm font-semibold ${selected ? "text-indigo-900" : "text-slate-900"}`;

export const erpSelectCardHint = (selected: boolean) =>
  `text-xs ${selected ? "text-indigo-700/80" : "text-slate-500"}`;

export const erpFieldLabel = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500";

export const erpFieldInput =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300/50";

export const erpWizardStepNav = "mb-6 flex w-full border-b border-slate-200/90";

export const erpWizardStepItem = (active: boolean) =>
  `flex-1 pb-2.5 text-center text-[11px] font-semibold uppercase tracking-wider transition-colors ${
    active ? "border-b-2 border-slate-900 text-slate-900" : "text-slate-400"
  }`;

export const erpWizardFooter = "mt-8 flex items-center justify-between border-t border-slate-200/90 pt-4";

export const erpBtnPrimary =
  "inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-50";

export const erpBtnGhost =
  "rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300";

export const erpScopeBox = "rounded-lg border border-slate-200/90 bg-slate-50/50 p-3";

export const erpTabLink = (active: boolean) =>
  `relative pb-2.5 text-sm font-medium transition-colors ${
    active ? "text-slate-900" : "text-slate-500 hover:text-slate-800"
  }`;

export const erpTabIndicator = "absolute bottom-0 left-0 right-0 h-0.5 bg-slate-900";

/** @deprecated Use erpTable* tokens. */
export const ERP_INV = {
  table: erpTable,
  th: erpTh,
  td: erpTd,
  row: erpTr,
} as const;
