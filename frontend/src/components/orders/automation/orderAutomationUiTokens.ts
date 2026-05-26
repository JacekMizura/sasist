/**
 * Visual system: connected workspace, minimal box borders, soft layers (automation module).
 */
/** Controls — compact height (36px) */
export const oaInp =
  "h-9 w-full min-w-0 rounded-lg border-0 bg-white px-2.5 text-[13px] leading-snug text-slate-900 shadow-[inset_0_0_0_1px_rgb(226,232,240)] outline-none transition placeholder:text-slate-400 hover:shadow-[inset_0_0_0_1px_rgb(203,213,225)] focus:shadow-[inset_0_0_0_2px_rgb(148,163,184)] focus:ring-0";
/** Dense rows (automation builder tables) */
export const oaInpDense =
  "h-8 w-full min-w-0 rounded border-0 bg-white px-2 text-[13px] font-medium leading-tight text-slate-900 shadow-[inset_0_0_0_1px_rgb(203,213,225)] outline-none transition placeholder:text-slate-400 focus:shadow-[inset_0_0_0_2px_rgb(100,116,139)] focus:ring-0";
export const oaSel = `${oaInp} cursor-pointer appearance-none bg-white pr-9`;
/** Field labels — hierarchy via tone, not shouting */
export const oaLbl = "mb-0.5 block text-[11px] font-semibold text-slate-600";
/** Table header in builder */
export const oaTableTh = "border-b border-slate-200 bg-slate-100 px-1.5 py-1 text-left text-[11px] font-bold uppercase tracking-wide text-slate-800";
export const oaTableTd = "border-b border-slate-100 px-1.5 py-1 align-middle text-[13px] text-slate-900";
/** Secondary / neutral actions */
export const oaBtn =
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border-0 bg-slate-100 px-3.5 text-sm font-medium text-slate-800 shadow-none transition hover:bg-slate-200/90 active:bg-slate-200";
export const oaBtnPri =
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 active:bg-slate-950";
/** Inline add / low-emphasis */
export const oaBtnGhost =
  "inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300/90 bg-transparent text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:bg-slate-100/50 hover:text-slate-900";
/** Destructive outline */
export const oaBtnDanger =
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border-0 bg-red-50 px-3 text-sm font-medium text-red-800 transition hover:bg-red-100/90";
/** Icon-only remove in workflow rows */
export const oaIconGhost =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-200/50 hover:text-slate-700";

/** Automation builder — flat panel, not dashboard card */
export const oaWorkflowShell =
  "overflow-hidden rounded-md border border-slate-200/90 bg-white shadow-sm";
/** Section title inside workflow shell */
export const oaSectionHead = "px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-800";
/** Subtle separator inside shell */
export const oaSectionRule = "h-px bg-slate-200";

/** Table list view */
export const oaTh = "px-4 py-2.5 text-left text-xs font-medium text-slate-500";
export const oaTd = "px-4 py-3 align-top text-sm leading-snug text-slate-900";
export const oaChip =
  "inline-flex max-w-full items-center rounded-md bg-slate-100/90 px-2 py-1 text-xs font-medium leading-snug text-slate-800 ring-1 ring-slate-900/[0.04]";

export const oaWorkspaceMax = "mx-auto w-full max-w-[min(100%,1920px)]";
export const oaWorkspacePad = "px-4 sm:px-6 lg:px-10 xl:px-12";
export const oaWorkspacePadNeg = "-mx-4 sm:-mx-6 lg:-mx-10 xl:-mx-12";
