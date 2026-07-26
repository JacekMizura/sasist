/**
 * @deprecated Prefer Sasist UI Kit (`design-system`): Card, Primary/Secondary/Ghost/DangerButton,
 * Input, StatusBadge. Facade kept for Warehouse Materials lists.
 */
import {
  dangerButtonClass,
  ghostButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "../../design-system/components/Button/buttonClasses";
import { cardClassName } from "../../design-system/components/Card";
import { inputClassName } from "../../design-system/components/Input";
import { typography } from "../../design-system/tokens";

export const wmPageSectionTitleClass = typography.section;

export const wmCardClass = cardClassName("section");

export const wmCardRowClass =
  "flex w-full flex-col gap-3 border-b border-slate-100 p-4 text-left last:border-b-0 sm:flex-row sm:items-stretch sm:gap-4 sm:p-5";

export const wmPrimaryBtnClass = primaryButtonClass;
export const wmSecondaryBtnClass = secondaryButtonClass;
export const wmGhostBtnClass = ghostButtonClass;
export const wmDangerBtnClass = dangerButtonClass;

export const wmInputClass = inputClassName("default", "neutral");

export const wmLabelClass = typography.label;

/** Prefer `StatusBadge` / `StatusText` from design-system. */
export const wmStatusActiveClass =
  "inline-flex shrink-0 items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-900 ring-1 ring-emerald-200/90";

export const wmStatusInactiveClass =
  "inline-flex shrink-0 items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200/90";

export const wmTypeBadgeClass =
  "inline-flex max-w-full shrink-0 items-center rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200/80";
