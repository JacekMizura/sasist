import { Link } from "react-router-dom";
import {
  evaluationDisplay,
  statusLabel,
  type ChangeStatus,
} from "../../modules/optymalizacja/warehouseChangePlanStore";
import { useWarehouseChangePlan } from "../../modules/optymalizacja/useWarehouseChangePlan";
import {
  analizyCtaPrimaryClass,
  analizyEmptyStateClass,
  analizyPageSubtitleClass,
  analizyPageTitleClass,
} from "../../modules/analizy/analizyUi";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pl-PL", { dateStyle: "medium" });
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: ChangeStatus }) {
  const styles: Record<string, string> = {
    wdrozona: "bg-emerald-100 text-emerald-800",
    zweryfikowana: "bg-violet-100 text-violet-800",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? "bg-slate-100 text-slate-700"}`}
    >
      {statusLabel(status)}
    </span>
  );
}

/**
 * Historia zmian magazynu — decyzje biznesowe, nie log systemowy.
 */
export default function HistoriaZmianPage() {
  const { history } = useWarehouseChangePlan();

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className={analizyPageTitleClass}>Historia zmian magazynu</h1>
        <p className={analizyPageSubtitleClass}>
          Baza wiedzy organizacji: co wdrożono, skąd rekomendacja, jaki był efekt.
        </p>
      </div>

      {history.length === 0 ? (
        <div className={analizyEmptyStateClass}>
          <p className="font-medium text-slate-800">Brak wdrożonych zmian</p>
          <p className="mt-1 text-sm text-slate-500">
            Po oznaczeniu pozycji w harmonogramie jako „Wdrożona” pojawią się tutaj.
          </p>
          <Link to="/optymalizacja/plan" className={`mt-4 ${analizyCtaPrimaryClass}`}>
            Przejdź do harmonogramu zmian
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {history.map((row) => {
            const ev = evaluationDisplay(row);
            return (
              <li
                key={row.id}
                className="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-500">
                    {formatDate(row.deployedAt || row.updatedAt)}
                  </p>
                  <StatusBadge status={row.status} />
                </div>
                <h2 className="text-base font-semibold text-slate-900">
                  {row.executedDescription || row.title}
                </h2>
                <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Autor
                    </dt>
                    <dd className="mt-0.5 text-slate-800">{row.authorName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Magazyn
                    </dt>
                    <dd className="mt-0.5 text-slate-800">{row.warehouseName ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Źródło
                    </dt>
                    <dd className="mt-0.5 text-slate-800">{row.originLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Stan
                    </dt>
                    <dd className="mt-0.5 text-slate-800">{statusLabel(row.status)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Przewidywany efekt
                    </dt>
                    <dd className="mt-0.5 text-slate-800">{ev.predicted}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Rzeczywisty efekt
                    </dt>
                    <dd className="mt-0.5 text-slate-800">
                      {ev.awaiting ? "Oczekuje na dane" : ev.delta}
                    </dd>
                  </div>
                </dl>
                {(row.status === "wdrozona" || row.status === "zweryfikowana") && (
                  <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-sm">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400 mb-1">
                      Ocena efektów
                    </p>
                    <p className="text-slate-700">
                      PRZED: <strong>{ev.before}</strong>
                      {" → "}
                      PO: <strong>{ev.after}</strong>
                      {" → "}
                      Różnica: <strong>{ev.delta}</strong>
                    </p>
                  </div>
                )}
                <Link
                  to={row.sourcePath}
                  className="inline-block text-sm font-medium text-orange-700 hover:underline"
                >
                  Otwórz analizę źródłową
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
