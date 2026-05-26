/**
 * Unified badge semantics for operational lists (success / info / warning / danger / neutral).
 * Use these instead of one-off color mixes so status reads consistently across modules.
 */
export const operationalBadgeBase =
  "inline-flex max-w-full min-w-0 items-center justify-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none";

export const operationalBadgeSuccessClass = `${operationalBadgeBase} border-emerald-200/90 bg-emerald-50 text-emerald-900`;

export const operationalBadgeInfoClass = `${operationalBadgeBase} border-sky-200/90 bg-sky-50 text-sky-900`;

export const operationalBadgeWarningClass = `${operationalBadgeBase} border-amber-200/90 bg-amber-50 text-amber-950`;

export const operationalBadgeDangerClass = `${operationalBadgeBase} border-red-200/90 bg-red-50 text-red-900`;

export const operationalBadgeNeutralClass = `${operationalBadgeBase} border-slate-200/90 bg-slate-100 text-slate-700`;
