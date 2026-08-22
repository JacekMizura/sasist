/**
 * Specialized automation workflow UI tokens — lanes, groups, launch tiles, editor chrome.
 *
 * Ordinary form primitives (Input, Select, PrimaryButton, …) live in @/design-system Form SSOT.
 * List table chrome uses moduleList* + OperationalAction* (Phase B).
 */

/** Linia warunku / szczegółu efektu na liście (AutomationRuleDisplay). */
export const oaListLogicLineClass = "text-sm leading-snug text-slate-800";

/** Nagłówek grupy — sticky, wyraźny kontrast */
export const oaWorkflowGroupHeaderClass =
  "group/header sticky top-0 z-20 flex w-full items-center gap-3 border-b border-slate-300 bg-white px-4 py-3.5 text-left transition hover:bg-white";

/** Sekcja grupy */
export const oaWorkflowGroupSectionClass = "border-b border-slate-200 bg-white last:border-b-0";

export const oaWorkflowBlockBodyClass = "px-4 py-1";

export const oaWorkflowFieldRowClass =
  "grid grid-cols-[minmax(7.5rem,9.5rem)_minmax(0,1fr)] items-center gap-x-4 border-b border-slate-100 py-2.5 last:border-b-0";
export const oaWorkflowFieldLabelClass = "text-sm text-slate-500";

/** Badge JEŚLI / TO w edytorze */
export const oaWorkflowLaneBadgeIfClass =
  "mr-2 inline-flex rounded-md border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-700";
export const oaWorkflowLaneBadgeThenClass =
  "mr-2 inline-flex rounded-md border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-700";

/** Kolumna workflow w edytorze */
export const oaWorkflowLaneClass =
  "flex min-h-full min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm";

/** Duże CTA dodawania w kolumnie Jeśli / To — min. 48px */
export const oaWorkflowAddCtaBase =
  "flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400";
export const oaWorkflowAddCtaCondition = oaWorkflowAddCtaBase;
export const oaWorkflowAddCtaEffect = oaWorkflowAddCtaBase;

/** Strzałka przepływu między kolumnami */
export const oaWorkflowFlowArrowClass =
  "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm lg:h-14 lg:w-14";

/** Karta nagłówka edytora (nazwa / grupa / akcje) */
export const oaEditorHeaderCardClass =
  "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";

/** Kafel wyboru trybu uruchamiania */
export const oaLaunchTileClass = (selected: boolean) =>
  selected
    ? "relative flex w-full cursor-pointer items-start gap-3 rounded-xl border-2 border-orange-500 bg-orange-50/60 px-4 py-4 text-left transition"
    : "relative flex w-full cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:border-slate-300";
