/**
 * Typography roles — Sasist UI Kit.
 *
 * Standard measured from Documents module (DocumentsSectionShell + list tables):
 * page title text-lg / subtitle text-sm leading-relaxed slate-600 /
 * section text-xs font-bold uppercase slate-500 / body text-sm slate-800 /
 * meta text-xs|11px slate-500 (not slate-400 for content).
 */

export const typography = {
  /** Page title — DocumentsSectionShell h2. */
  h1: "text-lg font-semibold tracking-tight text-slate-900",
  /** Subsection / panel title — warehouse document detail scale. */
  h2: "text-base font-semibold tracking-tight text-slate-900",
  /** Uppercase section label — Documents content panels. */
  section: "text-xs font-bold uppercase tracking-wide text-slate-500",
  /** Form label — DocumentSeriesEditPage. */
  label: "text-xs font-medium text-slate-600",
  /** Secondary meta / captions — Documents list meta (not chrome). */
  caption: "text-[11px] leading-snug text-slate-500",
  /** Page subtitle under title. */
  pageDesc: "text-sm leading-relaxed text-slate-600",
  /** KPI value — DocumentsKpiRow. */
  metric: "text-xl font-semibold leading-none tracking-tight text-slate-900 tabular-nums",
  metricUnit: "text-sm font-medium text-slate-500",
  /** KPI label — DocumentsKpiRow. */
  kpiLabel: "text-xs font-medium text-slate-500",
  /** Primary body / table cells. */
  body: "text-sm text-slate-800",
  bodyStrong: "text-sm font-semibold text-slate-900",
  bodyMuted: "text-sm text-slate-600",
  /** List table header — sales/correcting Documents tables. */
  tableHead: "text-[11px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs",
  control: "text-sm font-semibold",
  controlDense: "text-[13px] font-medium leading-tight",
  /** Smallest control text — still Documents-readable (text-xs, not 10px). */
  controlMicro: "text-xs font-medium leading-none",
} as const;
