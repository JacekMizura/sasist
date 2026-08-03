import { Link } from "react-router-dom";
import {
  ADMINISTRACJA_LINKS,
} from "../../modules/administracja/administracjaNav";
import {
  analizyPageSubtitleClass,
  analizyPageTitleClass,
} from "../../modules/analizy/analizyUi";

export default function AdministracjaHubPage() {
  return (
    <div className="mx-auto min-w-0 max-w-5xl space-y-8 px-1 sm:px-2">
      <div className="space-y-2">
        <h1 className={analizyPageTitleClass}>Administracja magazynem</h1>
        <p className={`${analizyPageSubtitleClass} max-w-2xl`}>
          Konfiguracja i struktura magazynu — bez funkcji live i bez pracy na hali.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ADMINISTRACJA_LINKS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="group flex flex-col rounded-2xl border border-slate-200/90 bg-white p-5 transition-colors hover:border-slate-300 hover:bg-slate-50/80"
          >
            <h2 className="text-[15px] font-bold text-slate-900 group-hover:text-slate-950">
              {item.title}
            </h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-500">{item.description}</p>
            <span className="mt-4 text-xs font-semibold text-orange-700 opacity-80 group-hover:opacity-100">
              Otwórz →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
