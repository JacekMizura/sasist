/**
 * @deprecated Prefer Sasist UI Kit (`design-system`): typography tokens, Primary/SecondaryButton,
 * Input/Select, SegmentedControl. Facade kept for existing WMS operational screens.
 */
import {
  ghostButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "../../design-system/components/Button/buttonClasses";
import { inputClassName } from "../../design-system/components/Input";
import { typography } from "../../design-system/tokens";

export const wmsTextBase = "text-[15px] leading-relaxed text-slate-800";
export const wmsTextMeta = "text-[13px] leading-snug text-slate-600";
export const wmsTextLabel = "text-[12px] font-semibold uppercase tracking-wide text-slate-500";
export const wmsTextCode = "font-mono text-[15px] font-bold tabular-nums text-slate-900";
export const wmsTextCodeLg = "font-mono text-lg font-black tabular-nums tracking-tight text-slate-900";

export const wmsBtnPrimary = primaryButtonClass;
export const wmsBtnSecondary = secondaryButtonClass;
export const wmsBtnGhost = ghostButtonClass;

export const wmsInputClass = inputClassName("default", "neutral");
export const wmsSelectClass = wmsInputClass;

export const wmsSectionTitle = typography.section;

/** Prefer `SegmentedControl` from design-system. */
export const wmsSegmentedWrap =
  "inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5";

export const wmsSegmentedBtn = (active: boolean) =>
  `rounded-md px-4 py-2 text-[13px] font-semibold transition ${
    active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
  }`;
