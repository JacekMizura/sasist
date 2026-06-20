/**
 * Flat ERP tokens for automation module — white-first, minimal gray fills.
 */
export const oaInp =
  "h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-300/35";
/** Pole wyszukiwania z ikoną lupy po lewej — bez px-3, żeby pl-10 nie kolidowało. */
export const oaSearchInp =
  "h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white py-0 pl-10 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-300/35";
export const oaInpDense =
  "h-8 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-300/35";
export const oaSel =
  "h-9 min-w-[12rem] shrink-0 cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white py-0 pl-3 pr-8 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-300/35";
export const oaLbl = "block text-xs font-medium text-slate-600";

export const oaBtn =
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 transition hover:border-slate-300";
export const oaBtnPri =
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50";
export const oaBtnGhost =
  "inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900";
export const oaBtnDanger =
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 text-sm font-medium text-red-700 transition hover:bg-red-50";
export const oaIconGhost =
  "inline-flex h-9 w-9 min-h-9 min-w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:border hover:border-slate-200 hover:text-slate-800";

/** Przycisk akcji w wierszu listy — min. 36×36 px. */
export const oaRowActionBtn =
  "inline-flex h-9 w-9 min-h-9 min-w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-900";
export const oaRowActionBtnDanger =
  `${oaRowActionBtn} text-red-600 hover:border-red-200 hover:text-red-700`;

/** Toggle chip for triggers / filters */
export const oaToggleChip = (active: boolean) =>
  active
    ? "inline-flex items-center gap-2 rounded-lg border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white"
    : "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300";

export const oaChip =
  "inline-flex max-w-full items-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-700";

/** Chip warunku / efektu na liście workflow */
export const oaWorkflowChipClass =
  "inline-block max-w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs leading-snug text-slate-700 shadow-sm";

/** Kompaktowy chip w tabeli listy automatyzacji */
export const oaListChipClass =
  "inline-flex max-w-full items-center rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] leading-tight text-slate-700";

/** Komórki tabeli listy automatyzacji — wiersz 90–120px */
export const oaListThClass =
  "whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
export const oaListThSortClass = `${oaListThClass} cursor-pointer select-none hover:text-slate-800`;
export const oaListTdClass = "px-4 py-4 align-top text-sm leading-relaxed text-slate-800";
export const oaListRowClass =
  "group border-b border-slate-100 transition-colors hover:bg-slate-50/40 last:border-b-0 [&>td]:min-h-[5.75rem]";
export const oaListTableClass = "w-full min-w-[1180px] table-fixed text-left text-sm";

/** Badge ORAZ / LUB między warunkami na liście */
export const oaListJoinBadgeClass =
  "inline-flex rounded border border-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500";

/** Linia warunku / szczegółu efektu na liście */
export const oaListLogicLineClass = "text-sm leading-snug text-slate-800";
export const oaListLogicSublineClass = "text-sm leading-snug text-slate-600";

/** Nagłówek grupy — sticky, wyraźny kontrast */
export const oaWorkflowGroupHeaderClass =
  "group/header sticky top-0 z-20 flex w-full items-center gap-3 border-b border-slate-300 bg-white px-4 py-3.5 text-left transition hover:bg-white";

/** Sekcja grupy */
export const oaWorkflowGroupSectionClass = "border-b border-slate-200 bg-white last:border-b-0";

/** @deprecated use moduleSettingsPageShellClass */
export const oaWorkspaceMax = "w-full max-w-[87.5rem]";
/** @deprecated padding from PageLayout */
export const oaWorkspacePad = "";
export const oaWorkspacePadNeg = "";

/** Workflow block (Jeśli → To) — czytelna karta warunku / akcji. */
export const oaWorkflowBlockClass = "rounded-lg border border-slate-200 bg-white";
export const oaWorkflowBlockHeaderClass =
  "flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3";
export const oaWorkflowBlockTitleClass = "min-w-0 text-sm font-semibold leading-snug text-slate-900";
export const oaWorkflowBlockBodyClass = "px-4 py-1";
export const oaWorkflowFieldRowClass =
  "grid grid-cols-[minmax(7.5rem,9.5rem)_minmax(0,1fr)] items-center gap-x-4 border-b border-slate-100 py-2.5 last:border-b-0";
export const oaWorkflowFieldLabelClass = "text-sm text-slate-500";

/** Badge JEŚLI / TO w edytorze */
export const oaWorkflowLaneBadgeClass =
  "mr-2 inline-flex rounded border border-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700";

/** Kolumna workflow w edytorze */
export const oaWorkflowLaneClass = "flex min-h-full min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4";

/** Zwarta karta podsumowania w workflow builderze — klikalna, akcje na hover. */
export const oaWorkflowCardClass =
  "group/card relative flex w-full min-h-12 cursor-pointer items-center rounded-lg border-2 border-slate-200 bg-white px-4 py-3 text-left transition hover:border-slate-400";
export const oaWorkflowCardTitleClass = "min-w-0 flex-1 truncate pr-16 text-sm font-medium text-slate-900";
export const oaWorkflowCardActionsClass =
  "absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 opacity-0 transition group-hover/card:opacity-100";

/** Duże CTA dodawania w kolumnie Jeśli / To — min. 48px */
export const oaWorkflowAddCtaBase =
  "flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400";
export const oaWorkflowAddCtaCondition = oaWorkflowAddCtaBase;
export const oaWorkflowAddCtaEffect = oaWorkflowAddCtaBase;

/** Strzałka przepływu między kolumnami */
export const oaWorkflowFlowArrowClass =
  "flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-slate-200 bg-white lg:h-16 lg:w-16";

/** @deprecated use oaWorkflowCardClass */
export const oaWorkflowSummaryCardClass = oaWorkflowCardClass;
