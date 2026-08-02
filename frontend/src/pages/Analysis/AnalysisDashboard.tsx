import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getDeadStock, getTenantInventoryValue } from "../../api/analysisApi";
import {
  dashboardCardPadding,
  dashboardKpiGridGap,
  dashboardSurfaceCard,
} from "../../components/dashboard/dashboardDensityPrimitives";
import {
  analizyPageSubtitleClass,
  analizyPageTitleClass,
} from "../../modules/analizy/analizyUi";

const DEFAULT_TENANT_ID = 1;

type DecisionCard = {
  title: string;
  value: string;
  hint: string;
  decision: string;
  to: string;
  cta: string;
};

/**
 * Przegląd — ekran startowy hubu Analizy (Manifest).
 * Max 7 kart; CTA = czasownik (akcja), nie nazwa modułu.
 */
export default function AnalysisDashboard() {
  const [inventoryValue, setInventoryValue] = useState<number | null>(null);
  const [deadPct, setDeadPct] = useState<number | null>(null);
  const [deadValue, setDeadValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getTenantInventoryValue(DEFAULT_TENANT_ID, true),
      getDeadStock(DEFAULT_TENANT_ID, 90, { limit: 5 }),
    ])
      .then(([inv, dead]) => {
        if (cancelled) return;
        setInventoryValue(inv.total_inventory_value);
        setDeadPct(dead.summary?.dead_percentage ?? null);
        setDeadValue(dead.summary?.dead_stock_value ?? null);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? "Błąd połączenia");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const money = (n: number | null) =>
    n == null
      ? "—"
      : `${new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)} zł`;

  const cards: DecisionCard[] = [
    {
      title: "Wartość zapasów",
      value: money(inventoryValue),
      hint: "Ile kapitału wisi w magazynie?",
      decision: "Gdzie szukać redukcji zamrożonego kapitału?",
      to: "/analytics/inventory-value",
      cta: "Sprawdź wartość zapasów",
    },
    {
      title: "Zalegający towar",
      value:
        deadPct != null
          ? `${deadPct.toFixed(1)}% · ${money(deadValue)}`
          : "—",
      hint: "Co stoi bez rotacji i zamraża pieniądze?",
      decision: "Co przesunąć, przecenić albo nie dokupować?",
      to: "/analytics/dead-stock",
      cta: "Znajdź towar do przesunięcia",
    },
    {
      title: "Najczęściej sprzedawane produkty",
      value: "Zestawienie sprzedaży",
      hint: "Które produkty generują największy ruch?",
      decision: "Co trzymać blisko strefy kompletacji?",
      to: "/analytics/hot-products",
      cta: "Zobacz najczęściej sprzedawane",
    },
    {
      title: "Najczęściej odwiedzane lokalizacje",
      value: "Obciążenie lokalizacji",
      hint: "Gdzie powstają korki przy kompletacji?",
      decision: "Które strefy odciążyć albo wzmocnić?",
      to: "/analytics/hot-locations",
      cta: "Sprawdź przeciążone lokalizacje",
    },
    {
      title: "Produkty zamawiane razem",
      value: "Najczęstsze pary",
      hint: "Które produkty często jadą w jednym zamówieniu?",
      decision: "Czy trzymać je bliżej siebie lub budować zestawy?",
      to: "/analytics/product-affinity",
      cta: "Zobacz produkty zamawiane razem",
    },
    {
      title: "Zestawy produktów",
      value: "Zdrowie zestawów",
      hint: "Które zestawy generują braki lub wolną kompletację?",
      decision: "Co poprawić w układzie lub uzupełnianiu?",
      to: "/analytics/bundle-intelligence",
      cta: "Sprawdź problemy w zestawach",
    },
    {
      title: "Harmonogram zmian lokalizacji",
      value: "Co zmienić w magazynie",
      hint: "Gdzie warto przenieść towar, żeby skrócić drogę?",
      decision: "Które przesunięcia wdrożyć w pierwszej kolejności?",
      to: "/optymalizacja/slotting",
      cta: "Otwórz harmonogram zmian",
    },
  ];

  if (loading) {
    return (
      <div className="min-w-0 space-y-6">
        <div>
          <h1 className={analizyPageTitleClass}>Przegląd</h1>
          <p className={analizyPageSubtitleClass}>
            Co wymaga uwagi? Najważniejsze wskaźniki, skróty do raportów i decyzje do podjęcia.
          </p>
        </div>
        <p className="text-sm text-slate-500">Ładowanie…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-w-0 space-y-6">
        <div>
          <h1 className={analizyPageTitleClass}>Przegląd</h1>
          <p className={analizyPageSubtitleClass}>
            Co wymaga uwagi? Najważniejsze wskaźniki, skróty do raportów i decyzje do podjęcia.
          </p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <p className="font-medium">Błąd</p>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className={analizyPageTitleClass}>Przegląd</h1>
        <p className={analizyPageSubtitleClass}>
          Co wymaga uwagi? Najważniejsze wskaźniki, skróty do raportów i decyzje do podjęcia.
        </p>
      </div>

      <div className={`grid ${dashboardKpiGridGap} sm:grid-cols-2 lg:grid-cols-3`}>
        {cards.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            className={`${dashboardSurfaceCard} ${dashboardCardPadding} block transition hover:border-orange-300 hover:bg-orange-50/40`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{c.title}</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{c.value}</p>
            <p className="mt-2 text-sm text-slate-600">{c.hint}</p>
            <p className="mt-1 text-xs text-slate-500">{c.decision}</p>
            <p className="mt-3 text-sm font-medium text-orange-700">{c.cta} →</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
