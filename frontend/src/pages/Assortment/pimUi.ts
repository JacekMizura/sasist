/**
 * Shared visual tokens for Assortment Product Management (SASIST PIM).
 * Prefer design-system Form / Card / IconButton / typography where possible.
 */

import { cardClassName, formLabelClass } from "../../design-system";

/** @deprecated Prefer `FormSection` from design-system. */
export const pimPanelClass = cardClassName("section");

export const pimPanelIdentityClass =
  "mb-6 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-50/80 p-4 shadow-sm sm:p-5";

/** @deprecated Prefer `FormLabel` / `FormField` from design-system. */
export const pimFieldLabelClass = `mb-1.5 block ${formLabelClass}`;

export const pimIconBadgeClass =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-white";

export const pimIconBadgeMutedClass =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600";

/** @deprecated Prefer design-system `Card` variant `listTile`. */
export const pimCardHoverClass =
  "flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md";

export const pimStatTileClass = "rounded-lg bg-slate-50 px-3 py-2";

/** @deprecated Prefer `FormSection` description or `FormHelperText`. */
export const pimHintClass = "mt-1 text-xs text-slate-500";
