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
  preview: ReactNode;
  footer?: ReactNode;
};

/** Układ wzorowany na Twórcy szablonu regału magazynowego — lewa kolumna parametrów, prawa wizualizacja. */
export function ConsolidationRackFormShell({
  title,
  subtitle,
  backTo,
  backLabel = "Lista regałów",
  headerActions,
  summaryBar,
  sidebar,
  preview,
  footer,
}: Props) {
  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
      <div className="shrink-0 border-b border-slate-200/50 bg-slate-50/40 px-5 py-3.5">
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

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="w-full shrink-0 overflow-y-auto border-b border-slate-200/45 bg-slate-50/25 px-4 py-4 lg:w-[38%] lg:min-w-[300px] lg:max-w-[420px] lg:border-b-0 lg:border-r">
          {sidebar}
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden bg-white px-4 py-4">
          {summaryBar ? (
            <div className="shrink-0 rounded-xl border border-slate-200/55 bg-slate-50/40 px-3 py-2.5 text-sm text-slate-700 shadow-sm">
              {summaryBar}
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200/55 bg-white p-3 shadow-sm">
            {preview}
          </div>
        </div>
      </div>

      {footer ? (
        <footer className="shrink-0 border-t border-slate-200/60 bg-white/95 px-5 py-3.5 shadow-[0_-4px_12px_rgba(15,23,42,0.04)]">
          {footer}
        </footer>
      ) : null}
    </div>
  );
}
