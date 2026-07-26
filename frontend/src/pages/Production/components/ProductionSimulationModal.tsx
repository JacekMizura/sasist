import { AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

import type { ProductionPlanSimulation } from "@/api/productionPlanningApi";
import { EmptyState, PrimaryButton, SecondaryButton } from "@/design-system";
import { AppOverlayPortal } from "../../../components/overlay";
import { erpProductionPaths } from "../productionPaths";

type Props = {
  open: boolean;
  loading: boolean;
  simulation: ProductionPlanSimulation | null;
  onClose: () => void;
  onConfirmCreate: () => void;
  creating: boolean;
  /** Reload planning snapshot (and optionally re-run simulation from parent). */
  onRefreshPlan?: () => void;
  /** Close modal so the user can change coverage days on the planning page. */
  onChangeHorizon?: () => void;
  /** Close modal so the user can review forecast settings on the planning page. */
  onChangeStrategy?: () => void;
};

type EmptyCopy = {
  title: string;
  description: string;
  actions: Array<"refresh" | "horizon" | "strategy" | "recipes">;
};

function resolveEmptyCopy(code: string | null | undefined): EmptyCopy {
  switch (code) {
    case "NO_ACTIVE_RECIPES":
    case "NO_ACTIVE_RECIPE_ON_RECOMMENDATIONS":
      return {
        title: "Żaden produkt nie posiada aktywnej receptury.",
        description: "Produkty nie mogą zostać uwzględnione w planowaniu.",
        actions: ["recipes"],
      };
    case "NO_POSITIVE_RECOMMENDATION":
      return {
        title: "Brak produktów wymagających produkcji.",
        description: "Stan magazynowy pokrywa aktualne zapotrzebowanie.",
        actions: ["refresh", "horizon"],
      };
    case "NO_REQUEST_LINES":
    case "NO_CANDIDATES":
      return {
        title: "Brak dodatnich rekomendacji.",
        description: "MRP nie wyliczyło żadnej partii do utworzenia.",
        actions: ["refresh", "strategy"],
      };
    case "ALL_CANDIDATES_SKIPPED":
      return {
        title: "Brak dodatnich rekomendacji.",
        description: "MRP nie wyliczyło żadnej partii do utworzenia.",
        actions: ["refresh", "strategy"],
      };
    default:
      return {
        title: "Brak dodatnich rekomendacji.",
        description: "MRP nie wyliczyło żadnej partii do utworzenia.",
        actions: ["refresh", "horizon"],
      };
  }
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function ProductionSimulationModal({
  open,
  loading,
  simulation,
  onClose,
  onConfirmCreate,
  creating,
  onRefreshPlan,
  onChangeHorizon,
  onChangeStrategy,
}: Props) {
  const navigate = useNavigate();
  if (!open) return null;

  const productCount = simulation?.lines.length ?? 0;
  const hasProducts = productCount > 0;
  const hasMaterialShortage =
    hasProducts && (simulation?.materials.some((m) => m.shortage > 0) ?? false);
  const emptyCopy = !loading && simulation && !hasProducts
    ? resolveEmptyCopy(simulation.diagnostics?.empty_reason_code)
    : null;

  const goToRecipes = () => {
    onClose();
    navigate(erpProductionPaths.recipes);
  };

  return (
    <AppOverlayPortal>
    <div className="fixed inset-0 z-[280] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Symulacja planu produkcji</h2>
            <p className="mt-1 text-sm text-slate-500">Podgląd zużycia surowców i stanu po produkcji — bez tworzenia partii.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Zamknij">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-slate-500">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" aria-hidden />
              <p>Wykonywanie symulacji…</p>
            </div>
          ) : simulation == null ? (
            <EmptyState
              className="py-10 text-center"
              title="Brak wyniku symulacji."
              description="Spróbuj uruchomić symulację ponownie."
            />
          ) : emptyCopy ? (
            <EmptyState
              className="py-8 text-center"
              title={emptyCopy.title}
              description={emptyCopy.description}
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {emptyCopy.actions.includes("refresh") ? (
                    <SecondaryButton type="button" onClick={() => onRefreshPlan?.()}>
                      {emptyCopy.actions.includes("strategy") ? "Odśwież plan" : "Odśwież"}
                    </SecondaryButton>
                  ) : null}
                  {emptyCopy.actions.includes("horizon") ? (
                    <SecondaryButton
                      type="button"
                      onClick={() => {
                        onChangeHorizon?.();
                        onClose();
                      }}
                    >
                      Zmień horyzont planowania
                    </SecondaryButton>
                  ) : null}
                  {emptyCopy.actions.includes("strategy") ? (
                    <SecondaryButton
                      type="button"
                      onClick={() => {
                        onChangeStrategy?.();
                        onClose();
                      }}
                    >
                      Zmień strategię
                    </SecondaryButton>
                  ) : null}
                  {emptyCopy.actions.includes("recipes") ? (
                    <PrimaryButton type="button" onClick={goToRecipes}>
                      Przejdź do receptur
                    </PrimaryButton>
                  ) : null}
                </div>
              }
            />
          ) : (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Produkty" value={String(productCount)} />
                <Stat label="Sztuk łącznie" value={fmt(simulation.total_simulated_quantity)} />
                <Stat label="Nadal krytyczne" value={String(simulation.products_still_critical)} />
              </div>

              {hasMaterialShortage ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
                    <AlertTriangle className="h-4 w-4" aria-hidden />
                    Brakujące surowce
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-amber-900">
                    {simulation.materials
                      .filter((m) => m.shortage > 0)
                      .map((m) => (
                        <li key={m.component_product_id}>
                          {m.component_name}: brakuje {fmt(m.shortage)} (potrzeba {fmt(m.required_total)}, dostępne{" "}
                          {fmt(m.available)})
                        </li>
                      ))}
                  </ul>
                </div>
              ) : (
                <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  Surowce wystarczają na symulowany plan.
                </p>
              )}

              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Produkty</p>
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {simulation.lines.map((ln) => (
                    <li key={ln.product_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                      <span className="font-semibold text-slate-900">{ln.product_name}</span>
                      <span className="tabular-nums text-slate-600">
                        {fmt(ln.simulated_quantity)} szt.
                        {ln.estimated_completion_date ? ` · do ${ln.estimated_completion_date}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3 border-t border-slate-100 px-5 py-4">
          {hasProducts ? (
            <>
              <PrimaryButton
                type="button"
                disabled={creating || loading}
                onClick={onConfirmCreate}
              >
                {creating ? "Tworzenie…" : "Utwórz wszystkie partie"}
              </PrimaryButton>
              <SecondaryButton type="button" onClick={onClose}>
                Anuluj
              </SecondaryButton>
            </>
          ) : (
            <SecondaryButton type="button" onClick={onClose}>
              Zamknij
            </SecondaryButton>
          )}
        </div>
      </div>
    </div>
    </AppOverlayPortal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">{value}</p>
    </div>
  );
}
