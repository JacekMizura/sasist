import type { HTMLAttributes, ReactNode } from "react";
import { spacing } from "../tokens";

export type ToolbarProps = HTMLAttributes<HTMLDivElement> & {
  /** Left cluster: filters / search / status. */
  start?: ReactNode;
  /** Right cluster: primary actions. */
  end?: ReactNode;
  children?: ReactNode;
};

/** Shared page / module toolbar row. */
export function Toolbar({ start, end, children, className = "", ...props }: ToolbarProps) {
  return (
    <div
      className={`flex min-w-0 flex-wrap items-center justify-between gap-2${className ? ` ${className}` : ""}`.trim()}
      {...props}
    >
      <div className={`flex min-w-0 flex-wrap items-center ${spacing.gap2}`}>
        {start}
        {children}
      </div>
      {end ? <div className={`flex shrink-0 flex-wrap items-center justify-end ${spacing.gap2}`}>{end}</div> : null}
    </div>
  );
}

export type PageHeaderProps = HTMLAttributes<HTMLElement> & {
  breadcrumbs?: ReactNode;
  title?: ReactNode;
  tabs?: ReactNode;
  toolbar?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
};

/**
 * Canonical page header structure:
 * Breadcrumb → Title → Tabs → Toolbar (status + actions)
 */
export function PageHeader({
  breadcrumbs,
  title,
  tabs,
  toolbar,
  status,
  actions,
  className = "",
  children,
  ...props
}: PageHeaderProps) {
  return (
    <header className={`min-w-0${className ? ` ${className}` : ""}`.trim()} {...props}>
      {breadcrumbs ? <div className="min-w-0">{breadcrumbs}</div> : null}
      {(title || status || actions) && (
        <div className={`flex min-w-0 flex-wrap items-start justify-between gap-3 ${breadcrumbs ? "mt-2" : ""}`}>
          {title ? <div className="min-w-0 flex-1">{title}</div> : <div className="flex-1" />}
          <div className={`flex shrink-0 flex-wrap items-center justify-end ${spacing.gap2}`}>
            {status}
            {actions}
          </div>
        </div>
      )}
      {tabs ? <div className="mt-3">{tabs}</div> : null}
      {toolbar ? <div className="mt-3">{toolbar}</div> : null}
      {children}
    </header>
  );
}
