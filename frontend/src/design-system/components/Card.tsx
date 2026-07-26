import type { HTMLAttributes, ReactNode } from "react";
import { colors, motion, radius, shadows, typography } from "../tokens";
import { DENSITY_DEFAULT, densityCardPad, type UiDensity } from "../tokens/density";

export type CardVariant = "page" | "section" | "rail" | "listTile" | "dashed";
export type CardDensity = UiDensity;

function variantClass(variant: CardVariant, density: UiDensity): string {
  const pad = densityCardPad[density];
  switch (variant) {
    case "page":
      return `${radius.lg} border ${colors.border.default} ${colors.surface.page}`;
    case "section":
      return `${radius.lg} border ${colors.border.default} ${colors.surface.page} ${pad} ${shadows.sm}`;
    case "rail":
      return `${radius.xl} ${colors.surface.page} ${pad} ${shadows.sm} ring-1 ring-slate-200/60`;
    case "listTile":
      return `${radius.lg} ${colors.surface.page} ${pad} ${shadows.sm} ring-1 ring-slate-200/60 ${motion.transition} hover:bg-slate-50/90 hover:shadow-md`;
    case "dashed":
      return `${radius.md} border ${colors.border.dashed} ${pad} py-16 text-center`;
    default:
      return "";
  }
}

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  variant?: CardVariant;
  density?: CardDensity;
  /** Selected state for listTile / interactive cards. */
  selected?: boolean;
};

export function Card({
  children,
  className = "",
  variant = "section",
  density = DENSITY_DEFAULT,
  selected = false,
  ...props
}: CardProps) {
  const selectedClass =
    selected && (variant === "listTile" || variant === "rail")
      ? `shadow-md ring-2 ${colors.primary.ringSoft}`
      : "";
  return (
    <div
      className={`${variantClass(variant, density)} ${selectedClass}${className ? ` ${className}` : ""}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}

export function cardClassName(
  variant: CardVariant = "section",
  options?: { selected?: boolean; density?: CardDensity; className?: string },
): string {
  const density = options?.density ?? DENSITY_DEFAULT;
  const selectedClass =
    options?.selected && (variant === "listTile" || variant === "rail")
      ? `shadow-md ring-2 ${colors.primary.ringSoft}`
      : "";
  return `${variantClass(variant, density)} ${selectedClass}${options?.className ? ` ${options.className}` : ""}`.trim();
}

export { typography as cardTypography };

