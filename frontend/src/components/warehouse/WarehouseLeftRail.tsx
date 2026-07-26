import type { ReactNode, RefObject } from "react";
import { useRef } from "react";
import { useWheelScrollBoundaryContain } from "../../hooks/useWheelScrollBoundaryContain";
import { warehouseLeftRailClass, warehouseSectionLabelClass } from "../../design-system";
import { colors } from "../../design-system/tokens";

export type WarehouseLeftRailProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Sole owner of left-rail chrome (width, aside, scroll, padding, background).
 * Content panels must not reimplement this shell.
 */
export function WarehouseLeftRail({ children, className = "" }: WarehouseLeftRailProps) {
  const scrollRef = useRef<HTMLElement>(null);
  useWheelScrollBoundaryContain(scrollRef as RefObject<HTMLElement | null>, true);

  return (
    <aside
      ref={scrollRef}
      className={`${warehouseLeftRailClass}${className ? ` ${className}` : ""}`.trim()}
    >
      {children}
    </aside>
  );
}

export type WarehouseRailSectionProps = {
  title?: ReactNode;
  children: ReactNode;
  /** Top border separator between sections. */
  separated?: boolean;
  className?: string;
  titleClassName?: string;
};

/**
 * Shared section rhythm for warehouse left-rail content:
 * header → content → spacing → optional separator.
 */
export function WarehouseRailSection({
  title,
  children,
  separated = false,
  className = "",
  titleClassName = "",
}: WarehouseRailSectionProps) {
  return (
    <section
      className={[
        separated ? `border-t ${colors.border.soft} pt-2.5` : "",
        "mb-3 last:mb-0",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {title != null && title !== false ? (
        <div
          className={`mb-1.5 ${warehouseSectionLabelClass}${titleClassName ? ` ${titleClassName}` : ""}`.trim()}
        >
          {title}
        </div>
      ) : null}
      {children}
    </section>
  );
}
