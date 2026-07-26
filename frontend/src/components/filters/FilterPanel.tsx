import type { ReactNode } from "react";
import { colors, radius, shadows } from "../../design-system";

type FilterPanelProps = {
  children: ReactNode;
  className?: string;
  /** `muted` — light gray panel (Sellasist-style list filters). */
  tone?: "white" | "muted";
  /** Embedded list chrome sits inside page surface — no drop shadow. */
  elevation?: "sm" | "none";
};

const toneClass: Record<NonNullable<FilterPanelProps["tone"]>, string> = {
  white: `${radius.md} border ${colors.border.soft} ${colors.surface.page}`,
  muted: "rounded-[6px] border border-slate-200/80 bg-slate-100/85",
};

/** Filter card chrome — tokens from Sasist UI Kit. */
export function FilterPanel({
  children,
  className = "",
  tone = "white",
  elevation = "sm",
}: FilterPanelProps) {
  const elevationClass = elevation === "none" ? shadows.none : shadows.sm;
  return <div className={`${toneClass[tone]} ${elevationClass} ${className}`.trim()}>{children}</div>;
}
