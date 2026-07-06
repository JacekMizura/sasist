import { ChevronRight, Home } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type PageHeaderBreadcrumb = {
  label: string;
  to?: string;
};

type PageHeaderProps = {
  title: ReactNode;
  actions?: ReactNode;
  subtitle?: ReactNode;
  breadcrumbs?: PageHeaderBreadcrumb[];
  tabs?: ReactNode;
  /** Dodatkowe klasy na kontener (np. większy odstęp pod breadcrumb). */
  className?: string;
};

export function PageHeader({ title, actions, subtitle, breadcrumbs = [], tabs, className }: PageHeaderProps) {
  return (
    <section className={className?.trim() ? className : "space-y-3"}>
      {breadcrumbs.length > 0 ? (
        <nav className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500" aria-label="Ścieżka nawigacji">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1 font-medium text-slate-500 transition hover:text-slate-800"
            aria-label="Panel"
          >
            <Home className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
          </Link>
          {breadcrumbs.map((item, idx) => (
            <span key={`${item.label}-${idx}`} className="inline-flex items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" aria-hidden />
              {item.to ? (
                <Link to={item.to} className="font-medium text-slate-500 transition hover:text-slate-800">
                  {item.label}
                </Link>
              ) : (
                <span className="font-medium text-slate-600">{item.label}</span>
              )}
            </span>
          ))}
        </nav>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        {title ? <h1 className="m-0 text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h1> : <span />}
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>

      {subtitle ? <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{subtitle}</p> : null}

      {tabs ? <div className="mt-4">{tabs}</div> : null}
    </section>
  );
}

export type { PageHeaderBreadcrumb, PageHeaderProps };
