import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CHANGE_STATUSES,
  REALIZATION_OPTIONS,
  effectDisplay,
  evaluationDisplay,
  statusLabel,
  type ChangeStatus,
  type WarehouseChangeItem,
} from "../../modules/optymalizacja/warehouseChangePlanStore";
import { useWarehouseChangePlan } from "../../modules/optymalizacja/useWarehouseChangePlan";
import { captureExistingEffectMetric } from "../../modules/optymalizacja/captureEffectMetric";
import { useAuth } from "../../context/AuthContext";
import {
  ANALIZY_DEFAULT_TENANT_ID,
  useWarehouseApiScope,
  type WarehouseApiScope,
} from "../../modules/analizy/warehouseApiScope";
import {
  analizyCtaPrimaryClass,
  analizyCtaSecondaryClass,
  analizyEmptyStateClass,
  analizyKpiCardClass,
  analizyPageSubtitleClass,
  analizyPageTitleClass,
} from "../../modules/analizy/analizyUi";

function StatusBadge({ status }: { status: ChangeStatus }) {
  const styles: Record<ChangeStatus, string> = {
    nowa: "bg-sky-100 text-sky-800",
    zaplanowana: "bg-indigo-100 text-indigo-800",
    w_realizacji: "bg-amber-100 text-amber-900",
    wdrozona: "bg-emerald-100 text-emerald-800",
    zweryfikowana: "bg-violet-100 text-violet-800",
    odrzucona: "bg-slate-200 text-slate-600",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {statusLabel(status)}
    </span>
  );
}

