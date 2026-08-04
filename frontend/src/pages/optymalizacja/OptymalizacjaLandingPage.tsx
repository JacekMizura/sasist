import { Link } from "react-router-dom";
import { PageHeader } from "../../components/layout/PageHeader";
import { useWarehouseChangePlan } from "../../modules/optymalizacja/useWarehouseChangePlan";
import {
  effectDisplay,
  priorityLabel,
  statusLabel,
} from "../../modules/optymalizacja/warehouseChangePlanStore";
import {
  analizyCtaPrimaryClass,
  analizyCtaSecondaryClass,
  analizyKpiCardClass,
  analizyKpiGridClass,
} from "../../modules/analizy/analizyUi";
import { PLAN_ZMIAN_PATH } from "../../modules/analizy/analizyModuleNav";
import { typography } from "@/design-system";

/**
 * Landing Planu zmian — przegląd w shellu SASIST.
 */
export default function OptymalizacjaLandingPage() {
  const { snapshot, items } = useWarehouseChangePlan();
  const waiting = items.filter((i) => i.status === "nowa" || i.status === "zaplanowana");
  const first = waiting[0] ?? snapshot.topImpact;

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title="Plan zmian"
        subtitle="Długoterminowe zmiany w magazynie: slotting, layout, procesy i symulacje."
        breadcrumbs={[
          { label: "Magazyn", to: "/zarzadzanie-magazynem/pulpit" },
          { label: "Plan zmian", to: PLAN_ZMIAN_PATH },
          { label: "Przegląd" },
        ]}
      />

      <div className={analizyKpiGridClass}>
        <div className={analizyKpiCardClass}>
          <p className={typography.section}>Ile rekomendacji czeka?</p>
          <p className={`mt-2 ${typography.metric}`}>{snapshot.waitingCount}</p>
          <p className={`mt-1 ${typography.caption}`}>
            {snapshot.highPriorityCount > 0
              ? `${snapshot.highPriorityCount} z wysokim priorytetem`
              : "Brak pozycji o wysokim priorytecie"}
          </p>
        </div>
        <div className={analizyKpiCardClass}>
          <p className={typography.section}>Które mają największy wpływ?</p>
          <p className="mt-2 text-lg font-semibold leading-snug text-slate-900">
            {first?.title ?? "—"}
          </p>
          <p className={`mt-1 ${typography.caption}`}>
            {first ? `Źródło: ${first.originLabel}` : "Dodaj pierwszą rekomendację"}
          </p>
        </div>
        <div className={analizyKpiCardClass}>
          <p className={typography.section}>Jaką oszczędność / wpływ?</p>
          <p className="mt-2 text-sm font-semibold leading-snug text-slate-900">
            {snapshot.waitingCount === 0 ? "Brak oczekujących zmian" : snapshot.impactSummary}
          </p>
        </div>
        <div className={analizyKpiCardClass}>
          <p className={typography.section}>Co zrobić jako pierwsze?</p>
          <p className="mt-2 text-sm font-semibold leading-snug text-slate-900">
            {first
              ? `${first.title} (${priorityLabel(first.priority)} · ${statusLabel(first.status)})`
              : "Uruchom analizę i dodaj do harmonogramu"}
          </p>
          <Link to={`${PLAN_ZMIAN_PATH}/plan`} className={`mt-3 ${analizyCtaSecondaryClass}`}>
            Otwórz harmonogram zmian
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link to={`${PLAN_ZMIAN_PATH}/plan`} className={analizyCtaPrimaryClass}>
          Przejdź do harmonogramu zmian
        </Link>
        <Link to={`${PLAN_ZMIAN_PATH}/historia`} className={analizyCtaSecondaryClass}>
          Zobacz historię zmian
        </Link>
        <Link to={`${PLAN_ZMIAN_PATH}/ranking`} className={analizyCtaSecondaryClass}>
          Zobacz klasyfikację skuteczności
        </Link>
      </div>

      {(snapshot.historyCount > 0 || snapshot.verifiedCount > 0) && (
        <p className={typography.bodyMuted}>
          W historii: <strong>{snapshot.historyCount}</strong> · Zweryfikowane:{" "}
          <strong>{snapshot.verifiedCount}</strong>
        </p>
      )}

      {waiting.length > 0 ? (
        <section className="overflow-hidden rounded-xl border border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className={typography.h2}>Kolejka harmonogramu (5 pierwszych)</h2>
            <Link
              to={`${PLAN_ZMIAN_PATH}/plan`}
              className="text-sm font-medium text-orange-700 hover:underline"
            >
              Zobacz cały harmonogram
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {waiting.slice(0, 5).map((row, idx) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className={typography.bodyStrong}>
                    {idx + 1}. {row.title}
                  </p>
                  <p className={typography.caption}>
                    Źródło: {row.originLabel} · {effectDisplay(row).primary} · {statusLabel(row.status)}
                  </p>
                </div>
                <Link to={row.sourcePath} className="text-sm font-medium text-orange-700 hover:underline">
                  Otwórz analizę
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className={typography.h2}>Źródła rekomendacji</h2>
        <p className={typography.bodyMuted}>
          Analizy nie są osobnymi harmonogramami — każda kończy się dodaniem do wspólnego harmonogramu zmian.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Link
            to={`${PLAN_ZMIAN_PATH}/slotting`}
            className={`${analizyKpiCardClass} block transition hover:border-orange-300`}
          >
            <p className={typography.bodyStrong}>Układ towaru</p>
            <p className={`mt-1 ${typography.caption}`}>Znajdź produkty do przesunięcia</p>
            <p className="mt-2 text-sm font-medium text-orange-700">Analizuj układ →</p>
          </Link>
          <Link
            to={`${PLAN_ZMIAN_PATH}/picking-strategy`}
            className={`${analizyKpiCardClass} block transition hover:border-orange-300`}
          >
            <p className={typography.bodyStrong}>Strategia kompletacji</p>
            <p className={`mt-1 ${typography.caption}`}>Porównaj warianty pracy</p>
            <p className="mt-2 text-sm font-medium text-orange-700">Analizuj strategię →</p>
          </Link>
          <Link
            to={`${PLAN_ZMIAN_PATH}/pick-path`}
            className={`${analizyKpiCardClass} block transition hover:border-orange-300`}
          >
            <p className={typography.bodyStrong}>Trasy i dystans</p>
            <p className={`mt-1 ${typography.caption}`}>Znajdź zbyt długie trasy</p>
            <p className="mt-2 text-sm font-medium text-orange-700">Analizuj trasy →</p>
          </Link>
        </div>
      </section>
    </div>
  );
}
