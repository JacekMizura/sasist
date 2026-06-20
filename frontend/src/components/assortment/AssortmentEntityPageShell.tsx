import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, Home } from "lucide-react";

import PageLayout from "../layout/PageLayout";
import { TabsNav, type TabsNavItem } from "../layout/TabsNav";
import { listSellasistToolbarSquareBtn } from "../listPage/listSellasistTokens";

export type AssortmentBreadcrumb = {
  label: string;
  to?: string;
};

type Props = {
  breadcrumbs: AssortmentBreadcrumb[];
  title: string;
  subtitle?: string;
  backTo: string;
  backLabel: string;
  tabs?: TabsNavItem[];
  headerExtra?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

/** Shell edycji encji asortymentu (producent, dostawca) — wzorzec Klienci. */
export function AssortmentEntityPageShell({
  breadcrumbs,
  title,
  subtitle,
  backTo,
  backLabel,
  tabs,
  headerExtra,
  footer,
  children,
}: Props) {
  return (
    <PageLayout fullBleed>
      <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-slate-500" aria-label="Ścieżka nawigacji">
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
              <span className="font-medium text-slate-700">{item.label}</span>
            )}
          </span>
        ))}
      </nav>

      <div className="rounded-xl border border-slate-200/90 bg-white px-4 py-3 shadow-none">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <Link
              to={backTo}
              className={`${listSellasistToolbarSquareBtn} mt-0.5 shrink-0`}
              title={backLabel}
              aria-label={backLabel}
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold leading-tight text-slate-900 sm:text-xl">{title}</h1>
              {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
            </div>
          </div>
          {headerExtra ? <div className="flex shrink-0 flex-wrap items-center gap-2">{headerExtra}</div> : null}
        </div>

        {tabs && tabs.length > 0 ? (
          <div className="mt-4 border-t border-slate-100 pt-3">
            <TabsNav items={tabs} aria-label="Sekcje formularza" className="gap-6" />
          </div>
        ) : null}
      </div>

      <div className="mt-4">{children}</div>

      {footer ? (
        <div className="sticky bottom-0 z-10 mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">{footer}</div>
      ) : null}
    </PageLayout>
  );
}
