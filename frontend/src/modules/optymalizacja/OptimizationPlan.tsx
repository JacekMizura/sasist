import { Link } from "react-router-dom";

export type OptimizeAction = {
  label: string;
  to?: string;
  onClick?: () => void;
  primary?: boolean;
};

type HeaderProps = {
  title: string;
  question: string;
  decision: string;
};

/** Nagłówek narzędzia Optymalizacji — „co zmienić?” */
export function OptimizationToolHeader({ title, question, decision }: HeaderProps) {
  return (
    <header className="mb-6 space-y-3">
      <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 space-y-2">
        <p>
          <span className="font-semibold text-slate-900">Pytanie: </span>
          {question}
        </p>
        <p>
          <span className="font-semibold text-slate-900">Decyzja: </span>
          {decision}
        </p>
      </div>
    </header>
  );
}

type PlanProps = {
  title?: string;
  summary: string;
  items?: string[];
  actions: OptimizeAction[];
  emptyMessage?: string;
};

const actionClass = (primary?: boolean) =>
  primary
    ? "inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
    : "inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50";

/**
 * Faza 3: rekomendacja z narzędzia → CTA „Dodaj do planu zmian”.
 */
export function OptimizationPlanPanel({
  title = "Rekomendacja",
  summary,
  items,
  actions,
  emptyMessage,
}: PlanProps) {
  const hasItems = items != null && items.length > 0;

  return (
    <section className="mt-8 rounded-xl border-2 border-blue-200 bg-blue-50/60 px-4 py-4 space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-blue-900">{title}</h2>
      <p className="text-sm text-slate-800">{summary}</p>
      {hasItems ? (
        <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1 max-h-40 overflow-y-auto">
          {items!.slice(0, 12).map((line) => (
            <li key={line}>{line}</li>
          ))}
          {items!.length > 12 ? (
            <li className="list-none text-slate-500">…i {items!.length - 12} kolejnych</li>
          ) : null}
        </ul>
      ) : emptyMessage ? (
        <p className="text-sm text-slate-500">{emptyMessage}</p>
      ) : null}
      {actions.length > 0 ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {actions.map((a) =>
            a.onClick ? (
              <button
                key={a.label}
                type="button"
                onClick={a.onClick}
                className={actionClass(a.primary)}
              >
                {a.label}
              </button>
            ) : a.to ? (
              <Link key={a.to + a.label} to={a.to} className={actionClass(a.primary)}>
                {a.label}
              </Link>
            ) : null
          )}
        </div>
      ) : null}
    </section>
  );
}
