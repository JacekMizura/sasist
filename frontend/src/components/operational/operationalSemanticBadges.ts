/**
 * Unified badge semantics for operational lists (success / info / warning / danger / neutral).
 *
 * Geometry matches design-system `StatusBadge` (default density): rounded-md, text-xs, px-2 py-0.5.
 * Prefer `<StatusBadge tone=…>` for new ERP/admin UI; these class strings remain for dense list cells.
 */
import { radius } from "../../design-system/tokens/radius";

export const operationalBadgeBase =
  `inline-flex max-w-full min-w-0 items-center justify-center ${radius.sm} px-2 py-0.5 text-xs font-semibold leading-none border`;

export const operationalBadgeSuccessClass = `${operationalBadgeBase} border-emerald-200/90 bg-emerald-50 text-emerald-900`;

export const operationalBadgeInfoClass = `${operationalBadgeBase} border-sky-200/90 bg-sky-50 text-sky-900`;

/** Orange — active user work (e.g. „W realizacji”). */
export const operationalBadgePrimaryClass = `${operationalBadgeBase} border-orange-200/90 bg-orange-50 text-orange-900`;

export const operationalBadgeWarningClass = `${operationalBadgeBase} border-amber-200/90 bg-amber-50 text-amber-950`;

export const operationalBadgeDangerClass = `${operationalBadgeBase} border-red-200/90 bg-red-50 text-red-900`;

export const operationalBadgeNeutralClass = `${operationalBadgeBase} border-slate-200/90 bg-slate-100 text-slate-700`;