function RealizationPicker({
  item,
  onClose,
  onPick,
}: {
  item: WarehouseChangeItem;
  onClose: () => void;
  onPick: (to: string) => void;
}) {
  const suggested =
    item.source === "slotting"
      ? ["mm", "designer"]
      : item.source === "strategy"
        ? ["strategy", "centrum", "wms"]
        : ["designer", "mm", "strategy"];

  const ordered = [
    ...REALIZATION_OPTIONS.filter((o) => suggested.includes(o.id)),
    ...REALIZATION_OPTIONS.filter((o) => !suggested.includes(o.id)),
  ];

  return (
    <div
      className="absolute right-0 z-20 mt-1 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
      role="dialog"
      aria-label="Wybierz sposób realizacji"
    >
      <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Jak zrealizować zmianę?
      </p>
      <ul className="space-y-0.5">
        {ordered.map((opt) => (
          <li key={opt.id}>
            <button
              type="button"
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-800 hover:bg-blue-50"
              onClick={() => onPick(opt.to)}
            >
              {opt.label}
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="mt-1 w-full rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
        onClick={onClose}
      >
        Anuluj
      </button>
    </div>
  );
}

function authorDisplay(user: {
  first_name: string | null;
  last_name: string | null;
  login: string;
} | null): string {
  if (!user) return "Nieznany";
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return name || user.login || "Nieznany";
}

/**
 * Plan zmian magazynu — pełny cykl życia + ocena efektów.
 */
export default function PlanZmianPage() {
  const { items, remove, clear, snapshot, setStatus, update } = useWarehouseChangePlan();
  const [realizeId, setRealizeId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { scope, warehouse } = useWarehouseApiScope();

  const effectScopeForRow = (row: WarehouseChangeItem): WarehouseApiScope | number | null => {
    if (row.warehouseId != null) {
      return { tenantId: ANALIZY_DEFAULT_TENANT_ID, warehouseId: row.warehouseId };
    }
    return scope;
  };

  const markDeployed = async (row: WarehouseChangeItem) => {
    setBusyId(row.id);
    try {
      const before = await captureExistingEffectMetric(row.source, effectScopeForRow(row));
      update(row.id, {
        status: "wdrozona",
        deployedAt: new Date().toISOString(),
        effectBefore: before,
        authorName: row.authorName === "Nieznany" ? authorDisplay(user) : row.authorName,
        warehouseName: row.warehouseName ?? warehouse?.name ?? null,
        warehouseId: row.warehouseId ?? warehouse?.id ?? null,
        executedDescription: row.executedDescription || row.title,
      });
    } finally {
      setBusyId(null);
    }
  };

  const markVerified = async (row: WarehouseChangeItem) => {
    setBusyId(row.id);
    try {
      const after = await captureExistingEffectMetric(row.source, effectScopeForRow(row));
      update(row.id, {
        status: "zweryfikowana",
        verifiedAt: new Date().toISOString(),
        effectAfter: after,
        // effectDelta wyliczy store z before+after; jeśli after null → „Oczekuje na dane”
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className={analizyPageTitleClass}>Plan zmian magazynu</h1>
          <p className={analizyPageSubtitleClass}>
            Nowa → Zaplanowana → W realizacji → Wdrożona → Zweryfikowana (lub Odrzucona).
          </p>
        </div>
        {items.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Wyczyścić cały plan zmian?")) clear();
            }}
            className={analizyCtaSecondaryClass}
          >
            Wyczyść plan
          </button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className={analizyKpiCardClass}>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Oczekujące</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{snapshot.waitingCount}</p>
        </div>
        <div className={analizyKpiCardClass}>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Priorytet wysoki</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{snapshot.highPriorityCount}</p>
        </div>
        <div className={analizyKpiCardClass}>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">W historii</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{snapshot.historyCount}</p>
        </div>
        <div className={analizyKpiCardClass}>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Zweryfikowane</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{snapshot.verifiedCount}</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className={analizyEmptyStateClass}>
          <p className="font-medium text-slate-700">Plan jest pusty</p>
          <p className="mt-1 text-sm text-slate-500">
            Uruchom analizę i dodaj rekomendację przyciskiem „Dodaj do planu zmian”.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link to="/optymalizacja/slotting" className={analizyCtaPrimaryClass}>
              Analizuj układ towaru
            </Link>
            <Link to="/optymalizacja/picking-strategy" className={analizyCtaSecondaryClass}>
              Porównaj strategie kompletacji
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((row, idx) => {
            const effect = effectDisplay(row);
            const ev = evaluationDisplay(row);
            const isFirstWaiting =
              idx === items.findIndex((i) => i.status === "nowa" || i.status === "zaplanowana");
            return (
              <article
                key={row.id}
                className={`relative rounded-xl border bg-white p-4 ${
                  isFirstWaiting ? "border-orange-300 shadow-sm" : "border-slate-200"
                } ${row.status === "odrzucona" ? "opacity-60" : ""}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={row.status} />
                      {isFirstWaiting ? (
                        <span className="text-xs font-medium text-orange-700">Zrób to jako pierwsze</span>
                      ) : null}
                    </div>
                    <h2 className="text-base font-semibold text-slate-900">{row.title}</h2>
                    {row.description ? (
                      <p className="text-sm text-slate-600">{row.description}</p>
                    ) : null}

                    <dl className="grid gap-2 sm:grid-cols-2 text-sm">
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                          Źródło
                        </dt>
                        <dd className="mt-0.5 text-slate-800">{row.originLabel}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                          Przewidywany efekt
                        </dt>
                        <dd className="mt-0.5 text-slate-800">
                          {effect.primary}
                          {effect.secondary ? (
                            <span className="block text-xs text-slate-500 mt-0.5">
                              {effect.secondary}
                            </span>
                          ) : null}
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
                  </div>

                  <div className="flex flex-col items-stretch gap-2 shrink-0 w-52">
                    <label className="text-xs text-slate-500">
                      Stan
                      <select
                        className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800"
                        value={row.status}
                        disabled={busyId === row.id}
                        onChange={(e) => {
                          const next = e.target.value as ChangeStatus;
                          if (next === "wdrozona") void markDeployed(row);
                          else if (next === "zweryfikowana") void markVerified(row);
                          else setStatus(row.id, next);
                        }}
                      >
                        {CHANGE_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {statusLabel(s)}
                          </option>
                        ))}
                      </select>
                    </label>

                    <Link
                      to={row.sourcePath}
                      className={`${analizyCtaSecondaryClass} justify-center text-center`}
                    >
                      Otwórz analizę źródłową
                    </Link>

                    <div className="relative">
                      <button
                        type="button"
                        className={`w-full ${analizyCtaPrimaryClass}`}
                        onClick={() =>
                          setRealizeId((cur) => (cur === row.id ? null : row.id))
                        }
                      >
                        Wybierz sposób realizacji
                      </button>
                      {realizeId === row.id ? (
                        <RealizationPicker
                          item={row}
                          onClose={() => setRealizeId(null)}
                          onPick={(to) => {
                            setStatus(row.id, "w_realizacji");
                            setRealizeId(null);
                            navigate(to);
                          }}
                        />
                      ) : null}
                    </div>

                    {row.status === "w_realizacji" || row.status === "zaplanowana" ? (
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                        onClick={() => void markDeployed(row)}
                      >
                        Oznacz jako wdrożoną
                      </button>
                    ) : null}

                    {row.status === "wdrozona" ? (
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-900 hover:bg-violet-100 disabled:opacity-50"
                        onClick={() => void markVerified(row)}
                      >
                        Oceń efekty i zweryfikuj
                      </button>
                    ) : null}

                    <Link
                      to="/optymalizacja/historia"
                      className="text-center text-sm font-medium text-orange-700 hover:underline"
                    >
                      Historia zmian
                    </Link>

                    <button
                      type="button"
                      onClick={() => remove(row.id)}
                      className="text-sm text-slate-500 hover:text-red-700"
                    >
                      Usuń z planu
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
