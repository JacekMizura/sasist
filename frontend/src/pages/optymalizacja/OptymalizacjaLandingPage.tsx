import { Link } from "react-router-dom";
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
  analizyPageSubtitleClass,
  analizyPageTitleClass,
} from "../../modules/analizy/analizyUi";

/**
 * Landing Optymalizacji — przegląd planu zmian.
 */
export default function OptymalizacjaLandingPage() {
  const { snapshot, items } = useWarehouseChangePlan();
  const waiting = items.filter((i) => i.status === "nowa" || i.status === "zaplanowana");
  const first = waiting[0] ?? snapshot.topImpact;

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className={analizyPageTitleClass}>Optymalizacja</h1>
        <p className={analizyPageSubtitleClass}>
          Planowanie zmian w magazynie: problem → analiza → rekomendacja → harmonogram → realizacja.
        </p>
      </div>

      <div className={analizyKpiGridClass}>
        <div className={analizyKpiCardClass}>
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
        <div className={analizyKpiCardClass}>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Które mają największy wpływ?
          </p>
          <p className="mt-2 text-lg font-semibold leading-snug text-slate-900">
            {first?.title ?? "—"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {first ? `Źródło: ${first.originLabel}` : "Dodaj pierwszą rekomendację"}
          </p>
        </div>
        <div className={analizyKpiCardClass}>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Jaką oszczędność / wpływ?
          </p>
          <p className="mt-2 text-sm font-semibold leading-snug text-slate-900">
            {snapshot.waitingCount === 0 ? "Brak oczekujących zmian" : snapshot.impactSummary}
          </p>
        </div>
        <div className={analizyKpiCardClass}>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Co zrobić jako pierwsze?
          </p>
          <p className="mt-2 text-sm font-semibold leading-snug text-slate-900">
            {first
              ? `${first.title} (${priorityLabel(first.priority)} · ${statusLabel(first.status)})`
              : "Uruchom analizę i dodaj do harmonogramu"}
          </p>
          <Link to="/optymalizacja/plan" className={`mt-3 ${analizyCtaSecondaryClass}`}>
            Otwórz harmonogram zmian
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link to="/optymalizacja/plan" className={analizyCtaPrimaryClass}>
          Przejdź do harmonogramu zmian
        </Link>
        <Link to="/optymalizacja/historia" className={analizyCtaSecondaryClass}>
          Zobacz historię zmian
        </Link>
        <Link to="/optymalizacja/ranking" className={analizyCtaSecondaryClass}>
          Zobacz klasyfikację skuteczności
        </Link>
      </div>

      {(snapshot.historyCount > 0 || snapshot.verifiedCount > 0) && (
        <p className="text-sm text-slate-600">
          W historii: <strong>{snapshot.historyCount}</strong> · Zweryfikowane:{" "}
          <strong>{snapshot.verifiedCount}</strong>
        </p>
      )}

      {waiting.length > 0 ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Kolejka harmonogramu (5 pierwszych)</h2>
            <Link to="/optymalizacja/plan" className="text-sm font-medium text-orange-700 hover:underline">
              Zobacz cały harmonogram
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {waiting.slice(0, 5).map((row, idx) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {idx + 1}. {row.title}
                  </p>
                  <p className="text-xs text-slate-500">
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

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Źródła rekomendacji</h2>
        <p className="mb-3 text-sm text-slate-600">
          Analizy nie są osobnymi harmonogramami — każda kończy się dodaniem do wspólnego harmonogramu zmian.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Link
            to="/optymalizacja/slotting"
            className={`${analizyKpiCardClass} block transition hover:border-orange-300`}
          >
            <p className="font-medium text-slate-900">Układ towaru</p>
            <p className="mt-1 text-xs text-slate-500">Znajdź produkty do przesunięcia</p>
            <p className="mt-2 text-sm font-medium text-orange-700">Analizuj układ →</p>
          </Link>
          <Link
            to="/optymalizacja/picking-strategy"
            className={`${analizyKpiCardClass} block transition hover:border-orange-300`}
          >
            <p className="font-medium text-slate-900">Strategia kompletacji</p>
            <p className="mt-1 text-xs text-slate-500">Porównaj warianty pracy</p>
            <p className="mt-2 text-sm font-medium text-orange-700">Analizuj strategię →</p>
          </Link>
          <Link
            to="/optymalizacja/pick-path"
            className={`${analizyKpiCardClass} block transition hover:border-orange-300`}
          >
            <p className="font-medium text-slate-900">Trasy i dystans</p>
            <p className="mt-1 text-xs text-slate-500">Znajdź zbyt długie trasy</p>
            <p className="mt-2 text-sm font-medium text-orange-700">Analizuj trasy →</p>
          </Link>
        </div>
      </section>
    </div>
  );
}
