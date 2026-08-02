import { Link } from "react-router-dom";
import {
  dashboardCardPadding,
  dashboardKpiGridGap,
  dashboardSurfaceCard,
} from "../../components/dashboard/dashboardDensityPrimitives";
import { useWarehouseChangePlan } from "../../modules/optymalizacja/useWarehouseChangePlan";
import {
  effectDisplay,
  priorityLabel,
  statusLabel,
} from "../../modules/optymalizacja/warehouseChangePlanStore";

/**
 * Landing Optymalizacji — pulpit planu zmian.
 */
export default function OptymalizacjaLandingPage() {
  const { snapshot, items } = useWarehouseChangePlan();
  const waiting = items.filter((i) => i.status === "nowa" || i.status === "zaplanowana");
  const first = waiting[0] ?? snapshot.topImpact;

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">Optymalizacja</h1>
        <p className="mt-1 text-sm text-slate-600">
          Planowanie zmian w magazynie: problem → analiza → rekomendacja → plan → realizacja.
        </p>
      </div>

      <div className={`grid ${dashboardKpiGridGap} sm:grid-cols-2 lg:grid-cols-4`}>
        <div className={`${dashboardSurfaceCard} ${dashboardCardPadding}`}>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Ile rekomendacji czeka?
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{snapshot.waitingCount}</p>
          <p className="mt-1 text-xs text-slate-500">
            {snapshot.highPriorityCount > 0
              ? `${snapshot.highPriorityCount} z wysokim priorytetem`
              : "Brak pozycji o wysokim priorytecie"}
          </p>
        </div>
        <div className={`${dashboardSurfaceCard} ${dashboardCardPadding}`}>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Które mają największy wpływ?
          </p>
          <p className="mt-2 text-lg font-semibold text-slate-900 leading-snug">
            {first?.title ?? "—"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {first ? `Źródło: ${first.originLabel}` : "Dodaj pierwszą rekomendację"}
          </p>
        </div>
        <div className={`${dashboardSurfaceCard} ${dashboardCardPadding}`}>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Jaką oszczędność / wpływ?
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-900 leading-snug">
            {snapshot.waitingCount === 0 ? "Brak oczekujących zmian" : snapshot.impactSummary}
          </p>
        </div>
        <div className={`${dashboardSurfaceCard} ${dashboardCardPadding}`}>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Co zrobić jako pierwsze?
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-900 leading-snug">
            {first
              ? `${first.title} (${priorityLabel(first.priority)} · ${statusLabel(first.status)})`
              : "Uruchom analizę i dodaj do planu"}
          </p>
          <Link
            to="/optymalizacja/plan"
            className="mt-3 inline-block text-sm font-medium text-blue-700 hover:underline"
          >
            Otwórz plan zmian →
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          to="/optymalizacja/plan"
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Przejdź do planu zmian
        </Link>
        <Link
          to="/optymalizacja/historia"
          className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Historia zmian
        </Link>
        <Link
          to="/optymalizacja/ranking"
          className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Ranking skuteczności
        </Link>
      </div>

      {(snapshot.historyCount > 0 || snapshot.verifiedCount > 0) && (
        <p className="text-sm text-slate-600">
          W historii: <strong>{snapshot.historyCount}</strong> · Zweryfikowane:{" "}
          <strong>{snapshot.verifiedCount}</strong>
        </p>
      )}

      {waiting.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Kolejka planu (top 5)</h2>
            <Link to="/optymalizacja/plan" className="text-sm text-blue-700 hover:underline">
              Zobacz cały plan
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {waiting.slice(0, 5).map((row, idx) => (
              <li key={row.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {idx + 1}. {row.title}
                  </p>
                  <p className="text-xs text-slate-500">
                    Źródło: {row.originLabel} · {effectDisplay(row).primary} · {statusLabel(row.status)}
                  </p>
                </div>
                <Link to={row.sourcePath} className="text-sm text-blue-700 hover:underline">
                  Otwórz analizę
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="text-sm font-semibold text-slate-800 mb-2">Źródła rekomendacji</h2>
        <p className="text-sm text-slate-600 mb-3">
          Analizy nie są osobnymi planami — każda kończy się dodaniem do wspólnego planu zmian.
        </p>
        <div className={`grid ${dashboardKpiGridGap} sm:grid-cols-3`}>
          <Link
            to="/optymalizacja/slotting"
            className={`${dashboardSurfaceCard} ${dashboardCardPadding} block hover:border-blue-300`}
          >
            <p className="font-medium text-slate-900">Układ towaru</p>
            <p className="mt-1 text-xs text-slate-500">Znajdź produkty do przesunięcia</p>
            <p className="mt-2 text-sm text-blue-700">Analizuj układ →</p>
          </Link>
          <Link
            to="/optymalizacja/picking-strategy"
            className={`${dashboardSurfaceCard} ${dashboardCardPadding} block hover:border-blue-300`}
          >
            <p className="font-medium text-slate-900">Strategia kompletacji</p>
            <p className="mt-1 text-xs text-slate-500">Porównaj warianty pracy</p>
            <p className="mt-2 text-sm text-blue-700">Analizuj strategię →</p>
          </Link>
          <Link
            to="/optymalizacja/pick-path"
            className={`${dashboardSurfaceCard} ${dashboardCardPadding} block hover:border-blue-300`}
          >
            <p className="font-medium text-slate-900">Trasy i dystans</p>
            <p className="mt-1 text-xs text-slate-500">Znajdź zbyt długie trasy</p>
            <p className="mt-2 text-sm text-blue-700">Analizuj trasy →</p>
          </Link>
        </div>
      </section>
    </div>
  );
}
