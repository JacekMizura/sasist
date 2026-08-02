import { Link } from "react-router-dom";
import {
  analizyCtaPrimaryClass,
  analizyCtaSecondaryClass,
  analizyDecisionBoxClass,
  analizyHeaderStackClass,
  analizyPageTitleClass,
} from "../analizy/analizyUi";

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

/** Nagłówek narzędzia Optymalizacji — „co zmienić?” (ten sam Manifest co raporty). */
export function OptimizationToolHeader({ title, question, decision }: HeaderProps) {
  return (
    <header className={analizyHeaderStackClass}>
      <h1 className={analizyPageTitleClass}>{title}</h1>
      <div className={analizyDecisionBoxClass}>
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
  primary ? analizyCtaPrimaryClass : analizyCtaSecondaryClass;

/**
 * Rekomendacja z narzędzia → CTA „Dodaj do harmonogramu zmian”.
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
    <section className="mt-8 space-y-3 rounded-xl border-2 border-orange-200 bg-orange-50/60 px-4 py-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-orange-900">{title}</h2>
      <p className="text-sm text-slate-800">{summary}</p>
      {hasItems ? (
        <ul className="max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-slate-700">
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
              <button key={a.label} type="button" onClick={a.onClick} className={actionClass(a.primary)}>
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
