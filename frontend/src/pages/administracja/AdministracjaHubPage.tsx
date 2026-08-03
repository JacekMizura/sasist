import { Link } from "react-router-dom";
import {
  ADMINISTRACJA_LINKS,
} from "../../modules/administracja/administracjaNav";
import {
  analizyCtaSecondaryClass,
  analizyPageSubtitleClass,
  analizyPageTitleClass,
} from "../../modules/analizy/analizyUi";

export default function AdministracjaHubPage() {
  return (
    <div className="min-w-0 space-y-6 p-4 sm:p-6">
      <div>
        <h1 className={analizyPageTitleClass}>Administracja magazynem</h1>
        <p className={analizyPageSubtitleClass}>
          Konfiguracja i struktura magazynu — bez funkcji live i bez pracy na hali.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ADMINISTRACJA_LINKS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            <h2 className="text-sm font-black text-slate-900">{item.title}</h2>
            <p className="mt-1 text-xs text-slate-600">{item.description}</p>
            <span className={`mt-3 inline-block ${analizyCtaSecondaryClass}`}>Otwórz</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
