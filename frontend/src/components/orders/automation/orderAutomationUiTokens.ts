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
