/**
 * Global brand UI tokens — Tabs (underline) + Primary (orange) CTA + shared brand accents.
 * Single source of truth: brand orange class strings live ONLY here (and design-system/tokens).
 */

import { primaryButtonClass } from "./components/Button/buttonClasses";

/** Brand orange scale (Tailwind). Change brand color only by editing this object + class strings below. */
export const brandOrange = {
  base: "orange-500",
  hover: "orange-600",
  active: "orange-700",
  text: "orange-600",
  textHover: "orange-700",
  ring: "orange-400",
  softBorder: "orange-200",
  softBg: "orange-50",
  softBgHover: "orange-100",
} as const;

/**
 * Canonical Primary CTA — delegates to UI Kit tokenized class.
 * Prefer the {@link PrimaryButton} component; do not reinvent this class string.
 */
export const brandPrimaryButtonClass = primaryButtonClass;

/**
 * Soft brand action (outline / tinted) — secondary brand actions that are not solid Primary.
 * Same visual as former local orange soft buttons.
 */
export const brandSoftButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700 transition hover:bg-orange-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50";

/** Soft brand panel CTA (full-width tinted). */
export const brandSoftPanelButtonClass =
  "inline-flex w-full items-center justify-center rounded-xl border border-orange-300 bg-orange-50 px-3 py-2.5 text-sm font-semibold text-orange-900 shadow-sm transition hover:bg-orange-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50";

/** Brand outline button (border + text, no fill). */
export const brandOutlineButtonClass =
  "inline-flex items-center justify-center rounded-lg border border-orange-200 px-4 py-2 text-sm font-semibold text-orange-700 transition hover:bg-orange-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50";

/** Brand text link / inline action. */
export const brandLinkTextClass = "font-medium text-orange-600 transition hover:text-orange-700";

/** Compact brand text button (tables / toolbars). */
export const brandLinkButtonClass =
  "text-xs font-medium text-orange-600 underline-offset-2 transition hover:text-orange-700 hover:underline disabled:opacity-50";

/** Brand focus ring fragment for secondary / outline chrome. */
export const brandFocusRingClass =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2";

/** Soft brand table row hover (printing / denselists). */
export const brandSoftRowHoverClass = "hover:bg-orange-50/40";

/** Brand accent text (KPI / emphasis — not a CTA). */
export const brandTextAccentClass = "text-orange-600";

/**
 * Underline tab item — identical size/weight/spacing everywhere.
 * Active: brand orange text + orange underline + semibold.
 * Inactive: neutral text, no underline.
 */
export function brandTabsNavItemClassName(isActive: boolean): string {
  return [
    "shrink-0 whitespace-nowrap border-b-2 -mb-px pb-2.5 text-sm transition-colors",
    isActive
      ? "border-orange-500 font-semibold text-orange-600"
      : "border-transparent font-medium text-slate-500 hover:text-slate-800",
  ].join(" ");
}

/** Nav row for underline tabs (shared shell). */
export const brandTabsNavRowClassName = "flex gap-6 border-b border-slate-200";

/**
 * App sidebar / vertical nav — same brand active language as Tabs, adapted to a rail.
 * Active: orange text + orange icon + left indicator + semibold + soft orange tint.
 * Hover (inactive): neutral slate background (never blue / never orange).
 */
export function brandSidebarNavItemClassName(
  isActive: boolean,
  options?: { compact?: boolean; density?: "rail" | "flyout" },
): string {
  const density = options?.density ?? (options?.compact ? "flyout" : "rail");
  const size =
    density === "flyout"
      ? "min-h-10 gap-3 rounded-xl px-3 py-2.5 text-sm"
      : "gap-2.5 rounded-lg px-3 py-2.5 text-sm";
  return [
    "group relative flex w-full items-center text-left transition-colors duration-150 ease-out",
    size,
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400",
    isActive
      ? "bg-orange-50/70 font-semibold text-orange-600"
      : "font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900",
  ].join(" ");
}

/** Left activity indicator (vertical counterpart of Tabs underline). Full item height, ~3–4px. */
export const brandSidebarNavActiveBarClassName =
  "absolute left-0 top-0 bottom-0 w-[3px] rounded-r-full bg-orange-500";

export function brandSidebarNavIconClassName(isActive: boolean): string {
  return isActive ? "text-orange-600" : "text-slate-600 group-hover:text-slate-900";
}

export function brandSidebarNavChevronClassName(isActive: boolean): string {
  return isActive ? "text-orange-600" : "text-slate-400";
}
