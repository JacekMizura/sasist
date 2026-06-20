/**
 * Flat ERP tokens for automation module — aligned with Orders / Returns lists.
 */
export const oaInp =
  "h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-300/35";
export const oaInpDense =
  "h-8 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-300/35";
export const oaSel = `${oaInp} cursor-pointer appearance-none pr-9`;
export const oaLbl = "block text-xs font-medium text-slate-600";

export const oaBtn =
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 transition hover:bg-slate-50";
export const oaBtnPri =
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50";
export const oaBtnGhost =
  "inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-transparent text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900";
export const oaBtnDanger =
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 text-sm font-medium text-red-700 transition hover:bg-red-50";
export const oaIconGhost =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700";

/** Toggle chip for triggers / filters */
export const oaToggleChip = (active: boolean) =>
  active
    ? "inline-flex items-center gap-2 rounded-lg border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white"
    : "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50";

export const oaChip =
  "inline-flex max-w-full items-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-700";

/** @deprecated use moduleSettingsPageShellClass */
export const oaWorkspaceMax = "w-full max-w-[87.5rem]";
/** @deprecated padding from PageLayout */
export const oaWorkspacePad = "";
export const oaWorkspacePadNeg = "";

/** Workflow block (Jeśli → To) — czytelna karta warunku / akcji. */
export const oaWorkflowBlockClass = "rounded-lg border border-gray-200 bg-white";
export const oaWorkflowBlockHeaderClass =
  "flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3";
export const oaWorkflowBlockTitleClass = "min-w-0 text-sm font-semibold leading-snug text-slate-900";
export const oaWorkflowBlockBodyClass = "px-4 py-1";
export const oaWorkflowFieldRowClass =
  "grid grid-cols-[minmax(7.5rem,9.5rem)_minmax(0,1fr)] items-center gap-x-4 border-b border-gray-100 py-2.5 last:border-b-0";
export const oaWorkflowFieldLabelClass = "text-sm text-slate-500";

/** Zwarta karta podsumowania w workflow builderze — klikalna, akcje na hover. */
export const oaWorkflowCardClass =
  "group/card relative flex w-full min-h-11 cursor-pointer items-center rounded-xl border-2 border-slate-200 bg-white px-4 py-2.5 text-left shadow-sm transition hover:border-slate-400 hover:bg-slate-50/50 hover:shadow-md";
export const oaWorkflowCardTitleClass = "min-w-0 flex-1 truncate pr-16 text-sm font-semibold text-slate-900";
export const oaWorkflowCardActionsClass =
  "absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-lg bg-white/95 p-0.5 opacity-0 shadow-sm ring-1 ring-slate-200/80 transition group-hover/card:opacity-100";

/** Duże CTA dodawania w kolumnie Jeśli / To */
export const oaWorkflowAddCtaBase =
  "flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-white px-4 py-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
export const oaWorkflowAddCtaCondition =
  `${oaWorkflowAddCtaBase} border-sky-300 text-sky-800 hover:border-sky-400 hover:bg-sky-50 focus-visible:outline-sky-400`;
export const oaWorkflowAddCtaEffect =
  `${oaWorkflowAddCtaBase} border-emerald-300 text-emerald-800 hover:border-emerald-400 hover:bg-emerald-50 focus-visible:outline-emerald-400`;

/** @deprecated use oaWorkflowCardClass */
export const oaWorkflowSummaryCardClass = oaWorkflowCardClass;
