import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3 } from "lucide-react";
import { getDeadStock, getTenantInventoryValue } from "../../api/analysisApi";
import { PageHeader } from "../../components/layout/PageHeader";
import { AppEmptyState } from "../../components/app-shell";
import { Card, typography } from "@/design-system";
import { brandLinkTextClass } from "../../design-system/brandUi";
import { PLAN_ZMIAN_PATH, ZARZADZANIE_REPORTS_ENTRY } from "../../modules/analizy/analizyModuleNav";

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
 * Przegląd raportów — indeks analiz w shellu SASIST (Layout 2.0).
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
      to: `${ZARZADZANIE_REPORTS_ENTRY}/inventory-value`,
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
      to: `${ZARZADZANIE_REPORTS_ENTRY}/dead-stock`,
      cta: "Znajdź towar do przesunięcia",
    },
    {
      title: "Najczęściej sprzedawane produkty",
      value: "Zestawienie sprzedaży",
      hint: "Które produkty generują największy ruch?",
      decision: "Co trzymać blisko strefy kompletacji?",
      to: `${ZARZADZANIE_REPORTS_ENTRY}/hot-products`,
      cta: "Zobacz najczęściej sprzedawane",
    },
    {
      title: "Najczęściej odwiedzane lokalizacje",
      value: "Obciążenie lokalizacji",
      hint: "Gdzie powstają korki przy kompletacji?",
      decision: "Które strefy odciążyć albo wzmocnić?",
      to: `${ZARZADZANIE_REPORTS_ENTRY}/hot-locations`,
      cta: "Sprawdź przeciążone lokalizacje",
    },
    {
      title: "Produkty zamawiane razem",
      value: "Najczęstsze pary",
      hint: "Które produkty często jadą w jednym zamówieniu?",
      decision: "Czy trzymać je bliżej siebie lub budować zestawy?",
      to: `${ZARZADZANIE_REPORTS_ENTRY}/product-affinity`,
      cta: "Zobacz produkty zamawiane razem",
    },
    {
      title: "Zestawy produktów",
      value: "Zdrowie zestawów",
      hint: "Które zestawy generują braki lub wolną kompletację?",
      decision: "Co poprawić w układzie lub uzupełnianiu?",
      to: `${ZARZADZANIE_REPORTS_ENTRY}/bundle-intelligence`,
      cta: "Sprawdź problemy w zestawach",
    },
    {
      title: "Harmonogram zmian lokalizacji",
      value: "Co zmienić w magazynie",
      hint: "Gdzie warto przenieść towar, żeby skrócić drogę?",
      decision: "Które przesunięcia wdrożyć w pierwszej kolejności?",
      to: `${PLAN_ZMIAN_PATH}/slotting`,
      cta: "Otwórz harmonogram zmian",
    },
  ];

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title="Przegląd"
        subtitle="Co wymaga uwagi? Najważniejsze wskaźniki, skróty do raportów i decyzje do podjęcia."
        breadcrumbs={[
          { label: "Magazyn", to: "/zarzadzanie-magazynem/pulpit" },
          { label: "Raporty", to: ZARZADZANIE_REPORTS_ENTRY },
          { label: "Przegląd" },
        ]}
      />

      {loading ? <p className={typography.bodyMuted}>Ładowanie…</p> : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <p className="font-medium">Błąd</p>
          <p className={`mt-1 ${typography.body}`}>{error}</p>
        </div>
      ) : null}

      {!loading && !error && cards.length === 0 ? (
        <AppEmptyState
          icon={BarChart3}
          title="Brak raportów"
          description="Nie znaleziono analiz do wyświetlenia."
        />
      ) : null}

      {!loading && !error ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <Link key={c.to} to={c.to} className="min-w-0 block">
              <Card variant="listTile" density="comfortable" className="h-full transition hover:border-orange-200">
                <p className={typography.section}>{c.title}</p>
                <p className={`mt-2 ${typography.metric}`}>{c.value}</p>
                <p className={`mt-2 ${typography.bodyMuted}`}>{c.hint}</p>
                <p className={`mt-1 ${typography.caption}`}>{c.decision}</p>
                <p className={`mt-3 text-sm ${brandLinkTextClass}`}>{c.cta} →</p>
              </Card>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
