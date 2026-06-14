import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

type Props = {
  title: string;
  subtitle?: string;
  backTo: string;
  backLabel?: string;
  headerActions?: ReactNode;
  summaryBar?: ReactNode;
  sidebar: ReactNode;
  workspace: ReactNode;
  footer?: ReactNode;
};

/** Layout CAD-style: nawigacja (lewo) + podgląd + panel segmentu (prawo). Tło spójne z OMS (#fff). */
export function ConsolidationRackFormShell({
  title,
  subtitle,
  backTo,
  backLabel = "Lista regałów",
  headerActions,
  summaryBar,
  sidebar,
  workspace,
  footer,
}: Props) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-3.5">
        <Link
          to={backTo}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-base font-bold uppercase tracking-wide text-slate-700">{title}</h1>
            {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          {headerActions ? <div className="flex flex-wrap gap-2">{headerActions}</div> : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-col overflow-hidden bg-white lg:flex-row lg:items-stretch">
        <div className="w-full shrink-0 overflow-y-auto border-b border-slate-200 bg-white px-3 py-3 lg:w-[min(100%,300px)] lg:border-b-0 lg:border-r">
          {sidebar}
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden bg-white px-3 py-3 lg:px-4">
          {summaryBar ? (
            <div className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              {summaryBar}
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-hidden">{workspace}</div>
        </div>
      </div>

      {footer ? (
        <footer className="shrink-0 border-t border-slate-200 bg-white px-5 py-3.5">
          {footer}
        </footer>
      ) : null}
    </div>
  );
}
