import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { colors, radius, shadows, spacing } from "../tokens";
import { DENSITY_DEFAULT, densitySegmentPy, type UiDensity } from "../tokens/density";

export type SegmentedControlProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  density?: UiDensity;
};

/** Shell for exclusive choice groups (Magazyn/Sklep, Katalog/Elementy). */
export function SegmentedControl({
  children,
  className = "",
  density = DENSITY_DEFAULT,
  ...props
}: SegmentedControlProps) {
  return (
    <div
      role="group"
      data-density={density}
      className={`flex shrink-0 ${radius.lg} ${colors.surface.page}/80 p-0.5 ${shadows.sm} ring-1 ring-slate-200/60${className ? ` ${className}` : ""}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}

export type SegmentedItemProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  children: ReactNode;
  density?: UiDensity;
};

export function SegmentedItem({
  active = false,
  children,
  className = "",
  type = "button",
  density = DENSITY_DEFAULT,
  ...props
}: SegmentedItemProps) {
  return (
    <button
      type={type}
      aria-pressed={active}
      className={[
        "flex-1",
        radius.md,
        densitySegmentPy[density],
        "text-[11px] font-medium transition-colors",
        active
          ? `${colors.surface.page} ${colors.text.primary} ${shadows.sm} ring-1 ring-slate-200/70`
          : `${colors.neutral.text} hover:text-slate-800`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}

export type TabsProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
};

/** Underline module tabs row (route / page sections). */
export function Tabs({ children, className = "", ...props }: TabsProps) {
  return (
    <nav
      className={`flex gap-6 border-b ${colors.border.default}${className ? ` ${className}` : ""}`.trim()}
      role="tablist"
      {...props}
    >
      {children}
    </nav>
  );
}

export type TabItemProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  children: ReactNode;
};

export function TabItem({
  active = false,
  children,
  className = "",
  type = "button",
  ...props
}: TabItemProps) {
  return (
    <button
      type={type}
      role="tab"
      aria-selected={active}
      className={[
        "shrink-0 whitespace-nowrap border-b-2 -mb-px pb-2.5 text-sm transition-colors",
        active
          ? `${colors.primary.border} font-semibold ${colors.primary.text}`
          : `border-transparent font-medium ${colors.neutral.textMuted} hover:text-slate-800`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </button>
  );
}

export { spacing as tabsSpacing };

