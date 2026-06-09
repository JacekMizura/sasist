/** ERP inventory admin panel — visual tokens aligned with inventory mockup. */

export const erpSurfaceCard =
  "rounded-xl border border-slate-200 bg-white shadow-sm";

export const erpPageShell = "flex w-full flex-col gap-6";

export const erpKpiCard = `${erpSurfaceCard} flex flex-col justify-center p-4`;

export const erpKpiLabel = "mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500";

export const erpKpiValue = "text-2xl font-bold tabular-nums text-slate-900";

export const erpSectionCard = `${erpSurfaceCard} flex flex-col overflow-hidden`;

export const erpSectionHeader =
  "border-b border-slate-100 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500";

export const erpTableWrap = `${erpSurfaceCard} overflow-hidden`;

export const erpTableScroll = "overflow-x-auto";

export const erpTable = "w-full text-left text-sm text-slate-600";

export const erpThead = "border-b border-slate-200 bg-slate-50/80 text-[10px] font-semibold uppercase tracking-wider text-slate-500";

export const erpTh = "px-6 py-3";

export const erpThActions = "w-12 px-4 py-3 text-center";

export const erpTd = "whitespace-nowrap px-6 py-3";

export const erpTdActions = "px-4 py-3 text-center";

export const erpTr = "transition-colors hover:bg-slate-50/50";

export const erpTbody = "divide-y divide-slate-100";

export const erpDocLink = "font-medium text-indigo-600 transition-colors hover:text-indigo-800";

export const erpSelectCard = (selected: boolean) =>
  `cursor-pointer rounded-xl border-2 p-4 transition-all ${
    selected
      ? "border-indigo-600 bg-indigo-50/30 shadow-sm ring-1 ring-indigo-600"
      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
  }`;

export const erpSelectCardTitle = (selected: boolean) =>
  `mb-1 text-sm font-semibold ${selected ? "text-indigo-900" : "text-slate-900"}`;

export const erpSelectCardHint = (selected: boolean) =>
  `text-xs ${selected ? "text-indigo-700/80" : "text-slate-500"}`;

export const erpFieldLabel = "mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500";

export const erpFieldInput =
  "w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-indigo-500";

export const erpWizardStepNav = "mb-8 flex w-full border-b border-slate-200";

export const erpWizardStepItem = (active: boolean) =>
  `flex-1 pb-3 text-center text-xs font-semibold uppercase tracking-wider transition-colors ${
    active ? "border-b-2 border-orange-500 text-orange-500" : "text-slate-400"
  }`;

export const erpWizardFooter = "mt-12 flex items-center justify-between border-t border-slate-200 pt-6";

export const erpBtnPrimary =
  "inline-flex items-center gap-2 rounded-lg bg-slate-900 px-6 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800 disabled:opacity-50";

export const erpBtnGhost =
  "rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300";

export const erpScopeBox = "rounded-lg border border-emerald-100 bg-emerald-50/50 p-4";

export const erpTabLink = (active: boolean) =>
  `relative pb-3 text-sm font-medium transition-colors ${
    active ? "text-indigo-600" : "text-slate-500 hover:text-slate-800"
  }`;

export const erpTabIndicator = "absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600";

/** @deprecated Use erpTable* tokens. */
export const ERP_INV = {
  table: erpTable,
  th: erpTh,
  td: erpTd,
  row: erpTr,
} as const;
