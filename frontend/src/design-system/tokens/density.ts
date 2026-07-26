/**
 * Density scale for Sasist UI Kit controls.
 * Use one component with `density` prop — never three separate components.
 */

export type UiDensity = "compact" | "default" | "comfortable";

export const DENSITY_DEFAULT: UiDensity = "default";

/** Control height by density. */
export const densityControlHeight: Record<UiDensity, string> = {
  compact: "h-8",
  default: "h-9",
  comfortable: "h-10",
};

/** Icon square by density. */
export const densityIconSize: Record<UiDensity, string> = {
  compact: "h-8 w-8",
  default: "h-9 w-9",
  comfortable: "h-10 w-10",
};

/** Horizontal padding for solid buttons. */
export const densityButtonPx: Record<UiDensity, string> = {
  compact: "px-2.5",
  default: "px-3",
  comfortable: "px-4",
};

/** Field / card inner padding. */
export const densityFieldPad: Record<UiDensity, string> = {
  compact: "px-2 py-1.5",
  default: "px-2.5 py-2",
  comfortable: "px-3 py-2.5",
};

/** Segmented item vertical padding. */
export const densitySegmentPy: Record<UiDensity, string> = {
  compact: "py-1",
  default: "py-1.5",
  comfortable: "py-2",
};

/** Card section padding. */
export const densityCardPad: Record<UiDensity, string> = {
  compact: "p-3",
  default: "p-4",
  comfortable: "p-6",
};

/** Type size for dense controls. */
export const densityControlText: Record<UiDensity, string> = {
  compact: "text-[11px] font-medium leading-none",
  default: "text-[13px] font-medium leading-tight",
  comfortable: "text-sm font-semibold",
};
