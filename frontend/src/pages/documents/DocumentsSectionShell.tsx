import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  /** Right side: primary actions (e.g. dodaj, import). */
  actions?: ReactNode;
  /** Optional analytics row below header (KPI). */
  kpi?: ReactNode;
  /** Filters / search row. */
  toolbar?: ReactNode;
  children: ReactNode;
};

/**
 * Section header + optional KPI + toolbar — same hierarchy as Wózki (BulkCartList),
 * without nesting a second full-page white card (main card comes from DocumentsLayout).
 */
export function DocumentsSectionShell({ title, subtitle, actions, kpi, toolbar, children }: Props) {
  return (
    <div className="space-y-0">
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
          {subtitle ? <p className="max-w-3xl text-sm leading-relaxed text-slate-600">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>

      {kpi ? <div className="mt-4">{kpi}</div> : null}
      {toolbar ? <div className="mt-4">{toolbar}</div> : null}

      <div className={kpi || toolbar ? "mt-5" : "mt-4"}>{children}</div>
    </div>
  );
}
