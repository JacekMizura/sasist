import type { HTMLAttributes, ReactNode } from "react";
import { pageShellDividerClass } from "../pageLayout";
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
 * Canonical page header vertical rhythm:
 * Breadcrumbs → Title + Actions → Separator → Toolbar → Content (children)
 *
 * No empty toolbar slot — omit `toolbar` when there are no filters/search.
 * Actions are always right-aligned and vertically centered with the title.
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
  const hasTitleRow = Boolean(title || status || actions);
  const hasChrome = hasTitleRow || Boolean(tabs);

  return (
    <header className={`min-w-0${className ? ` ${className}` : ""}`.trim()} {...props}>
      {breadcrumbs ? <div className="min-w-0">{breadcrumbs}</div> : null}

      {hasChrome ? (
        <div
          className={`${pageShellDividerClass} pb-4${breadcrumbs ? ` ${spacing.mt3}` : ""}`.trim()}
        >
          {hasTitleRow ? (
            <div className={`flex min-w-0 flex-wrap items-center justify-between ${spacing.gap3}`}>
              {title ? <div className="min-w-0 flex-1">{title}</div> : <div className="flex-1" />}
              {status || actions ? (
                <div className={`flex shrink-0 flex-wrap items-center justify-end ${spacing.gap2}`}>
                  {status}
                  {actions}
                </div>
              ) : null}
            </div>
          ) : null}
          {tabs ? <div className={hasTitleRow ? spacing.mt3 : undefined}>{tabs}</div> : null}
        </div>
      ) : null}

      {toolbar ? <div className="mt-4">{toolbar}</div> : null}
      {children ? <div className={toolbar ? "mt-5" : "mt-4"}>{children}</div> : null}
    </header>
  );
}
