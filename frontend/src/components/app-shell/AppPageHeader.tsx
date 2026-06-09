import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export type AppPageHeaderBreadcrumb = {
  label: string;
  to?: string;
};

export type AppPageHeaderProps = {
  title: string;
  description?: ReactNode;
  breadcrumbs?: AppPageHeaderBreadcrumb[];
  actions?: ReactNode;
  tabs?: ReactNode;
  /** Dense ERP header — smaller vertical padding. */
  dense?: boolean;
};

export function AppPageHeader({
  title,
  description,
  breadcrumbs = [],
  actions,
  tabs,
  dense = true,
}: AppPageHeaderProps) {
  const pad = dense ? "px-3 py-2.5 sm:px-4" : "px-4 py-3 sm:px-5 sm:py-4";

  return (
    <header className={`border-b border-slate-200/90 bg-white ${pad}`}>
      {breadcrumbs.length > 0 ? (
        <nav className="mb-1 flex flex-wrap items-center gap-1 text-[11px] font-medium text-slate-500" aria-label="Breadcrumb">
          {breadcrumbs.map((crumb, i) => (
            <span key={`${crumb.label}-${i}`} className="inline-flex items-center gap-1">
              {i > 0 ? <ChevronRight className="h-3 w-3 shrink-0 text-slate-400" aria-hidden /> : null}
              {crumb.to ? (
                <Link to={crumb.to} className="hover:text-slate-800 hover:underline">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-slate-700">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">{title}</h1>
          {description ? <p className="mt-0.5 text-[13px] text-slate-600">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {tabs ? <div className="mt-2 -mb-px border-b border-slate-100">{tabs}</div> : null}
    </header>
  );
}
