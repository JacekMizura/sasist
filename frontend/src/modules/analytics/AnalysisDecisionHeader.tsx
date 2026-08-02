import { Link } from "react-router-dom";
import {
  analizyCtaPrimaryClass,
  analizyCtaSecondaryClass,
  analizyDecisionBoxClass,
  analizyHeaderStackClass,
  analizyPageTitleClass,
} from "../analizy/analizyUi";

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
      {actions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Link
              key={a.to + a.label}
              to={a.to}
              className={a.primary ? analizyCtaPrimaryClass : analizyCtaSecondaryClass}
            >
              {a.label}
            </Link>
          ))}
        </div>
      ) : null}
    </header>
  );
}
