import type { ReactNode } from "react";

export const RETURN_WIDGET_SHELL_CLASS =
  "rounded-xl border border-slate-200/80 bg-white p-5";

export const RETURN_WIDGET_TITLE_CLASS = "text-[15px] font-semibold tracking-tight text-slate-900";

export const RETURN_WIDGET_HINT_CLASS = "mt-0.5 text-[12px] text-slate-500";

export const RETURN_WIDGET_FIELD_CLASS =
  "h-10 w-full rounded-xl border border-slate-200/90 bg-white px-3 text-[13px] text-slate-800 outline-none transition-[border-color,box-shadow] focus:border-slate-300 focus:ring-2 focus:ring-slate-100";

export const RETURN_WIDGET_TEXTAREA_CLASS =
  "w-full resize-y rounded-xl border border-slate-200/90 bg-white px-3 py-2.5 text-[13px] text-slate-800 outline-none transition-[border-color,box-shadow] focus:border-slate-300 focus:ring-2 focus:ring-slate-100";

type Props = {
  title: string;
  icon?: ReactNode;
  actions?: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Shared card chrome for return-detail configurator widgets. */
export function ReturnDetailWidgetShell({ title, icon, actions, hint, children, className = "" }: Props) {
  return (
    <section className={`${RETURN_WIDGET_SHELL_CLASS}${className ? ` ${className}` : ""}`}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {icon ? <span className="shrink-0 text-slate-400">{icon}</span> : null}
            <h2 className={RETURN_WIDGET_TITLE_CLASS}>{title}</h2>
          </div>
          {hint ? <div className={RETURN_WIDGET_HINT_CLASS}>{hint}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function ReturnDetailEmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
      <p className="text-[13px] font-medium text-slate-700">{title}</p>
      {description ? <p className="mt-1 text-[12px] text-slate-500">{description}</p> : null}
    </div>
  );
}

export function ReturnDetailKpiCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/40 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</p>
    </div>
  );
}
