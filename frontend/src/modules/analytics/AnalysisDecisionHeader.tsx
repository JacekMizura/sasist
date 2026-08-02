import { Link } from "react-router-dom";

export type AnalysisAction = {
  label: string;
  to: string;
  primary?: boolean;
};

type Props = {
  title: string;
  question: string;
  decision: string;
  actions: AnalysisAction[];
};

/**
 * Manifest: każda analiza = pytanie → decyzja → akcja (CTA).
 */
export function AnalysisDecisionHeader({ title, question, decision, actions }: Props) {
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
      {actions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Link
              key={a.to + a.label}
              to={a.to}
              className={
                a.primary
                  ? "inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  : "inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              }
            >
              {a.label}
            </Link>
          ))}
        </div>
      ) : null}
    </header>
  );
}
