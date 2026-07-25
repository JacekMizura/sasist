/**
 * Global brand UI tokens — Tabs (underline) + Primary (orange) CTA.
 * Single source of truth for app-wide visual consistency.
 */

/** Brand orange (Tailwind orange-500 / hover orange-600). */
export const brandOrange = {
  base: "orange-500",
  hover: "orange-600",
  text: "orange-600",
  ring: "orange-400",
} as const;

/**
 * Canonical Primary CTA — Zapisz / Dodaj / Nowy / Importuj / Eksportuj / Drukuj / Wyślij …
 * Height, radius, padding, typography, hover / focus / disabled are fixed here.
 */
export const brandPrimaryButtonClass =
  "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 active:bg-orange-700 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50";

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
