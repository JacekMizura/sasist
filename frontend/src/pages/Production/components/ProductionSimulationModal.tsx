import { AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";

import type { ProductionPlanSimulation } from "@/api/productionPlanningApi";
import { PrimaryButton } from "@/design-system/PrimaryButton";
import { AppOverlayPortal } from "../../../components/overlay";

type Props = {
  open: boolean;
  loading: boolean;
  simulation: ProductionPlanSimulation | null;
  onClose: () => void;
  onConfirmCreate: () => void;
  creating: boolean;
};

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
}: Props) {
  if (!open) return null;

  const productCount = simulation?.lines.length ?? 0;
  const hasProducts = productCount > 0;
  const canCreate = !loading && !creating && hasProducts;
  const hasMaterialShortage =
    hasProducts && (simulation?.materials.some((m) => m.shortage > 0) ?? false);

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
            <p className="py-10 text-center text-sm text-slate-500">Brak wyniku symulacji.</p>
          ) : !hasProducts ? (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <p className="text-base font-semibold text-slate-800">
                {simulation.diagnostics?.empty_reason_message
                  ?? "Nie znaleziono produktów z dodatnią rekomendacją produkcji."}
              </p>
              {(simulation.diagnostics?.empty_reason_details?.length ?? 0) > 0 ? (
                <ul className="max-w-md space-y-1 text-left text-sm text-slate-600">
                  {simulation.diagnostics!.empty_reason_details!.map((line) => (
                    <li key={line} className="flex gap-2">
                      <span className="shrink-0 text-slate-400">•</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="max-w-sm text-sm text-slate-500">
                  Symulacja nie zwróciła żadnych produktów.
                </p>
              )}
              {simulation.diagnostics ? (
                <p className="mt-2 max-w-md text-xs text-slate-400">
                  tenant={simulation.diagnostics.tenant_id} · warehouse=
                  {simulation.diagnostics.warehouse_id} · coverage=
                  {simulation.diagnostics.coverage_days}d · strategy=
                  {simulation.diagnostics.forecast_strategy} · źródło=
                  {simulation.diagnostics.input_source}
                </p>
              ) : null}
            </div>
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
          <PrimaryButton
            type="button"
            disabled={!canCreate}
            onClick={onConfirmCreate}
          >
            {creating ? "Tworzenie…" : "Utwórz wszystkie partie"}
          </PrimaryButton>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">
            Anuluj
          </button>
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
