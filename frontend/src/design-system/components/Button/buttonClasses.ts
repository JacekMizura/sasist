import {
  colors,
  focus,
  motion,
  radius,
  shadows,
  typography,
  type ColorTone,
} from "../../tokens";
import {
  DENSITY_DEFAULT,
  densityButtonPx,
  densityControlHeight,
  densityControlText,
  densityIconSize,
  type UiDensity,
} from "../../tokens/density";

const disabled =
  "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50";

const baseRow = `inline-flex shrink-0 items-center justify-center gap-1.5 ${motion.transitionFast} ${disabled}`;

export type { UiDensity };

export function primaryButtonClassFor(density: UiDensity = DENSITY_DEFAULT): string {
  return [
    baseRow,
    densityControlHeight[density],
    radius.md,
    colors.primary.bg,
    colors.primary.bgHover,
    colors.primary.bgActive,
    densityButtonPx[density],
    density === "comfortable" ? typography.control : densityControlText[density],
    colors.primary.textOn,
    shadows.sm,
    focus.brand,
  ].join(" ");
}

/** Warning CTA (blocked save / confirm-anyway) — amber, same geometry as Primary. */
export function warningButtonClassFor(density: UiDensity = DENSITY_DEFAULT): string {
  return [
    baseRow,
    densityControlHeight[density],
    radius.md,
    colors.warning.bg,
    colors.warning.bgHover,
    densityButtonPx[density],
    density === "comfortable" ? typography.control : densityControlText[density],
    colors.warning.textOn,
    shadows.sm,
    `focus:outline-none focus-visible:ring-2 ${colors.warning.focusRing} focus-visible:ring-offset-1`,
  ].join(" ");
}

export function secondaryButtonClassFor(density: UiDensity = DENSITY_DEFAULT): string {
  return [
    baseRow,
    densityControlHeight[density],
    radius.md,
    "border",
    colors.border.soft,
    colors.surface.page,
    densityButtonPx[density],
    densityControlText[density],
    colors.text.body,
    "hover:border-slate-300 hover:bg-slate-50",
    focus.neutral,
  ].join(" ");
}

export function dangerButtonClassFor(density: UiDensity = DENSITY_DEFAULT): string {
  return [
    baseRow,
    densityControlHeight[density],
    radius.md,
    colors.danger.bg,
    colors.danger.bgHover,
    densityButtonPx[density],
    density === "comfortable" ? typography.control : densityControlText[density],
    colors.danger.textOn,
    shadows.sm,
    focus.danger,
  ].join(" ");
}

export function dangerOutlineButtonClassFor(density: UiDensity = DENSITY_DEFAULT): string {
  return [
    baseRow,
    densityControlHeight[density],
    radius.md,
    "border",
    colors.danger.border,
    colors.danger.softBg,
    densityButtonPx[density],
    densityControlText[density],
    colors.danger.textStrong,
    colors.danger.softBgHover,
    focus.danger,
  ].join(" ");
}

export function successButtonClassFor(density: UiDensity = DENSITY_DEFAULT): string {
  return [
    baseRow,
    densityControlHeight[density],
    radius.md,
    colors.success.bg,
    colors.success.bgHover,
    densityButtonPx[density],
    density === "comfortable" ? typography.control : densityControlText[density],
    colors.success.textOn,
    shadows.sm,
    `focus:outline-none focus-visible:ring-2 ${colors.success.focusRing} focus-visible:ring-offset-1`,
  ].join(" ");
}

export function ghostButtonClassFor(density: UiDensity = DENSITY_DEFAULT): string {
  return [
    baseRow,
    densityControlHeight[density],
    radius.md,
    "border border-transparent",
    density === "compact" ? "px-1.5" : "px-2",
    densityControlText[density],
    colors.neutral.text,
    "hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900",
    focus.neutral,
  ].join(" ");
}

export function iconButtonClassFor(density: UiDensity = DENSITY_DEFAULT): string {
  return [
    baseRow,
    densityIconSize[density],
    radius.sm,
    "border",
    colors.border.soft,
    colors.surface.page,
    colors.neutral.text,
    "hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900",
    focus.neutral,
  ].join(" ");
}

export function iconButtonDangerClassFor(density: UiDensity = DENSITY_DEFAULT): string {
  return [
    baseRow,
    densityIconSize[density],
    radius.sm,
    "border",
    colors.danger.border,
    colors.danger.softBg,
    colors.danger.textStrong,
    colors.danger.softBgHover,
    focus.danger,
  ].join(" ");
}

export const primaryButtonClass = primaryButtonClassFor("comfortable");
export const secondaryButtonClass = secondaryButtonClassFor("default");
export const dangerButtonClass = dangerButtonClassFor("comfortable");
export const dangerOutlineButtonClass = dangerOutlineButtonClassFor("default");
export const successButtonClass = successButtonClassFor("comfortable");
export const ghostButtonClass = ghostButtonClassFor("default");
export const iconButtonClass = iconButtonClassFor("default");
export const iconButtonDangerClass = iconButtonDangerClassFor("default");

const cardToneText: Record<"neutral" | "emerald" | "rose", string> = {
  neutral: colors.text.secondary,
  emerald: colors.success.textStrong,
  rose: colors.danger.textStrong,
};

export function cardButtonClass(options?: {
  active?: boolean;
  tone?: "neutral" | "emerald" | "rose";
  fullWidth?: boolean;
  density?: UiDensity;
}): string {
  const tone = options?.tone ?? "neutral";
  const density = options?.density ?? "default";
  return [
    baseRow,
    radius.lg,
    "border",
    colors.border.soft,
    colors.surface.page,
    density === "compact" ? "px-2 py-1.5" : density === "comfortable" ? "px-3.5 py-3" : "px-3 py-2.5",
    densityControlText[density],
    cardToneText[tone],
    shadows.card,
    motion.transition,
    "hover:bg-slate-50/90 hover:shadow-md",
    focus.brandSoft,
    options?.fullWidth ? "w-full min-w-0" : "",
    options?.active
      ? `border-transparent shadow-md ring-2 ring-inset ${colors.primary.ringSoft}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export type StatusTone = ColorTone;
