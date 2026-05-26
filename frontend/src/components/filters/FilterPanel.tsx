import type { ReactNode } from "react";

type FilterPanelProps = {
  children: ReactNode;
  className?: string;
  /** `muted` — light gray panel (Sellasist-style list filters). */
  tone?: "white" | "muted";
};

const toneClass: Record<NonNullable<FilterPanelProps["tone"]>, string> = {
  white: "rounded-md border border-slate-200/90 bg-white shadow-sm",
  muted: "rounded-[6px] border border-slate-200/80 bg-slate-100/85 shadow-sm",
};

/** Filter card: subtle border, soft shadow. */
export function FilterPanel({ children, className = "", tone = "white" }: FilterPanelProps) {
  return <div className={`${toneClass[tone]} ${className}`.trim()}>{children}</div>;
}
