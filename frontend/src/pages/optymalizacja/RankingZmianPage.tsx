import { Link } from "react-router-dom";
import {
  effectCategoryLabel,
  type EffectCategory,
  type WarehouseChangeItem,
} from "../../modules/optymalizacja/warehouseChangePlanStore";
import { useWarehouseChangePlan } from "../../modules/optymalizacja/useWarehouseChangePlan";
import {
  analizyCtaPrimaryClass,
  analizyCtaSecondaryClass,
  analizyEmptyStateClass,
  analizyPageSubtitleClass,
  analizyPageTitleClass,
} from "../../modules/analizy/analizyUi";

const CATEGORIES: { id: EffectCategory; title: string }[] = [
  { id: "trasy", title: "Największe skrócenie tras" },
  { id: "wydajnosc", title: "Największy wzrost wydajności" },
  { id: "dead_stock", title: "Największa redukcja zalegającego towaru" },
  { id: "lokalizacje", title: "Największa poprawa wykorzystania lokalizacji" },
];

function RankList({ items }: { items: WarehouseChangeItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-slate-500 px-1">
        Brak zweryfikowanych zmian z mierzalnym efektem w tej kategorii.
      </p>
    );
  }
  return (
    <ol className="space-y-2">
      {items.slice(0, 5).map((row, idx) => (
        <li
          key={row.id}
          className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2"
        >
          <div>
            <p className="text-sm font-medium text-slate-900">
              {idx + 1}. {row.executedDescription || row.title}
            </p>
            <p className="text-xs text-slate-500">
              {row.warehouseName ?? "Magazyn"} · Źródło: {row.originLabel}
            </p>
          </div>
          <p className="text-sm font-semibold text-emerald-700">
            {row.effectDelta?.label ?? "—"}
          </p>
        </li>
      ))}
    </ol>
  );
}

/**
 * Ranking skuteczności wdrożonych zmian — nie ranking użytkowników.
 */
export default function RankingZmianPage() {
  const { ranked } = useWarehouseChangePlan();

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className={analizyPageTitleClass}>Klasyfikacja efektów</h1>
        <p className={analizyPageSubtitleClass}>
          Które wdrożone i zweryfikowane zmiany przyniosły największy mierzalny efekt.
        </p>
      </div>

      {ranked.length === 0 ? (
        <div className={analizyEmptyStateClass}>
          <p className="font-medium text-slate-800">Za mało danych do klasyfikacji</p>
          <p className="mt-1 text-sm text-slate-500">
            Klasyfikacja pojawia się dopiero po stanie „Zweryfikowana” i realnym odczycie PRZED/PO.
            Nie pokazujemy wartości szacunkowych.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link to="/optymalizacja/historia" className={analizyCtaSecondaryClass}>
              Zobacz historię zmian
            </Link>
            <Link to="/optymalizacja/plan" className={analizyCtaPrimaryClass}>
              Otwórz harmonogram zmian
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <h2 className="text-sm font-semibold text-slate-800 mb-3">
              Ogółem — największy efekt (wg |różnicy|)
            </h2>
            <RankList items={ranked} />
          </section>

          {CATEGORIES.map((cat) => {
            const subset = ranked.filter((i) => i.effectCategory === cat.id);
            return (
              <section key={cat.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <h2 className="text-sm font-semibold text-slate-800 mb-1">{cat.title}</h2>
                <p className="text-xs text-slate-500 mb-3">{effectCategoryLabel(cat.id)}</p>
                <RankList items={subset} />
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
