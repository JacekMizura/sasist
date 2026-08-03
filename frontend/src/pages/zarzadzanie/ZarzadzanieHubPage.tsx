import { Link } from "react-router-dom";
import {
  PLAN_ZMIAN_PATH,
  PULPIT_KIEROWNIKA_PATH,
  ZARZADZANIE_REPORTS_ENTRY,
} from "../../modules/analizy/analizyModuleNav";
import {
  analizyCtaPrimaryClass,
  analizyPageSubtitleClass,
  analizyPageTitleClass,
} from "../../modules/analizy/analizyUi";

const CARDS = [
  {
    title: "Pulpit kierownika",
    description: "Nadzór zmiany: alerty, decyzje, dostawy, operatorzy, kolejki.",
    to: PULPIT_KIEROWNIKA_PATH,
    cta: "Otwórz pulpit",
  },
  {
    title: "Raporty",
    description: "Analiza danych magazynu — bez funkcji live.",
    to: ZARZADZANIE_REPORTS_ENTRY,
    cta: "Otwórz raporty",
  },
  {
    title: "Plan zmian",
    description: "Długoterminowe zmiany: slotting, layout, procesy, symulacje.",
    to: PLAN_ZMIAN_PATH,
    cta: "Otwórz plan zmian",
  },
] as const;

/** Wejście stanowiska kierownika — nie od razu do pulpitu. */
export default function ZarzadzanieHubPage() {
  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className={analizyPageTitleClass}>Zarządzanie magazynem</h1>
        <p className={analizyPageSubtitleClass}>
          Stanowisko kierownika: nadzór, decyzje, raporty i planowanie zmian.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((card) => (
          <article
            key={card.to}
            className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h2 className="text-lg font-black text-slate-900">{card.title}</h2>
            <p className="mt-2 flex-1 text-sm text-slate-600">{card.description}</p>
            <Link to={card.to} className={`mt-4 self-start ${analizyCtaPrimaryClass}`}>
              {card.cta}
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
