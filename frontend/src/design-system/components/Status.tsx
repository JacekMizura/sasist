import type { HTMLAttributes, ReactNode } from "react";
import { toneBadgeClass, toneTextClass, typography, type ColorTone } from "../tokens";
import { radius } from "../tokens";
import { DENSITY_DEFAULT, type UiDensity } from "../tokens/density";

export type StatusTone = ColorTone;

const statusTextSize: Record<UiDensity, string> = {
  compact: "text-xs",
  default: "text-xs",
  comfortable: "text-sm",
};

const statusBadgePad: Record<UiDensity, string> = {
  compact: "px-1.5 py-0.5 text-xs",
  default: "px-2 py-0.5 text-xs",
  comfortable: "px-2.5 py-1 text-xs sm:text-sm",
};

export type StatusTextProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusTone;
  density?: UiDensity;
  children: ReactNode;
};

/** Plain status text (Zapisano / Nie zapisano) — no badge chrome. */
export function StatusText({
  tone = "neutral",
  density = DENSITY_DEFAULT,
  children,
  className = "",
  ...props
}: StatusTextProps) {
  return (
    <span
      className={`shrink-0 font-medium tabular-nums ${statusTextSize[density]} ${toneTextClass[tone]}${className ? ` ${className}` : ""}`.trim()}
      {...props}
    >
      {children}
    </span>
  );
}

export type StatusBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusTone;
  density?: UiDensity;
  children: ReactNode;
};

/** Soft chip status. */
export function StatusBadge({
  tone = "neutral",
  density = DENSITY_DEFAULT,
  children,
  className = "",
  ...props
}: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center ${radius.sm} font-semibold ${statusBadgePad[density]} ${toneBadgeClass[tone]}${className ? ` ${className}` : ""}`.trim()}
      {...props}
    >
      {children}
    </span>
  );
}

/** Alias for StatusBadge (domain naming). */
export function Badge(props: StatusBadgeProps) {
  return <StatusBadge {...props} />;
}

export { typography as statusTypography };
