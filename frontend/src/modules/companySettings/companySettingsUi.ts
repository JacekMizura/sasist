/** Shared CTA / chrome tokens for Ustawienia → Firma. */

import { brandFocusRingClass } from "../../design-system/brandUi";

export const companySectionTitleClass =
  "flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500";

/** Layout 2.0: section inside PageContainer — no nested white card. */
export const companyCardClass = "min-w-0 overflow-hidden border-t border-slate-100 pt-4 first:border-t-0 first:pt-0";

/** Neutral secondary CTA with brand focus ring (not Primary). */
export const companySecondaryCtaClass = [
  "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50",
  brandFocusRingClass,
].join(" ");
